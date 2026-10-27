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

## Moving a stack

1. Stop it: `docker compose down` in `/opt/lab/<app>/`.
2. Copy `/opt/lab/<app>/` (including `.env`, `tunnel.env` and `data/`) to the new host.
3. On the new host, apply the same lab-zone firewall rules for the stack's subnet.
4. Start it: `docker compose up -d` in `/opt/lab/<app>/`. The tunnel reconnects with the same
   token, so DNS does not change.

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
