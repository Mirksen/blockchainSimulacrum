#!/usr/bin/env bash
# Applies one commit to the lab stack on the host. Callers: deploy.sh (manual, over ssh) and
# pull-deploy.sh (systemd timer on the host).
#
#   apply.sh <commit> <src>    # src: a fresh directory with server/, shared/, deploy/lab/proofofwork/
#
# Runs the server tests on <src> in a throwaway container without network, swaps server/ and the
# stack files in, restarts the app and rolls back to the previous files if it does not become
# healthy. DEPLOYED records "<commit> <content fingerprint>"; a commit whose files equal the
# running ones only updates DEPLOYED. .env, tunnel.env, data/ and static/ are never touched.
# Removes <src> when done. Exit 0 = the given commit's files run and the app is healthy.
set -euo pipefail

commit="${1:?usage: apply.sh <commit> <src>}"
src="${2:?usage: apply.sh <commit> <src>}"
dir="${LAB_DIR:-/opt/lab/proofofwork}"
stack="$src/deploy/lab/proofofwork"
trap 'rm -rf "$src"' EXIT
[[ "$commit" =~ ^[0-9a-f]{40}$ ]] || { echo "not a commit id: $commit" >&2; exit 2; }
[ -d "$src/server" ] && [ -f "$stack/compose.yaml" ] || { echo "incomplete source: $src" >&2; exit 2; }

cd "$dir"
exec 9>.deploy.lock
flock -n 9 || { echo "another deploy is running" >&2; exit 1; }

fingerprint="$(cd "$src" && find server shared deploy/lab/proofofwork -type f -print0 | LC_ALL=C sort -z \
  | xargs -0 sha256sum | sha256sum | cut -c1-64)"
running=""
if [ -f DEPLOYED ]; then read -r _ running < DEPLOYED || true; fi
if [ "$fingerprint" = "$running" ]; then
  echo "$commit $fingerprint" > DEPLOYED
  echo "unchanged files, recorded $commit"
  exit 0
fi

# Test gate: the same Node image as the app, read-only source, no network.
image="$(sed -n 's/^ *image: *\(node:[^ ]*\).*/\1/p' "$stack/compose.yaml" | head -n 1)"
chmod -R u=rwX,go=rX "$src"
echo "testing $commit in $image"
docker run --rm --network none --read-only --tmpfs /tmp --user 1000:1000 --cap-drop ALL \
  --security-opt no-new-privileges -v "$src:/src:ro" -w /src/server "$image" \
  node --test 'test/**/*.test.js' > .deploy-test.log 2>&1 \
  || { tail -n 30 .deploy-test.log >&2; echo "tests failed, nothing changed" >&2; exit 1; }

healthy() {
  docker compose up -d --wait --wait-timeout 90 && docker compose restart app >/dev/null || return 1
  local state=""
  for _ in $(seq 45); do
    state="$(docker inspect -f '{{.State.Health.Status}}' "$(docker compose ps -q app)")"
    [ "$state" = healthy ] && return 0
    sleep 2
  done
  return 1
}

stack_files=(compose.yaml .env.example tunnel.env.example)
rm -rf server.prev bin.prev
mv server server.prev
for f in "${stack_files[@]}"; do if [ -f "$f" ]; then cp -p "$f" "$f.prev"; fi; done
if [ -d bin ]; then cp -a bin bin.prev; fi
mv "$src/server" server
for f in "${stack_files[@]}"; do install -m 644 "$stack/$f" "$f"; done
mkdir -p bin && install -m 755 "$stack"/bin/*.sh bin/

if healthy; then
  echo "$commit $fingerprint" > DEPLOYED
  docker compose ps --format '{{.Service}} {{.Status}}'
  echo "live: $commit"
  exit 0
fi

echo "app not healthy with $commit, rolling back" >&2
rm -rf server.failed && mv server server.failed && mv server.prev server
for f in "${stack_files[@]}"; do if [ -f "$f.prev" ]; then mv "$f.prev" "$f"; fi; done
if [ -d bin.prev ]; then rm -rf bin && mv bin.prev bin; fi
healthy && echo "rolled back to the previous files" >&2 || echo "rollback is not healthy either" >&2
exit 1
