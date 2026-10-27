#!/usr/bin/env bash
# Tests bin/apply.sh against a stub `docker` in a temporary stack directory: a failing test gate
# changes nothing, an unhealthy app is rolled back, a healthy one is recorded, and a commit with the
# same files only updates DEPLOYED.
#
#   bash deploy/lab/proofofwork/test/apply.test.sh
set -euo pipefail

here="$(cd "$(dirname "$0")" && pwd)"
apply="$here/../bin/apply.sh"
work="$(mktemp -d)"
trap 'rm -rf "$work"' EXIT
fail=0

# The stub logs its calls; STUB_TESTS and STUB_HEALTH (files) choose test and health outcomes.
mkdir -p "$work/stubbin"
cat > "$work/stubbin/docker" <<'EOF'
#!/usr/bin/env bash
echo "docker $*" >> "$STUB_DIR/calls"
case "$1 $2" in
  "run --rm") exit "$(cat "$STUB_DIR/tests")" ;;
  "compose ps") echo app-container ;;
  "inspect -f") cat "$STUB_DIR/health" ;;
esac
exit 0
EOF
chmod +x "$work/stubbin/docker"
# The host has util-linux flock; a development machine without it gets a pass-through stub.
if ! command -v flock >/dev/null; then printf '#!/bin/sh\nexit 0\n' > "$work/stubbin/flock"; chmod +x "$work/stubbin/flock"; fi
export PATH="$work/stubbin:$PATH" STUB_DIR="$work"
sleep() { :; }; export -f sleep

stack="$work/stack"
setup() {
  rm -rf "$stack" && mkdir -p "$stack/server" && echo old > "$stack/server/main.js"
  echo "old-compose" > "$stack/compose.yaml"
  echo "1111111111111111111111111111111111111111 oldfingerprint" > "$stack/DEPLOYED"
  : > "$work/calls"
}
source_with() {  # source_with <content>: a fresh source tree like git archive produces
  local src; src="$(mktemp -d "$work/src.XXXXXX")"
  mkdir -p "$src/server" "$src/shared" "$src/deploy/lab/proofofwork/bin"
  echo "$1" > "$src/server/main.js"
  printf 'services:\n  app:\n    image: node:24.19.0-alpine\n' > "$src/deploy/lab/proofofwork/compose.yaml"
  touch "$src/deploy/lab/proofofwork/.env.example" "$src/deploy/lab/proofofwork/tunnel.env.example"
  cp "$apply" "$src/deploy/lab/proofofwork/bin/apply.sh"
  echo "$src"
}
check() {  # check <description> <condition...>
  local what="$1"; shift
  if "$@"; then echo "ok   $what"; else echo "FAIL $what"; fail=1; fi
}
run() { LAB_DIR="$stack" bash "$apply" "$@" > "$work/out" 2>&1; }
c2=2222222222222222222222222222222222222222

setup; echo 1 > "$work/tests"; echo healthy > "$work/health"
run "$c2" "$(source_with new)" && rc=0 || rc=$?
check "failing tests: exit non-zero" [ "$rc" -ne 0 ]
check "failing tests: refused by the test gate" grep -q 'tests failed' "$work/out"
check "failing tests: server unchanged" grep -qx old "$stack/server/main.js"
check "failing tests: no restart" bash -c "! grep -q 'compose' '$work/calls'"
check "failing tests: DEPLOYED unchanged" grep -q '^1111' "$stack/DEPLOYED"

setup; echo 0 > "$work/tests"; echo unhealthy > "$work/health"
run "$c2" "$(source_with new)" && rc=0 || rc=$?
check "unhealthy app: exit non-zero" [ "$rc" -ne 0 ]
check "unhealthy app: refused by the health check" grep -q 'rolling back' "$work/out"
check "unhealthy app: old server restored" grep -qx old "$stack/server/main.js"
check "unhealthy app: old compose restored" grep -qx old-compose "$stack/compose.yaml"
check "unhealthy app: failed server kept for inspection" grep -qx new "$stack/server.failed/main.js"
check "unhealthy app: DEPLOYED unchanged" grep -q '^1111' "$stack/DEPLOYED"

setup; echo 0 > "$work/tests"; echo healthy > "$work/health"
run "$c2" "$(source_with new)" && rc=0 || rc=$?
check "healthy app: exit zero" [ "$rc" -eq 0 ]
check "healthy app: new server live" grep -qx new "$stack/server/main.js"
check "healthy app: previous server kept" grep -qx old "$stack/server.prev/main.js"
check "healthy app: DEPLOYED records the commit" grep -q "^$c2 [0-9a-f]\{64\}$" "$stack/DEPLOYED"
check "healthy app: app restarted" grep -q 'compose restart app' "$work/calls"

: > "$work/calls"
c3=3333333333333333333333333333333333333333
run "$c3" "$(source_with new)" && rc=0 || rc=$?
check "same files: exit zero" [ "$rc" -eq 0 ]
check "same files: reported as unchanged" grep -q 'unchanged files' "$work/out"
check "same files: no test run and no restart" bash -c "! grep -q . '$work/calls'"
check "same files: DEPLOYED records the new commit" grep -q "^$c3 " "$stack/DEPLOYED"

run not-a-commit "$(source_with new)" && rc=0 || rc=$?
check "invalid commit id: refused" [ "$rc" -eq 2 ]

check "sources are removed afterwards" bash -c "! ls -d '$work'/src.* >/dev/null 2>&1"
exit "$fail"
