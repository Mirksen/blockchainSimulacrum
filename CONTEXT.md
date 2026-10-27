# Domain language

Terms used in code, tests and docs of proofofwork.fyi. Decisions that shape them live in
`docs/adr/`.

## Simulator

- **Chain module** — `web/src/lib/blockchain.js`. Owns every block rule: reward and halving,
  coinbase, transaction root, header hash, proof-of-work check, appending. The React hook only
  orchestrates the miner race and UI state.
- **Candidate** — a block prepared for one miner by `chain.prepareCandidate(miner)`: everything
  except the nonce is fixed (previous hash, transaction root, timestamp, difficulty, transactions
  incl. coinbase). `prefix` is the constant part of the header preimage.
- **Target** — the required number of leading hexadecimal zeros of a hash (`'0'.repeat(difficulty)`).
  Each extra zero makes a valid hash about 16 times rarer.
- **Accept** — `chain.acceptBlock(candidate, nonce, hash)` re-checks the hash, the target and that
  the chain tip has not moved; only then the block is appended. `stale` means the tip moved,
  `rejected` means the proof is wrong.
- **Transaction root** — Merkle root over the transaction hashes; the header commits to it, so a
  changed transaction breaks the block hash.

## Search

- **Nonce search** — `web/src/lib/powSearch.js`. One module for the miner race, the hash lab, the
  chain lab and the pool: `search` (in-process) and `runSearch` (Web Worker in the browser, inline in
  tests) share one interface. Each attempt hashes `prefix + nonce + suffix`.
- **Midstate** — the SHA-256 state after absorbing the constant prefix once; each attempt clones it
  and hashes only the short tail.
- **Entrant** — one participant of a search (a miner, or the visitor in the pool) with a `weight`:
  the number of consecutive nonces it tries per round.

## Labs

- **Hash lab / chain lab / learning path** — isolated experiments with their own temporary state;
  they never change the simulator chain or wallets.

## Pool and leaderboard

- **Pool** — the shared, server-side part: the server issues signed, short-lived **challenges**
  (`prefix` contains the challenge id and the player name), browsers search nonces, and the server
  re-hashes every submitted **share** before it counts. Shares of the local simulator chain never
  count; that chain lives only in one browser.
- **Points** — a share is worth its target's expected work (16^zeros). A luckier hash than required
  earns the same points and only improves the player's **best hash**.

## Hosting

- **Lab zone** — the network area on the shared Hetzner app host where prototypes run as
  self-contained Compose stacks (`deploy/lab/`), firewalled from the database, monitoring, tailnet
  and other Docker networks. Each stack has its own Cloudflare tunnel and moves to another host by
  copying its directory.
