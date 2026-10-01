#!/usr/bin/env python3
"""VPS-local builds and explicit deployments; no credentials belong in this repo."""
import argparse
import datetime
import fcntl
import json
import os
from pathlib import Path
import re
import shutil
import subprocess
import time
import urllib.request
import tempfile
import signal
import build_safety as safety

ROOT = Path(__file__).resolve().parents[2]
COMPOSE = Path(os.environ.get('PLANE_COMPOSE', '/docker/plane-ql3x/docker-compose.yml'))
STATE = Path(os.environ.get('PLANE_DEPLOY_STATE', '/docker/plane-ql3x/audax-deploy'))
URL = os.environ.get('PLANE_HEALTH_URL', 'https://plane-ql3x.srv1557363.hstgr.cloud/api/instances/')
WRITERS = ['api', 'worker', 'beat-worker', 'live']
APPS = ['api', 'worker', 'beat-worker', 'web', 'admin', 'space', 'live', 'proxy']


def run(*args, capture=False, **kwargs):
    return subprocess.run(list(map(str, args)), check=True, text=True,
                          stdout=subprocess.PIPE if capture else None, **kwargs)


def compose(*args, **kwargs):
    return run('docker', 'compose', '-f', COMPOSE, *args, **kwargs)


def image_map(tag):
    return {service: f'audaxvanguard/plane-{kind}:{tag}' for service, kind in {
        'api': 'backend', 'worker': 'backend', 'beat-worker': 'backend',
        'migrator': 'backend', 'web': 'web', 'admin': 'admin',
        'space': 'space', 'live': 'live', 'proxy': 'proxy'}.items()}


def replace_images(text, images):
    for service, image in images.items():
        pattern = rf'(^  {re.escape(service)}:\n)(.*?)(?=^  [\w-]+:|^\S|\Z)'
        matches = list(re.finditer(pattern, text, re.M | re.S))
        if len(matches) != 1:
            raise ValueError(f'Expected one service block: {service}')
        match = matches[0]
        block, count = re.subn(r'^    image:.*$', '    image: ' + image,
                               match.group(0), flags=re.M)
        if count != 1:
            raise ValueError(f'Expected one image in {service}')
        text = text[:match.start()] + block + text[match.end():]
    return text


def atomic_write(path, content):
    tmp = path.with_name(path.name + '.audax-tmp')
    mode = path.stat().st_mode & 0o777 if path.exists() else 0o600
    with open(tmp, 'w') as f:
        os.chmod(tmp, mode)
        f.write(content)
    os.replace(tmp, path)


def revision():
    if run('git', '-C', ROOT, 'status', '--porcelain', capture=True).stdout.strip():
        raise RuntimeError('Commit or remove working-tree changes before building/deploying.')
    return run('git', '-C', ROOT, 'rev-parse', '--short=12', 'HEAD', capture=True).stdout.strip()


def prepare_builder():
    safety.verify_slice()
    safety.verify_builder()  # Fail closed BEFORE starting a misconfigured daemon.
    safety.guarded_run(['docker', 'start', safety.BUILDER_CONTAINER])
    safety.verify_builder()
    safety.guarded_run(['docker', 'buildx', 'inspect', safety.BUILDER, '--bootstrap'])


def build_image(image, context, dockerfile, tag, target=None):
    with tempfile.TemporaryDirectory(prefix='audax-safe-build-') as directory:
        bounded = Path(directory) / 'Dockerfile'
        bounded.write_text(safety.bounded_dockerfile((ROOT / dockerfile).read_text()))
        command = ['docker', 'buildx', 'build', '--builder', safety.BUILDER, '--load', '--progress=plain',
                   '--label', f'org.opencontainers.image.revision={tag}',
                   '--label', 'org.opencontainers.image.source=https://github.com/audaxvanguard/plane',
                   '-t', image, '-f', bounded]
        if target:
            command.extend(['--target', target])
        safety.guarded_run([*command, ROOT / context])


def frontend_check(tag):
    image = f'audaxvanguard/plane-web-typecheck:{tag}'
    try:
        build_image(image, '.', 'apps/web/Dockerfile.web', tag, target='installer')
        safety.cleanup_build_containers()  # No builder/check overlap.
        safety.guarded_run(safety.check_command(image, ['pnpm', '--filter', 'web', 'check:types']))
    finally:
        safety.cleanup_build_containers()
        subprocess.run(['docker', 'image', 'rm', image], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)


def build(check_only=False):
    tag = revision()
    if shutil.disk_usage(ROOT).free < 25 * 1024**3:
        raise RuntimeError('Build requires at least 25 GiB free disk space.')
    images = image_map(tag)
    try:
        prepare_builder()
        if not check_only:
            for service, context, dockerfile in [
                ('api', 'apps/api', 'apps/api/Dockerfile.api'),
                ('web', '.', 'apps/web/Dockerfile.web'),
                ('admin', '.', 'apps/admin/Dockerfile.admin'),
                ('space', '.', 'apps/space/Dockerfile.space'),
                ('live', '.', 'apps/live/Dockerfile.live'),
                ('proxy', 'apps/proxy', 'apps/proxy/Dockerfile.ce'),
            ]:
                build_image(images[service], context, dockerfile, tag)
        frontend_check(tag)
    finally:
        safety.cleanup_build_containers()
    if check_only:
        print(f'Frontend type check passed for {tag}.', flush=True)
    else:
        print(f'Built and typechecked {tag}. Deploy explicitly with: python3 deployments/audax/deploy.py deploy', flush=True)


def healthy():
    for _ in range(120):
        try:
            with urllib.request.urlopen(URL, timeout=5) as response:
                if response.status == 200:
                    # The public API probe is supplemented by Docker state checks.
                    ok = True
                    for service in APPS:
                        cid = compose('ps', '-q', service, capture=True).stdout.strip()
                        if not cid:
                            ok = False
                            break
                        state = json.loads(run('docker', 'inspect', cid, capture=True).stdout)[0]['State']
                        if not state.get('Running') or state.get('Health', {}).get('Status', 'healthy') != 'healthy':
                            ok = False
                            break
                    if ok:
                        return
        except (OSError, subprocess.CalledProcessError):
            pass
        time.sleep(5)
    raise RuntimeError('Health verification timed out; inspect logs and use the saved rollback configuration.')


def backup():
    directory = STATE / datetime.datetime.now(datetime.timezone.utc).strftime('%Y%m%dT%H%M%S%fZ')
    directory.mkdir(parents=True, mode=0o700)
    shutil.copy2(COMPOSE, directory / 'docker-compose.yml')
    os.chmod(directory / 'docker-compose.yml', 0o600)
    if (STATE / 'current-revision').exists():
        shutil.copy2(STATE / 'current-revision', directory / 'previous-revision')
    if COMPOSE.with_name('.env').exists():
        shutil.copy2(COMPOSE.with_name('.env'), directory / '.env')
        os.chmod(directory / '.env', 0o600)
    # Capture a restorable, resolved config while keeping credentials root-only.
    atomic_write(directory / 'resolved-compose.json', compose('config', '--format', 'json', capture=True).stdout)
    with open(directory / 'database.dump', 'wb') as f:
        subprocess.run(['docker', 'compose', '-f', str(COMPOSE), 'exec', '-T', 'plane-db',
                        'sh', '-c', 'pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Fc'], stdout=f, check=True)
    cid = compose('ps', '-q', 'plane-minio', capture=True).stdout.strip()
    mounts = json.loads(run('docker', 'inspect', cid, capture=True).stdout)[0]['Mounts']
    source = next(m['Source'] for m in mounts if m['Destination'] == '/export')
    compose('stop', 'plane-minio')
    try:
        run('tar', '-czf', directory / 'uploads.tar.gz', '-C', source, '.')
    finally:
        compose('start', 'plane-minio')
    return directory


def deploy(allow_migrations):
    tag = revision()
    for image in set(image_map(tag).values()):
        run('docker', 'image', 'inspect', image, capture=True)
    compose('config', '--quiet')
    previous = (STATE / 'current-revision').read_text().strip() if (STATE / 'current-revision').exists() else 'v1.4.2'
    changed = run('git', '-C', ROOT, 'diff', '--name-only', previous, 'HEAD', '--', 'apps/api/plane', capture=True).stdout
    if any('/migrations/' in p for p in changed.splitlines()) and not allow_migrations:
        raise RuntimeError('Database migrations changed. Review them, then pass --allow-migrations explicitly.')
    new_config = replace_images(COMPOSE.read_text(), image_map(tag))
    compose('stop', *WRITERS)
    try:
        directory = backup()
    except BaseException:
        compose('start', *WRITERS)
        raise
    atomic_write(STATE / 'last-backup', str(directory) + '\n')
    print(f'Backup: {directory}', flush=True)
    atomic_write(COMPOSE, new_config)
    try:
        compose('config', '--quiet')
        compose('run', '--rm', '--no-deps', 'migrator')
        compose('up', '-d', '--no-deps', '--pull', 'never', *APPS)
        healthy()
    except BaseException:
        print(f'Deployment failed. Backup: {directory}. No automatic DB downgrade attempted.', flush=True)
        raise
    atomic_write(STATE / 'current-revision', tag + '\n')
    print(f'Deployed {tag}; public API and application containers verified.', flush=True)


def rollback(confirmed):
    if not confirmed:
        raise RuntimeError('Rollback needs --confirm-db-compatible; it does not undo database migrations.')
    directory = Path((STATE / 'last-backup').read_text().strip())
    atomic_write(COMPOSE, (directory / 'docker-compose.yml').read_text())
    compose('up', '-d', '--no-deps', '--pull', 'never', *APPS)
    healthy()
    if (directory / 'previous-revision').exists():
        atomic_write(STATE / 'current-revision', (directory / 'previous-revision').read_text())
    else:
        (STATE / 'current-revision').unlink(missing_ok=True)
    print('Previous images restored; database and uploads were not rolled back.')


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('action', choices=['build', 'check', '_build', '_check', 'deploy', 'rollback', 'status'])
    parser.add_argument('--allow-migrations', action='store_true')
    parser.add_argument('--confirm-db-compatible', action='store_true')
    args = parser.parse_args()
    if args.action in ('build', 'check'):
        safety.launch_protected(args.action, Path(__file__).resolve())
        return
    if args.action in ('_build', '_check'):
        safety.verify_slice()
        def terminate_build(signum, frame):
            raise KeyboardInterrupt('Build stopped')
        signal.signal(signal.SIGTERM, terminate_build)
    STATE.mkdir(parents=True, exist_ok=True, mode=0o700)
    with open(STATE / 'lock', 'w') as lock:
        fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        if args.action in ('_build', '_check'):
            build(check_only=args.action == '_check')
        elif args.action == 'deploy':
            deploy(args.allow_migrations)
        elif args.action == 'rollback':
            rollback(args.confirm_db_compatible)
        else:
            compose('ps')


if __name__ == '__main__':
    main()
