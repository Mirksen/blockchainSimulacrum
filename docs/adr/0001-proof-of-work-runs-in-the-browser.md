# ADR 0001: Proof-of-work runs in the visitor's browser; servers only hold shared state

Status: accepted, 2026-10-27

## Context

proofofwork.fyi lets visitors mine blocks, race miners and experiment with hashes. The only
computationally heavy work is the nonce search. The question was whether to move it to a server
as the site grows, and where to host anything server-side.

Measured on an Apple M1 Max with crypto-js (Node): about 24,000 hashes/s for the original
1.7 kB block preimage; about 105,000 hashes/s with a SHA-256 midstate for the same preimage.

## Decision

1. The nonce search stays in the visitor's browser, off the UI thread in a Web Worker, through
   one search module with a midstate. Every visitor brings their own CPU, so an extra visitor
   costs nothing; server-side mining would cost per visitor and add latency without teaching
   anything new.
2. A server exists only for state shared between visitors. The first one is the pool
   leaderboard (`server/`): it issues signed challenges and re-verifies each share with one hash,
   so a modified client cannot fake work.
3. Server logic and data stay portable: plain Node with SQLite in a Compose stack, no provider
   runtime services (no Durable Objects, D1 or KV). Cloudflare is only the front door (DNS, TLS,
   tunnel) and serves the static files, which any static host could serve as well.
4. Stacks run in the lab zone of the shared Hetzner app host, separated by firewall rules from
   the database host, the monitoring host, the tailnet and other Docker networks. They move to an
   own server when the host's main application goes live with real users or a lab service offers
   uploads, accounts or code execution.

## Consequences

- Faster mining comes from client work (midstate, worker, header format), not from servers.
- The simulator keeps working when the leaderboard server is down; only the pool view degrades.
- Hashing rules exist once per runtime and are pinned by shared test vectors
  (`shared/share-vectors.json`) used by both the server and the browser tests.
- A future multiplayer network experiment follows the same pattern: browsers compute, a small
  room server relays and verifies.
