#!/usr/bin/env bash
# Root-only host configuration. Never touches production containers or images.
set -euo pipefail
cd "$(dirname "$(readlink -f "$0")")"
[[ $(id -u) == 0 ]] || { echo 'Run as root.' >&2; exit 1; }
[[ $(stat -fc %T /sys/fs/cgroup) == cgroup2fs ]] || { echo 'cgroup v2 required.' >&2; exit 1; }
mkdir -p /docker/plane-ql3x/audax-deploy
exec 9>/docker/plane-ql3x/audax-deploy/lock
flock -n 9 || { echo 'Another deployment/build is running.' >&2; exit 1; }
if [[ $(docker inspect -f '{{.State.Running}}' buildx_buildkit_audax-plane0 2>/dev/null || true) == true ]]; then
  echo 'Stop the builder after ensuring no build is active; setup refuses to interrupt it.' >&2
  exit 1
fi
install -m 0644 audax-build.slice /etc/systemd/system/audax-build.slice
systemctl daemon-reload
systemctl start audax-build.slice
# Keep the named cache volume; rebuilding the builder changes its cgroup parent.
if docker buildx inspect audax-plane >/dev/null 2>&1; then
  docker buildx rm --keep-state audax-plane
fi
# Buildx's docker-container driver ignores cgroup-parent with systemd Docker.
# Explicitly create the daemon instead, then connect via a private Unix socket.
if docker inspect buildx_buildkit_audax-plane0 >/dev/null 2>&1; then
  docker rm buildx_buildkit_audax-plane0
fi
mkdir -p -m 0700 /docker/plane-ql3x/audax-deploy/buildkit-run
chmod 0700 /docker/plane-ql3x/audax-deploy/buildkit-run
docker create --name buildx_buildkit_audax-plane0 --privileged \
  --cgroup-parent=audax-build.slice --memory=6g --memory-swap=6g \
  --cpu-period=100000 --cpu-quota=150000 --cpu-shares=128 --oom-score-adj=800 \
  --mount type=volume,source=buildx_buildkit_audax-plane0_state,target=/var/lib/buildkit \
  --mount "type=bind,source=$PWD/buildkitd.toml,target=/etc/buildkit/buildkitd.toml,readonly" \
  --mount type=bind,source=/docker/plane-ql3x/audax-deploy/buildkit-run,target=/run/buildkit \
  moby/buildkit:buildx-stable-1 --config /etc/buildkit/buildkitd.toml
docker buildx create --name audax-plane --driver remote \
  unix:///docker/plane-ql3x/audax-deploy/buildkit-run/buildkitd.sock
python3 - <<'PY'
import build_safety as safety
try:
    safety.verify_slice(require_membership=False)
    safety.verify_builder()
    safety.guarded_run(['docker', 'start', safety.BUILDER_CONTAINER])
    safety.verify_builder()
    safety.guarded_run(['docker', 'buildx', 'inspect', 'audax-plane', '--bootstrap'])
finally:
    safety.cleanup_build_containers()
PY
echo 'Protected builder configured and stopped. No production services restarted.'
