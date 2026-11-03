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
- **Fee rate** — a fee per byte of the transaction, in satoshis per byte (sat/B). A sender picks
  1, 5 or 20 sat/B (`FEE_RATES`); `chain.planAtRate` prices the transfer from its estimated size
  (the longest signature, so the real rate is never lower).
- **Block space** — the room in a block: at most `MAX_BLOCK_BYTES` (1,600), of which
  `BLOCK_RESERVED_BYTES` (300) stay free for the header, the transaction count and the coinbase;
  payments share the rest (`BLOCK_SPACE`, 1,300 bytes, about five transfers). Scaled down from
  Bitcoin's so a few transfers already compete.
- **Block template** — `chain.blockTemplate()`: the pending transactions the next block takes, as a
  miner chooses them, like Bitcoin Core: a transaction only together with the pending ones it spends
  from (its **package**), the package with the highest fee per byte first, only while it fits. A
  child with a high fee so pulls its cheap parent along (**child pays for parent**). Every other
  entry **waits** with a reason: `full`, `parent` (its parent has no room) or `invalid` (an edit of
  history orphaned it). `prepareCandidate` builds the block from it, so the coinbase claims only the
  fees of the included transactions.
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
- **Miner (created)** — a participant the learner adds with `chain.addMiner(name)`: a wallet that
  also races, with the wallets' name rules and name space, hashpower 5 and no coins. It joins from
  the next race; at most `MAX_MINERS` (4) miners, so next to the defaults Hal, Dorian and Laszlo
  one more; it takes the spare miner color. Not to be confused with the visitor's **miner name**
  on the leaderboard.
- **Rename** — `chain.renameParticipant(name, next)`: a new display name for this session, with the
  wallets' name rules. Blocks and transactions store scripts, not names, so every view follows; the
  participant keeps its keys and its **color key** (fixed at creation). A reset restores the defaults.
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

- **Merkle proof** — what a light client (SPV) needs to know that one transaction is in a block
  without the block's other transactions: the txid, and per tree level the sibling hash and the side
  it sits on (`web/src/lib/merkleLab.js`, `proofFor(index)`). Hashing up the path must give the
  header's merkle root (`verifyProof`); a block of n transactions needs ceil(log2 n) siblings. The
  **Prove a payment** experiment in Chain lab uses toy payment texts as transactions (txid = double
  SHA-256 of the text) under a fixed 80-byte header; with a reference to the block's own tree it
  names the first level where an edited proof diverges. The pool's **merkle branch** is the same
  proof for transaction 0.

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
- **Miner profile** — the public page of one miner name (`#/pool/<name>`, `GET /api/miner?name=`):
  every round the name has a block in (newest Bitcoin block first, at most 200), with its ranks in
  the last-144 window and all time, the places it would have on those boards. A hidden name answers
  like an unknown one. Names match exactly, as the board groups them.

## Hosting

- **Lab zone** — the network area on the shared Hetzner app host where prototypes run as
  self-contained Compose stacks (`deploy/lab/`), firewalled from the database, monitoring, tailnet
  and other Docker networks. Each stack has its own Cloudflare tunnel and moves to another host by
  copying its directory.
