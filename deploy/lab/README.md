# Lab zone

The lab zone holds small, public-facing experiments that run as self-contained Docker
Compose stacks. Each stack lives in its own directory, `/opt/lab/<app>/`, containing
`compose.yaml`, a local `.env` and `tunnel.env` (created from the `*.example` files, never
committed). Host rules for the CAX21 lab zone `172.28.0.0/16`: hausbot-bob
`ops/hetzner-app/SOLL.md`, section "Lab-Zone".

## Rules

1. **Isolated network per stack.** Every stack declares its own bridge network with a
   dedicated subnet (for example `172.28.1.0/24` for `lab-proofofwork`) and IPv6 disabled.
   Stacks never join another stack's network or any shared Docker network.
2. **No reach into private infrastructure.** Lab containers must never reach the private
   network, the tailnet, the host's management services or other Docker networks. The host
   enforces this with firewall rules on the lab subnets (deny to private/RFC 1918, CGNAT and
   tailnet ranges; allow only the public internet). Do not weaken those rules for a lab app;
   an app that needs private access does not belong in the lab zone.
3. **No published ports.** Services do not use `ports:`. Inbound traffic arrives only through
   the stack's own Cloudflare tunnel container (`cloudflared ... run` with a per-stack
   token in `tunnel.env`, which only that container reads), which connects outbound.
4. **Hardened containers.** `read_only: true` (writable state only in named volumes and
   `tmpfs`, data in a bind-mounted `data/` directory), `cap_drop: [ALL]`, `no-new-privileges:true`, non-root user, and explicit
   `mem_limit`, `cpus` and `pids_limit`.
5. **Pinned images.** Images are pinned to explicit versions (or digests); no `latest`.
6. **Secrets stay local.** Real values live only in `/opt/lab/<app>/.env` and `tunnel.env`
   (0600) on the host. Repositories contain `*.example` files with placeholders only.
7. **Portable by construction.** Nothing in a stack depends on host-specific paths, host
   networking or provider runtime services. State lives in the stack's `data/` directory.

## Updating a stack (`lab-proofofwork`)

A merge to `master` goes live on its own. On the host, `lab-proofofwork-deploy.timer` runs
`bin/pull-deploy.sh` every five minutes: it fetches `master` with a read-only GitHub deploy key and
hands a new commit to `bin/apply.sh`, which

1. runs the server tests on that commit in a throwaway container without network,
2. swaps in `server/` and the stack files (previous ones kept as `*.prev`),
3. restarts the app and waits until it is healthy, and otherwise rolls back to the previous files.

`DEPLOYED` holds the running commit and a fingerprint of its files; a commit that changes nothing
here only updates `DEPLOYED`. `.env`, `tunnel.env`, `data/` and `static/` are never touched. The host
needs no inbound access and GitHub holds no credentials for it. Check a run with
`journalctl -u lab-proofofwork-deploy -n 50`; a failed deploy leaves the unit failed and the old
version running.

To put a commit live by hand (not on `master`, or with the timer stopped), from a checkout:

```sh
git fetch origin
SSH_OPTS="-F <ssh_config>" deploy/lab/proofofwork/deploy.sh <ssh-target> [<commit>]   # default origin/master
```

While the timer runs, its next run puts `master` back. Stop it first with
`systemctl stop lab-proofofwork-deploy.timer` if a non-master commit has to stay live.

One-time host setup (root on the host; the private key never leaves it):

```sh
install -d -m 700 /etc/lab/proofofwork
ssh-keygen -q -t ed25519 -N '' -C lab-proofofwork-deploy -f /etc/lab/proofofwork/github_deploy_ed25519
ssh-keyscan -t ed25519 github.com > /etc/lab/proofofwork/known_hosts   # compare with GitHub's published fingerprint
# add github_deploy_ed25519.pub as a read-only deploy key of the repository, then:
install -m 644 <checkout>/deploy/lab/proofofwork/systemd/lab-proofofwork-deploy.* /etc/systemd/system/
systemctl daemon-reload && systemctl enable --now lab-proofofwork-deploy.timer
```

## Moving a stack

1. Stop it: `docker compose down` in `/opt/lab/<app>/`.
2. Copy `/opt/lab/<app>/` (including `.env`, `tunnel.env` and `data/`) to the new host.
3. On the new host, apply the same lab-zone firewall rules for the stack's subnet.
4. Start it: `docker compose up -d` in `/opt/lab/<app>/`. The tunnel reconnects with the same
   token, so DNS does not change.
5. For `lab-proofofwork`, repeat the one-time host setup above (new deploy key, timer) and remove
   the old host's deploy key from the repository.

## Moderating pool names (`lab-proofofwork`)

The server refuses names that contain a blocked term or equal a reserved name (term files in
`server/data/`; matching folds case, accents, leetspeak, hyphens and repeated letters). For a
name that slips through, hide it in `/opt/lab/proofofwork/`:

```sh
docker compose exec app node src/admin.js hide <name>     # off the leaderboard, no new targets or shares
docker compose exec app node src/admin.js unhide <name>   # show it again
docker compose exec app node src/admin.js list-hidden     # one line per hidden name
```

Hiding stores the folded name, so every spelling that folds to it is hidden too. Shares stay in the
database; nothing is deleted. Editing a term file in `server/` takes effect after
`docker compose restart app`; an empty blocked or reserved list stops the server at startup (the
allow list may be empty).

## Stacks

| Stack | Directory | Subnet |
| --- | --- | --- |
| `lab-proofofwork` | `proofofwork/` | `172.28.1.0/24` |
