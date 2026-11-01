# Domain language

Terms used in code, tests and docs of proofofwork.fyi. Decisions that shape them live in
`docs/adr/`.

## Simulator

- **Chain module** — `web/src/lib/blockchain.js`. Owns every block rule: reward and halving,
  coinbase, merkle root, header hash, proof-of-work check, appending. The React hook only
  orchestrates the miner race and UI state.
- **Header** — the 80 bytes of every block, in Bitcoin's format (ADR 0002): version, previous hash,
  merkle root, time in seconds, bits, nonce (`shared/bitcoin-block.mjs`). Its double SHA-256,
  byte-reversed for display, is the block hash.
- **Candidate** — a block prepared for one miner by `chain.prepareCandidate(miner)`: everything
  except the nonce is fixed (previous hash, merkle root, time, bits, transactions with the coinbase
  first). `header` is the hex of the first 76 header bytes.
- **Target** — the largest hash a block may have, stored in the header as compact **bits**. A
  learner chooses a number of leading hexadecimal zeros (`block.difficulty`, the unit of the UI);
  `bitsOfZeros` turns it into the easiest target that still demands those zeros, and
  `meetsTarget` decides. Each extra zero makes a valid hash about 16 times rarer.
- **extraNonce** — a counter in the coinbase. When all 2^32 nonces of a candidate are tried, the
  next round mines with extraNonce + 1, which changes the coinbase, the merkle root and with them
  the header.
- **Accept** — `chain.acceptBlock(candidate, nonce, hash)` re-checks the hash, the target and that
  the chain tip has not moved; only then the block is appended. `stale` means the tip moved,
  `rejected` means the proof is wrong.
- **Transaction** — a legacy Bitcoin transaction (`web/src/lib/tx/transaction.js`): inputs that spend
  earlier outputs, outputs with a value in satoshis and a locking script. Its id (**txid**) is the
  double SHA-256 of its bytes, displayed byte-reversed.
- **Coin / UTXO** — an unspent output. `validateChain` (`web/src/lib/tx/utxo.js`) walks the blocks and
  the mempool and is the only source of the UTXO set; a wallet's balance is the sum of its coins.
- **Change** — the output that returns what a payment did not use to the sender.
- **Fee** — what a transaction's inputs leave over after its outputs; never stored, collected by the
  miner in the coinbase.
- **Coinbase** — transaction 0 of a block. It spends nothing and may claim at most the block's
  **subsidy** plus its fees. The genesis coinbase cannot be spent.
- **Memo** — a reference, stored as an OP_RETURN output of 0 value.
- **Transaction view** — `describeTx(tx)`, what the UI reads: inputs, outputs with their role, fee,
  signature state. `tx.createHash()` is the only thing the block layer reads from a transaction.
- **Merkle root** — `transactionRoot`: Bitcoin's Merkle tree over the transactions' txids
  (`tx.createHash()`), double SHA-256 in internal byte order, an odd level repeating its last hash.
  The header commits to it, so a changed transaction breaks the block hash.
- **Block status** — `chain.inspectBlocks()` per block: `hash-mismatch` (its content no longer
  produces the stored hash, or the stored hash misses its target), `link-broken` (its stored previous
  hash differs from the predecessor's stored hash), `built-on-broken` (own hash and link fine, but an
  earlier block is broken), `signature-invalid` and `transaction-invalid` (hash and link fine, but a
  ledger rule fails; `issue` names it, also while a hash mismatch still decides the status),
  otherwise `valid`.
- **Edit** — a tampered value of a transaction's first output. `tamperTransaction` remembers the
  original once; `undoTamper(block)` restores the originals of that block. An edit changes the txid.
- **Re-mine** — find a new nonce for a historical block at the current target after re-linking it
  to its predecessor's stored hash; its transactions stay as they are, so after 2^32 nonces the
  header's time moves one second instead of an extraNonce. Allowed only when every earlier block is
  `valid`, so a chain is repaired from the oldest broken block forward.
- **Epoch** — the number of halvings applied up to a block (`chain.epochAt(height)`).
- **Wallet (created)** — a non-miner participant the learner adds with `chain.addWallet(name)`;
  2–16 letters or digits, unique regardless of letter case.
- **Backing** — the learner's pick of a miner before a race; the result reports `backedWon`.

## Search

- **Nonce search** — `web/src/lib/powSearch.js`. One module for the miner race, the hash lab, the
  chain lab and the pool: `search` (in-process) and `runSearch` (Web Worker in the browser, inline in
  tests) share one interface. An entrant is either a `header` (simulator and labs: a 32-bit nonce
  completes the 80 bytes, double SHA-256 against `bits`) or text (the pool: SHA-256 of
  `prefix + nonce + suffix` against leading zeros).
- **Midstate** — the SHA-256 state after absorbing the constant start once; each attempt clones it
  and hashes only the tail. For a header that start is its first 64 bytes.
- **Entrant** — one participant of a search (a miner, or the visitor in the pool) with a `weight`:
  the number of consecutive nonces it tries per round.

## Labs

- **Hash lab / chain lab / learning path** — isolated experiments with their own temporary state;
  they never change the simulator chain or wallets. They hash real 80-byte headers: the learner's
  text stands in for the transactions, its double SHA-256 is the merkle root, and a fixed clock
  keeps results dependent only on what the learner types.

- **Fork experiment** — isolated Chain Lab network model. Original and alternative
  histories share a starting anchor. Whole-branch validity and fixed target work
  determine local fork choice: only strictly greater work replaces the incumbent.
  A **reorganization** is this model selecting the other valid history. At the
  one-hex-zero target (`bits` 0x200fffff) each block adds 16 expected-work units, independent of
  actual attempts or lucky extra zeros. **Hash power** is a nominal per-attempt probability,
  not measured hardware throughput. A rewrite changes a toy payment text record;
  it does not forge signatures or move coins. Runs are capped at twelve new blocks.

## Pool and leaderboard

- **Miner name** — the public name a visitor mines under. It is not an account; people using the same
  name share a leaderboard entry.
- **Round** — a recent Bitcoin block the server offers. A block counts while its round is one of the
  last 144 Bitcoin blocks, so nobody can mine further ahead.
- **Signature** — the name in a coinbase's tag plus a last OP_RETURN output of 0 value, the
  **commitment**: `SHA256(proofofwork.fyi|genesis|round|name|)`. With a name, every candidate of every
  miner in the browser is signed, so every block counts whichever miner wins (ADR 0003).
- **Block proof** — what the server re-checks and the board stores: header, coinbase and the **merkle
  branch** from the coinbase to the root. The server checks the work and the signature, never the
  block's place in a chain, which lives in one browser.
- **Best hash** — the smallest hash of a name; it decides the rank. The server keeps one block per
  name and round, plus how many were sent.

## Hosting

- **Lab zone** — the network area on the shared Hetzner app host where prototypes run as
  self-contained Compose stacks (`deploy/lab/`), firewalled from the database, monitoring, tailnet
  and other Docker networks. Each stack has its own Cloudflare tunnel and moves to another host by
  copying its directory.
