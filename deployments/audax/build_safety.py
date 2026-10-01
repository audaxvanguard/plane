"""Fail-closed host guards for low-priority, cgroup-limited VPS build work."""
import json
import os
from pathlib import Path
import re
import signal
import subprocess
import time

GIB = 1024**3
SLICE = 'audax-build.slice'
BUILDER = 'audax-plane'
BUILDER_CONTAINER = 'buildx_buildkit_audax-plane0'
CHECK_CONTAINER = 'audax-plane-check'
BUDGET = 6 * GIB


def parse_meminfo(text):
    values = {}
    for line in text.splitlines():
        key, _, rest = line.partition(':')
        if rest:
            values[key] = int(rest.split()[0]) * 1024
    if 'MemAvailable' not in values:
        raise ValueError('Cannot determine host available memory')
    return values


def parse_pressure(text):
    values = {}
    for line in text.splitlines():
        fields = line.split()
        if fields:
            for field in fields[1:]:
                if field.startswith('avg10='):
                    values[fields[0]] = float(field.split('=')[1])
    if 'some' not in values or 'full' not in values:
        raise ValueError('Cannot determine host memory pressure')
    return values['some'], values['full']


def safety_problem(available, pressure, starting=False):
    minimum = 10 * GIB if starting else 6 * GIB
    if available < minimum:
        return f'Host available RAM {available / GIB:.1f} GiB is below the {minimum / GIB:.0f} GiB safety threshold'
    if pressure[0] >= 5 or pressure[1] >= 1:
        return f'Host memory pressure is too high (some={pressure[0]}%, full={pressure[1]}%)'
    return None


def host_problem(starting=False):
    try:
        mem = parse_meminfo(Path('/proc/meminfo').read_text())
        pressure = parse_pressure(Path('/proc/pressure/memory').read_text())
        return safety_problem(mem['MemAvailable'], pressure, starting)
    except (OSError, ValueError) as error:
        return f'Memory safety monitor unavailable: {error}'


def cleanup_build_containers():
    # These names are exclusively owned by this build workflow, not production.
    for command in (
        ['docker', 'rm', '-f', CHECK_CONTAINER],
        ['docker', 'stop', '--time', '2', BUILDER_CONTAINER],
    ):
        try:
            subprocess.run(command, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, timeout=15)
        except (OSError, subprocess.TimeoutExpired):
            pass


def abort_build_work(process):
    try:
        os.killpg(process.pid, signal.SIGTERM)
    except ProcessLookupError:
        pass
    cleanup_build_containers()
    try:
        process.wait(timeout=10)
    except subprocess.TimeoutExpired:
        try:
            os.killpg(process.pid, signal.SIGKILL)
        except ProcessLookupError:
            pass
        process.wait(timeout=10)


def guarded_run(command):
    problem = host_problem(starting=True)
    if problem:
        raise RuntimeError(f'Refusing build/check: {problem}')
    process = subprocess.Popen(list(map(str, command)), start_new_session=True)
    try:
        while True:
            result = process.poll()
            if result is not None:
                if result:
                    raise subprocess.CalledProcessError(result, command)
                return
            problem = host_problem()
            if problem:
                raise RuntimeError(f'Build/check aborted to protect production: {problem}')
            time.sleep(2)
    except BaseException:
        if process.poll() is None:
            abort_build_work(process)
        raise


def bounded_dockerfile(source):
    # Only build commands change; final runtime ENV/CMD remain untouched.
    source = re.sub(r'pnpm turbo run build(?: --concurrency(?:=| )\d+)?',
                    'NODE_OPTIONS=--max-old-space-size=2560 UV_THREADPOOL_SIZE=1 '
                    'pnpm turbo run build --concurrency=1', source)
    source = source.replace('CI=true pnpm install', 'CI=true npm_config_child_concurrency=1 pnpm install')
    source = source.replace('pip install ', 'MAKEFLAGS=-j1 CARGO_BUILD_JOBS=1 pip install ')
    return source.replace('RUN xcaddy build', 'RUN GOMAXPROCS=1 GOFLAGS="-p=1" xcaddy build')


def check_command(image, command):
    return ['docker', 'run', '--rm', f'--name={CHECK_CONTAINER}',
            f'--cgroup-parent={SLICE}', '--memory=4g', '--memory-swap=4g', '--cpus=1.5',
            '--oom-score-adj=800', '-e', 'NODE_OPTIONS=--max-old-space-size=2560',
            '-e', 'UV_THREADPOOL_SIZE=1', '--entrypoint=/bin/sh', image,
            '-c', 'renice 19 $$ >/dev/null; '
            'if command -v ionice >/dev/null 2>&1; then ionice -c 3 -p $$; fi; '
            'exec "$@"', 'audax-check', *command]


def verify_slice(require_membership=True):
    group = subprocess.check_output(['systemctl', 'show', SLICE, '-p', 'ControlGroup', '--value'], text=True).strip()
    if not group or (require_membership and f'/{SLICE}/' not in Path('/proc/self/cgroup').read_text()):
        raise RuntimeError('Heavy work must run through the protected systemd build unit')
    directory = Path('/sys/fs/cgroup') / group.lstrip('/')
    if directory.joinpath('memory.max').read_text().strip() != str(BUDGET):
        raise RuntimeError('Shared build slice must have a 6 GiB hard memory limit; run setup-build-safety.sh')
    if directory.joinpath('memory.swap.max').read_text().strip() != '0':
        raise RuntimeError('Build swap must be disabled')
    if directory.joinpath('cpu.max').read_text().split() != ['150000', '100000']:
        raise RuntimeError('Shared build CPU limit must be 1.5 CPUs')
    if directory.joinpath('memory.high').read_text().strip() != str(4608 * 1024**2):
        raise RuntimeError('Build memory throttling must start at 4.5 GiB')
    if directory.joinpath('cpu.weight').read_text().strip() != '1':
        raise RuntimeError('Build CPU weight must be low')
    # systemd 255 does not expose this cgroup-v2 flag for slices. Set it on
    # every protected entry (including after reboot), before any heavy work.
    directory.joinpath('memory.oom.group').write_text('1')
    if directory.joinpath('memory.oom.group').read_text().strip() != '1':
        raise RuntimeError('Build group OOM isolation must be enabled')


def verify_builder():
    data = json.loads(subprocess.check_output(['docker', 'inspect', BUILDER_CONTAINER], text=True))[0]
    config = data['HostConfig']
    if not (config['Memory'] == BUDGET and config['MemorySwap'] == BUDGET
            and config['CgroupParent'] == SLICE and config['CpuQuota'] == 150000
            and config['CpuPeriod'] == 100000):
        raise RuntimeError('Builder limits differ from safety policy; run setup-build-safety.sh')
    pid = data['State']['Pid']
    if pid:
        if f'/{SLICE}/' not in Path(f'/proc/{pid}/cgroup').read_text():
            raise RuntimeError('Build daemon is not inside the shared safety slice')
        # Prefer build work as an OOM victim, not live services. Children inherit.
        Path(f'/proc/{pid}/oom_score_adj').write_text('800')
        threads = list(Path(f'/proc/{pid}/task').iterdir())
        for thread in threads:
            try:
                os.setpriority(os.PRIO_PROCESS, int(thread.name), 19)
            except ProcessLookupError:
                pass
        subprocess.run(['ionice', '-c', '3', '-p', *[thread.name for thread in threads]], check=True)


def launch_protected(action, script):
    problem = host_problem(starting=True)
    if problem:
        raise RuntimeError(f'Refusing build/check: {problem}')
    subprocess.run(['systemd-run', '--wait', '--pipe', '--collect',
                    '--unit=audax-plane-build', f'--slice={SLICE}',
                    '--property=Nice=19', '--property=IOSchedulingClass=idle',
                    '--property=OOMScoreAdjust=800', '--property=TimeoutStopSec=15',
                    *[f'--setenv={key}={os.environ[key]}' for key in
                      ('PLANE_COMPOSE', 'PLANE_DEPLOY_STATE', 'PLANE_HEALTH_URL') if key in os.environ],
                    '/usr/bin/python3', str(script), f'_{action}'], check=True)
