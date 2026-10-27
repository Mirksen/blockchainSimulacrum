# Lab zone

The lab zone holds small, public-facing experiments that run as self-contained Docker
Compose stacks. Each stack lives in its own directory, `/opt/lab/<app>/`, containing
`compose.yaml` and a local `.env` (created from `.env.example`, never committed).

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
   `TUNNEL_TOKEN`), which connects outbound.
4. **Hardened containers.** `read_only: true` (writable state only in named volumes and
   `tmpfs`), `cap_drop: [ALL]`, `no-new-privileges:true`, non-root user, and explicit
   `mem_limit`, `cpus` and `pids_limit`.
5. **Pinned images.** Images are pinned to explicit versions (or digests); no `latest`.
6. **Secrets stay local.** Real values live only in `/opt/lab/<app>/.env` on the host.
   Repositories contain `.env.example` with placeholders only.
7. **Portable by construction.** Nothing in a stack depends on host-specific paths, host
   networking or provider runtime services. State lives in named volumes.

## Moving a stack

1. Stop it: `docker compose down` in `/opt/lab/<app>/`.
2. Copy `/opt/lab/<app>/` (including `.env`) to the new host, and copy the named volume
   data if the state should move along (for example via `docker run --rm -v <volume>:/v ...`
   with `tar`).
3. On the new host, apply the same lab-zone firewall rules for the stack's subnet.
4. Start it: `docker compose up -d` in `/opt/lab/<app>/`. The tunnel reconnects with the same
   token, so DNS does not change.

## Stacks

| Stack | Directory | Subnet |
| --- | --- | --- |
| `lab-proofofwork` | `proofofwork/` | `172.28.1.0/24` |
