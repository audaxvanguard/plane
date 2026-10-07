#!/usr/bin/env python3
# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
"""Actual compiled images, isolated production copy, bounded localhost stack."""
import fcntl
import json
import os
from pathlib import Path
import re
import shlex
import shutil
import subprocess
import sys
import tempfile
import time
import build_safety as safety
import run_custom_fields_tests as runner

ROOT = Path(__file__).resolve().parents[2]
STATE = Path('/docker/plane-ql3x/audax-deploy')
PRODUCTION_COMPOSE = Path('/docker/plane-ql3x/docker-compose.yml')


def validate_revision(value):
    if not re.fullmatch(r'[0-9a-f]{12}', value):
        raise ValueError('An exact 12-character committed candidate revision is required.')
    return value


def override(revision, seed, nginx):
    base = ROOT / 'deployments/audax/custom-fields-test-compose.yml'
    return f'''services:
  api-tests:
    image: audaxvanguard/plane-backend:{revision}
    volumes: !override
      - {seed}:/tmp/seed.py:ro
  compiled-api:
    extends:
      file: {base}
      service: api-tests
    image: audaxvanguard/plane-backend:{revision}
    volumes: !reset []
    mem_limit: 1g
    memswap_limit: 1g
    command: [python, -m, gunicorn, plane.asgi:application, -w, '1', -k, uvicorn.workers.UvicornWorker, -b, '0.0.0.0:8000']
  compiled-web:
    image: audaxvanguard/plane-web:{revision}
    cgroup_parent: audax-build.slice
    cpus: 1.5
    mem_limit: 128m
    memswap_limit: 128m
    oom_score_adj: 800
  compiled-proxy:
    image: nginx:alpine
    cgroup_parent: audax-build.slice
    cpus: 1.5
    mem_limit: 128m
    memswap_limit: 128m
    oom_score_adj: 800
    ports: ['127.0.0.1:15017:80']
    volumes: ['{nginx}:/etc/nginx/conf.d/default.conf:ro']
'''


def redirected(command, path, source=False):
    # Shell quoting is data-only; files live in a private 0700 temporary directory.
    safety.guarded_run(['sh', '-c', shlex.join(command) + (' < ' if source else ' > ') + shlex.quote(str(path))])


def diagnostics(label):
    group = Path('/sys/fs/cgroup/audax.slice/audax-build.slice')
    print(f'Resource checkpoint {label}: slice bytes={group.joinpath("memory.current").read_text().strip()}, '
          f'events={group.joinpath("memory.events").read_text().splitlines()}, '
          f'host PSI={Path("/proc/pressure/memory").read_text().splitlines()}', flush=True)


def main(revision):
    safety.verify_slice()
    if shutil.disk_usage(ROOT).free < 25 * 1024**3:
        raise RuntimeError('Acceptance requires at least 25 GiB free disk.')
    os.umask(0o077)
    with (STATE / 'lock').open('w') as lock, tempfile.TemporaryDirectory(prefix='editable-views-acceptance-', dir=STATE) as temporary:
        fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        diagnostics('before isolated cache reclamation')
        safety.cleanup_build_containers()
        safety.reclaim_build_cache()
        diagnostics('after isolated cache reclamation')
        work = Path(temporary)
        nginx = work / 'nginx.conf'
        nginx.write_text('server { listen 80; location ~ ^/(api|auth|silo)/ { proxy_pass http://compiled-api:8000; proxy_set_header Host $host; } location / { proxy_pass http://compiled-web:3000; proxy_set_header Host $host; } }\n')
        compose = work / 'compose.yml'
        compose.write_text(override(revision, ROOT / 'deployments/audax/editable-views-app-seed.py', nginx))
        runner.compose_command = lambda *args: ['docker', 'compose', '-p', 'audax-custom-fields-test', '-f', str(runner.COMPOSE), '-f', str(compose), *args]
        try:
            runner.guarded_compose('up', '-d', '--wait', 'test-db', 'test-redis')
            dump = work / 'production-copy.dump'
            redirected(['docker', 'compose', '-f', str(PRODUCTION_COMPOSE), 'exec', '-T', 'plane-db', 'sh', '-c', 'pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Fc'], dump)
            redirected(runner.compose_command('exec', '-T', 'test-db', 'pg_restore', '--no-owner', '--no-acl', '-U', 'cf_test', '-d', 'plane_custom_fields_test'), dump, source=True)
            runner.guarded_compose('run', '--rm', '--no-deps', 'api-tests', 'python', 'manage.py', 'migrate', '--noinput')
            runner.guarded_compose('run', '--rm', '--no-deps', 'api-tests', 'python', 'manage.py', 'makemigrations', '--check', '--dry-run')
            seed_output = work / 'seed-output'
            redirected(runner.compose_command('run', '--rm', '--no-deps', 'api-tests', 'python', '/tmp/seed.py'), seed_output)
            data = json.loads(next(line.partition('=')[2] for line in seed_output.read_text().splitlines() if line.startswith('COMPILED_FIXTURE=')))
            fixture = work / 'fixture.json'
            fixture.write_text(json.dumps(data))
            os.environ['CF_APP_FIXTURE'] = str(fixture)
            runner.guarded_compose('up', '-d', 'compiled-api', 'compiled-web', 'compiled-proxy')
            for _ in range(60):
                problem = safety.host_problem()
                if problem:
                    raise RuntimeError(problem)
                response = subprocess.run(['curl', '-fsS', 'http://127.0.0.1:15017/api/instances/'], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
                if response.returncode == 0:
                    break
                time.sleep(2)
            else:
                raise RuntimeError('Private compiled app did not become ready.')
            print(f'Production-copy migrations and private compiled startup passed for {revision}.', flush=True)
            diagnostics('compiled app ready, before browser')
            runner.run_native_browser(['--fixture', 'deployments/audax/test_editable_views_app_browser.mjs'])
        finally:
            diagnostics('before private stack cleanup')
            subprocess.run(runner.compose_command('logs', '--tail', '20', 'compiled-api'), check=False)
            subprocess.run(runner.compose_command('down', '--volumes', '--remove-orphans'), check=True)
            os.environ.pop('CF_APP_FIXTURE', None)


if __name__ == '__main__':
    main(validate_revision(sys.argv[1]))
