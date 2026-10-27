#!/usr/bin/env bash
# Manual deploy of one commit to the lab host, for a commit that is not on master or when the
# timer is off. The timer (bin/pull-deploy.sh) deploys master on its own; both use bin/apply.sh.
#
#   deploy/lab/proofofwork/deploy.sh <ssh-target> [git-ref]     # ref defaults to origin/master
#
# Run it from a checkout after `git fetch`. Extra ssh options go in SSH_OPTS (for example
# SSH_OPTS="-F path/to/ssh_config"). Exit 0 only if the app runs that commit and is healthy.
# The next timer run puts master back, so a non-master commit stays live only while the timer is off.
set -euo pipefail

target="${1:?usage: deploy.sh <ssh-target> [git-ref]}"
ref="${2:-origin/master}"
commit="$(git rev-parse --verify "$ref^{commit}")"

echo "deploying $commit ($ref) to $target"
# shellcheck disable=SC2086,SC2029 # SSH_OPTS is a list of options; commit expands locally on purpose
git archive --format=tar "$commit" server shared deploy/lab/proofofwork | ssh ${SSH_OPTS:-} "$target" \
  "set -euo pipefail; src=\$(mktemp -d /opt/lab/proofofwork/.incoming.XXXXXX); tar -x -C \"\$src\"
   exec \"\$src/deploy/lab/proofofwork/bin/apply.sh\" $commit \"\$src\""
