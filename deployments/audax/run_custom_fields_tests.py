#!/usr/bin/env python3
"""Resource-limited test jobs. No production secrets, containers or data."""
import argparse
import fcntl
import json
import os
from pathlib import Path
import shutil
import signal
import subprocess
import sys
import tempfile
from urllib.parse import urlparse

import build_safety as safety
import deploy

ROOT = Path(__file__).resolve().parents[2]
COMPOSE = Path(__file__).with_name('custom-fields-test-compose.yml')
TEST_DATABASE_URL = 'postgresql://cf_test:isolated-test-only@test-db:5432/plane_custom_fields_test'
TEST_IMAGE = 'audax-plane-custom-fields-test:working'
BASE_IMAGE = 'audaxvanguard/plane-backend:663c328fd787'
PROJECT = 'audax-custom-fields-test'
STATE = Path('/docker/plane-ql3x/audax-deploy')


def assert_test_database(url):
    parsed = urlparse(url)
    if not (parsed.scheme == 'postgresql' and parsed.hostname == 'test-db'
            and parsed.port in (None, 5432) and parsed.path == '/plane_custom_fields_test'):
        raise RuntimeError('Refusing database outside the private custom-fields test stack')


def compose_env():
    # Do not let inherited Docker/Compose or production env override test config.
    return {**{k: v for k, v in os.environ.items() if not k.startswith(('COMPOSE_', 'CF_'))},
            'CF_SOURCE': str(ROOT / 'apps/api')}


def compose_command(*args):
    return ['docker', 'compose', '-p', PROJECT, '-f', str(COMPOSE), *map(str, args)]


def guarded_compose(*args):
    assert_test_database(TEST_DATABASE_URL)
    # safety.guarded_run inherits environment; pass only source path via -v
    # interpolation from our explicitly normalized process environment.
    old = os.environ.get('CF_SOURCE')
    os.environ['CF_SOURCE'] = str(ROOT / 'apps/api')
    try:
        if args[0] == 'down':
            # Cleanup must execute even when the pressure guard refuses work.
            subprocess.run(compose_command(*args), check=True, env=compose_env(), timeout=40)
        else:
            safety.guarded_run(compose_command(*args))
    finally:
        if old is None:
            os.environ.pop('CF_SOURCE', None)
        else:
            os.environ['CF_SOURCE'] = old


def verify_test_containers():
    ids = subprocess.check_output(compose_command('ps', '-q'), text=True, env=compose_env()).split()
    for cid in ids:
        container = json.loads(subprocess.check_output(['docker', 'inspect', cid], text=True))[0]
        limits = container['HostConfig']
        if limits['CgroupParent'] != safety.SLICE or limits['Memory'] <= 0 or limits['MemorySwap'] != limits['Memory']:
            raise RuntimeError('Test container violates memory/slice policy')
        pid = container['State']['Pid']
        if pid and f'/{safety.SLICE}/' not in Path(f'/proc/{pid}/cgroup').read_text():
            raise RuntimeError('Test container outside protected cgroup')


def ensure_test_image():
    exists = subprocess.run(['docker', 'image', 'inspect', TEST_IMAGE], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    if exists.returncode == 0:
        return
    if shutil.disk_usage(ROOT).free < 25 * 1024**3:
        raise RuntimeError('At least 25 GiB free disk required before test-image build')
    # The remote builder cannot see Docker's local images. A bounded disposable
    # clone avoids recompiling the backend dependencies or exporting a large base.
    safety.cleanup_build_containers()
    installer = 'audax-custom-fields-test-installer'
    try:
        safety.guarded_run(['docker', 'run', '--name', installer,
                            f'--cgroup-parent={safety.SLICE}', '--memory=1g', '--memory-swap=1g',
                            '--cpus=1', '--oom-score-adj=800',
                            '--mount', f'type=bind,source={ROOT / "apps/api/requirements"},target=/test-requirements,readonly',
                            BASE_IMAGE, '/bin/sh', '-c',
                            'renice 19 $$ >/dev/null; exec pip install --no-cache-dir -r /test-requirements/test.txt'])
        safety.guarded_run(['docker', 'commit', installer, TEST_IMAGE])
    finally:
        subprocess.run(['docker', 'rm', '-f', installer], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        safety.cleanup_build_containers()


def run_api_tests(args):
    assert_test_database(TEST_DATABASE_URL)
    try:
        ensure_test_image()
        safety.cleanup_build_containers()
        for service in ('test-db', 'test-redis'):
            guarded_compose('up', '-d', '--wait', service)
        verify_test_containers()
        guarded_compose('run', '--rm', '--no-deps', 'api-tests', 'pytest', '-p', 'no:cacheprovider', *args, '--migrations')
    finally:
        guarded_compose('down', '--volumes', '--remove-orphans')


def helper_path(path):
    path = (ROOT / path).resolve()
    if not path.is_relative_to(ROOT) or not path.is_file():
        raise RuntimeError('Helper test must be a file inside this checkout')
    return path


def run_helpers(args):
    node = os.environ.get('CF_NODE') or shutil.which('node')
    if not node:
        raise RuntimeError('Node runtime not found')
    safety.guarded_run([node, '--max-old-space-size=128', '--experimental-strip-types',
                        '--test', *[helper_path(path) for path in args]])


def run_native_browser(args):
    if not args or args[0] != '--fixture' or len(args) != 2:
        raise RuntimeError('Native browser mode requires an explicit fixture script.')
    script = helper_path(args[1])
    node = os.environ.get('CF_NODE')
    if not node or not Path(node).is_file():
        raise RuntimeError('A resolved Node executable is required.')
    safety.cleanup_build_containers()
    with tempfile.TemporaryDirectory(prefix='audax-cf-browser-') as directory:
        work = Path(directory)
        for name in ('package.json', 'package-lock.json'):
            shutil.copy(ROOT / 'deployments/audax/browser' / name, work / name)
        shutil.copy(script, work / 'run.mjs')
        env = {**os.environ, 'SOURCE_ROOT': str(ROOT), 'CHROME_PATH': '/usr/bin/google-chrome',
               'NODE_OPTIONS': '--max-old-space-size=256',
               'PATH': str(Path(node).parent) + ':' + os.environ.get('PATH', '')}
        previous_cwd = Path.cwd()
        previous_env = dict(os.environ)
        try:
            os.chdir(work)
            os.environ.update(env)
            safety.guarded_run([node, str(Path(node).parent / 'npm'), 'ci', '--ignore-scripts',
                                '--no-audit', '--no-fund', '--cache', str(work / 'cache')])
            safety.guarded_run([node, work / 'run.mjs'])
        finally:
            os.chdir(previous_cwd)
            os.environ.clear()
            os.environ.update(previous_env)


def run_browser(args):
    if Path('/usr/bin/google-chrome').is_file() and args and args[0] == '--fixture':
        return run_native_browser(args)
    package = ROOT / 'deployments/audax/browser'
    script = args[1] if args and args[0] == '--fixture' else 'deployments/audax/browser/smoke.mjs'
    script = helper_path(script)
    safety.cleanup_build_containers()
    command = ['docker', 'run', '--rm', '--name=audax-custom-fields-browser',
               f'--cgroup-parent={safety.SLICE}', '--memory=1g', '--memory-swap=1g', '--cpus=1.5',
               '--oom-score-adj=800', '-e', 'NODE_OPTIONS=--max-old-space-size=256',
               '--mount', f'type=bind,source={ROOT},target=/source,readonly',
               '--tmpfs', '/work:size=64m', '--workdir=/work',
               'mcr.microsoft.com/playwright:v1.58.2-noble', '/bin/sh', '-c',
               'renice 19 $$ >/dev/null; cp /source/deployments/audax/browser/package*.json .; '
               'npm ci --ignore-scripts --no-audit --no-fund --cache /work/npm-cache && '
               'cp "$1" ./run.mjs && node run.mjs', '--', '/source/' + str(script.relative_to(ROOT))]
    try:
        safety.guarded_run(command)
    finally:
        subprocess.run(['docker', 'rm', '-f', 'audax-custom-fields-browser'], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)


def protected_command(mode, args):
    command = ['systemd-run', '--wait', '--pipe', '--collect', '--unit=audax-custom-fields-tests',
               f'--slice={safety.SLICE}', '--property=Nice=19', '--property=IOSchedulingClass=idle',
               '--property=OOMScoreAdjust=800', '--property=MemorySwapMax=0']
    if mode in ('helpers', 'browser'):
        command.extend([f'--property=MemoryMax={"256M" if mode == "helpers" else "1G"}', f'--setenv=CF_NODE={shutil.which("node")}'])
    return [*command, sys.executable, str(Path(__file__).resolve()), '_' + mode, *args]


def handle_interrupt(signum, frame):
    # systemd treats a raw SIGINT exit as clean; cancelled tests must fail.
    raise RuntimeError('Test job interrupted')


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('mode', choices=['api', 'helpers', 'browser', '_api', '_helpers', '_browser'])
    parser.add_argument('args', nargs=argparse.REMAINDER)
    args = parser.parse_args()
    if not args.mode.startswith('_'):
        problem = safety.host_problem(starting=True)
        if problem:
            raise RuntimeError(problem)
        subprocess.run(protected_command(args.mode, args.args), check=True)
        return
    safety.verify_slice()
    os.chdir(ROOT)
    os.environ.update(compose_env())
    signal.signal(signal.SIGTERM, handle_interrupt)
    signal.signal(signal.SIGINT, handle_interrupt)
    with open(STATE / 'lock', 'a') as lock:
        fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        {'_api': run_api_tests, '_helpers': run_helpers, '_browser': run_browser}[args.mode](args.args)


if __name__ == '__main__':
    main()
