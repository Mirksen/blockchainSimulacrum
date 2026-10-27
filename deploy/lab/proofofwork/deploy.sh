#!/usr/bin/env bash
# Puts one commit of server/ and this stack's files live on the lab host and restarts the app.
#
#   deploy/lab/proofofwork/deploy.sh <ssh-target> [git-ref]     # ref defaults to origin/master
#
# Run it from a checkout after `git fetch`. Extra ssh options go in SSH_OPTS (for example
# SSH_OPTS="-F path/to/ssh_config"). .env, tunnel.env, data/ and static/ on the host stay
# untouched; the previous server/ is kept as server.prev, and DEPLOYED records the commit.
# Exit 0 only if the app reports healthy afterwards.
set -euo pipefail

target="${1:?usage: deploy.sh <ssh-target> [git-ref]}"
ref="${2:-origin/master}"
dir=/opt/lab/proofofwork
commit="$(git rev-parse --verify "$ref^{commit}")"
# shellcheck disable=SC2086,SC2029 # SSH_OPTS is a list of options; dir and commit expand locally on purpose
remote() { ssh ${SSH_OPTS:-} "$target" "$@"; }

echo "deploying $commit ($ref) to $target:$dir"
git archive --format=tar "$commit" server deploy/lab/proofofwork | remote "set -euo pipefail
  cd $dir
  rm -rf .incoming && mkdir .incoming && tar -x -C .incoming
  chmod -R u=rwX,go=rX .incoming/server
  rm -rf server.prev && mv server server.prev && mv .incoming/server server
  for f in compose.yaml .env.example tunnel.env.example; do
    install -m 644 .incoming/deploy/lab/proofofwork/\$f \$f
  done
  rm -rf .incoming
  echo $commit > DEPLOYED
  docker compose up -d --wait
  docker compose restart app
  for i in \$(seq 30); do
    state=\$(docker inspect -f '{{.State.Health.Status}}' \$(docker compose ps -q app))
    [ \"\$state\" = healthy ] && break
    sleep 2
  done
  docker compose ps --format '{{.Service}} {{.Status}}'
  [ \"\$state\" = healthy ]"
echo "live: $commit"
