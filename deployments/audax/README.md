# Audax VPS deployment

Fork: https://github.com/audaxvanguard/plane · branch: `audax-production`
Baseline: upstream `v1.4.2`. Application behavior is initially unchanged.

Production builds run **on the VPS**, not GitHub Actions. BuildKit is isolated to
four CPUs / 10 GiB RAM, building one image at a time. Existing services keep
running throughout the build. Reserve at least 25 GiB disk space for builds;
inspect disk usage and prune only this builder's old cache when necessary.

## Host layout

- `/opt/plane-audax`: production source worktree
- `/opt/plane-upstream`: persistent parent Git repository (keep both directories)
- `/docker/plane-ql3x/docker-compose.yml`: existing runtime configuration, never committed
- `/docker/plane-ql3x/audax-deploy`: root-only backups, lock, revision state, logs

GitHub authentication stays inside Carol's devbox. No tokens or production
secrets are committed. The fork is public because upstream is public; review
changes for secrets before pushing. Preserve AGPL notices and provide the
corresponding source to users of modified network-accessible versions.

## Update

Review upstream changes and commit tested changes on `audax-production` first.
Do not blindly update from upstream's development branch. On the VPS:

```sh
cd /opt/plane-audax
python3 deployments/audax/test_deploy.py
python3 deployments/audax/deploy.py build
python3 deployments/audax/deploy.py deploy
python3 deployments/audax/deploy.py status
```

Build tags are the 12-character Git commit ID. Builds require a clean worktree.
Deployment refuses missing images and preserves the existing Compose environment,
ports, volumes, networks, SMTP and OmniRoute configuration. The current image
mapping is written into the original Compose file so the hosting panel's normal
Compose operations retain the fork images. Do not redeploy the provider's original
template or pull nonexistent local tags from a registry.

Deployment briefly stops writers, backs up PostgreSQL and uploads (with MinIO
stopped during the upload archive), then runs the migrator and replaces application
containers. Database/Redis/RabbitMQ images and data volumes are not replaced.
Backups contain credentials and application data: keep them private, and copy them
to separate storage for protection against host/disk failure.

Changed migration files require review and `deploy --allow-migrations`. This flag
is not a safety guarantee: test upgrades against a restored copy of the database
before using it. The initial fork uses the same migrations as production.

## Rollback

```sh
python3 deployments/audax/deploy.py rollback --confirm-db-compatible
```

This restores the previous Compose images and waits for health checks. It does
**not** undo migrations or restore data. Use it only when the current database is
compatible with the previous application. If not, arrange a maintenance window
and restore the saved database/upload backup deliberately; this loses writes made
after that backup. Failed deployments are not automatically rolled back across
unknown database changes. Do not delete rollback images until a release is accepted.

The script verifies the public instance API and running/healthy app containers.
Also smoke-test login, projects, uploads, collaboration, SMTP and AI after releases.
The deployment-script unit tests are not a substitute for the full Plane test suite.
