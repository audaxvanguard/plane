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


def build():
    tag = revision()
    if shutil.disk_usage(ROOT).free < 25 * 1024**3:
        raise RuntimeError('Build requires at least 25 GiB free disk space.')
    images = image_map(tag)
    builder = 'audax-plane'
    exists = subprocess.run(['docker', 'buildx', 'inspect', builder], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    if exists.returncode:
        run('docker', 'buildx', 'create', '--name', builder, '--driver', 'docker-container',
            '--driver-opt', 'memory=10g', '--driver-opt', 'cpu-period=100000', '--driver-opt', 'cpu-quota=400000')
    for service, context, dockerfile in [
        ('api', 'apps/api', 'apps/api/Dockerfile.api'),
        ('web', '.', 'apps/web/Dockerfile.web'),
        ('admin', '.', 'apps/admin/Dockerfile.admin'),
        ('space', '.', 'apps/space/Dockerfile.space'),
        ('live', '.', 'apps/live/Dockerfile.live'),
        ('proxy', 'apps/proxy', 'apps/proxy/Dockerfile.ce'),
    ]:
        run('docker', 'buildx', 'build', '--builder', builder, '--load', '--progress=plain',
            '--label', f'org.opencontainers.image.revision={tag}',
            '--label', 'org.opencontainers.image.source=https://github.com/audaxvanguard/plane',
            '-t', images[service], '-f', ROOT / dockerfile, ROOT / context)
    print(f'Built {tag}. Deploy explicitly with: python3 deployments/audax/deploy.py deploy', flush=True)


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
    parser.add_argument('action', choices=['build', 'deploy', 'rollback', 'status'])
    parser.add_argument('--allow-migrations', action='store_true')
    parser.add_argument('--confirm-db-compatible', action='store_true')
    args = parser.parse_args()
    STATE.mkdir(parents=True, exist_ok=True, mode=0o700)
    with open(STATE / 'lock', 'w') as lock:
        fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        if args.action == 'build':
            build()
        elif args.action == 'deploy':
            deploy(args.allow_migrations)
        elif args.action == 'rollback':
            rollback(args.confirm_db_compatible)
        else:
            compose('ps')


if __name__ == '__main__':
    main()
