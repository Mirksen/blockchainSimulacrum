#!/usr/bin/env bash
# Runs on the lab host from lab-proofofwork-deploy.timer: fetches master with the read-only deploy
# key and hands a new commit to apply.sh (tests, swap, health check, rollback). The host needs no
# inbound access and GitHub holds no credentials for it. Exit 0 = up to date or deployed.
set -euo pipefail

dir="${LAB_DIR:-/opt/lab/proofofwork}"
etc=/etc/lab/proofofwork
repo="$dir/.mirror.git"
remote=git@github.com:Mirksen/blockchainSimulacrum.git
export GIT_SSH_COMMAND="ssh -i $etc/github_deploy_ed25519 -o IdentitiesOnly=yes -o BatchMode=yes -o StrictHostKeyChecking=yes -o UserKnownHostsFile=$etc/known_hosts"

[ -d "$repo" ] || git init -q --bare "$repo"
git -C "$repo" fetch -q --depth 1 "$remote" +refs/heads/master:refs/heads/master
commit="$(git -C "$repo" rev-parse master)"
deployed=""
if [ -f "$dir/DEPLOYED" ]; then read -r deployed _ < "$dir/DEPLOYED" || true; fi
[ "$commit" = "$deployed" ] && exit 0

src="$(mktemp -d "$dir/.incoming.XXXXXX")"
git -C "$repo" archive master server shared deploy/lab/proofofwork | tar -x -C "$src"
exec "$src/deploy/lab/proofofwork/bin/apply.sh" "$commit" "$src"
