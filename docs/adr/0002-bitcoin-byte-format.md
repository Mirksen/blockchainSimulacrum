# ADR 0002: Blocks and transactions move to Bitcoin's byte format

Status: accepted, 2026-10-31 (Mirko). Package 1 done; packages 2 and 3 in progress.

## Context

The simulator hashes text: a block header is `SHA256(previousHash + txRoot + timestamp +
difficulty + nonce)` with timestamps in milliseconds and the difficulty as a count of leading hex
zeros; a transaction hash is `SHA256(sender + recipient + amount + fee + memo)` in an account
model. The Merkle tree already follows Bitcoin's shape (leaf = transaction hash, odd level
repeats its last hash), the reward is 3.125 and halving is every 210,000 blocks.

Mirko wants the site to match Bitcoin wherever possible: a learner should hash exactly the bytes
a Bitcoin miner hashes.

## Decision

Three packages.

1. **Genesis in Bitcoin's byte format (done, `shared/bitcoin-block.mjs`).** An 80-byte header
   (version, previous hash, merkle root, time in seconds, bits, nonce) hashed with double
   SHA-256 and displayed byte-reversed; one coinbase transaction serialised like Satoshi's,
   scriptSig = push(bits) push(extraNonce) push(memo), paying 3.125 BTC to Hal Finney's key
   from block 170. The previous hash is a Bitcoin block of launch day; bits are 0x1d00ffff.
   Satoshi's block 0 is rebuilt byte for byte in the tests. Blocks after the genesis still use
   the app's format (`GenesisBlock`/`GenesisCoinbase` in `web/src/lib/blockchain.js`).
2. **Every simulator block in Bitcoin's header format.** Header, hashing and display as in
   package 1 for every block; Merkle root over binary txids with double SHA-256 in internal
   byte order; difficulty as compact `bits` (the UI may keep choosing a number of hex zeros and
   map it to a target); 32-bit nonce plus an extraNonce in the coinbase when the nonce space is
   exhausted; time in seconds. Covers browser mining (`powSearch` midstate over the 80-byte
   header, worker), Hash Lab, Chain Lab, Fork Lab, re-mining, mission texts, difficulty UI, block
   details (show the 80 bytes with their fields) and the acceptance scripts. `GenesisBlock`
   becomes the ordinary block path.
3. **Bitcoin transactions: UTXO and scripts.** Transactions with inputs (previous txid:vout,
   scriptSig) and outputs (value in satoshis, scriptPubKey), version and locktime, serialised
   like Bitcoin; txid = double SHA-256 of the serialisation; legacy ECDSA secp256k1 signatures
   with SIGHASH_ALL over the Bitcoin preimage; standard P2PKH outputs (P2PK where history needs
   it). The chain keeps the UTXO set; balances are sums of unspent outputs; spending selects
   coins and returns change; the fee is inputs minus outputs; the coinbase carries the reward.
   Covers wallets, mempool and double-spend checks, transaction details UI, tamper/edit
   features, mission texts and acceptance scripts. Pin serialisation, txid and signature
   hashing with real Bitcoin test vectors.

## Seam between packages 2 and 3

- `tx.createHash()` returns the transaction's txid as 64 hex characters in display order. It is
  the only thing package 2 reads from a transaction. Package 2 converts it to internal order for
  the Merkle tree. Until package 3 lands, the existing account-model hash stands in.
- Package 2 owns the block header, Merkle tree, proof of work, difficulty/bits, time, mining,
  the labs and block UI. Package 3 owns `Transaction`, the UTXO set, scripts, signatures,
  wallets, balances, mempool and transaction UI. Neither edits the other's code; move code into
  separate modules (for example `web/src/lib/tx/`) where that keeps the split clean.
- Mission texts: package 2 owns mining, hashing and chain missions, package 3 wallet and
  transaction missions. Whoever merges second resolves conflicts in shared files.
- Out of scope for both: the pool proof and leaderboard protocol
  (`proofofwork.fyi|<genesis>|<round>|<name>|<nonce>`), the server and its deployment.

## Order

Both packages branch from package 1 and rebase onto master once package 1 is merged (only the
genesis values in `shared/genesis.json` change then). Package 2 is expected to merge first;
package 3 rebases onto it. Each package opens its own PR; a merge needs green CI, the browser
acceptance with screenshots that its lead has looked at, and no regression in the simulator's
missions.

## Consequences

- A learner sees and can recompute the exact bytes of every block with any Bitcoin tool.
- Hashing in the browser costs two SHA-256 compressions per attempt instead of about one; the
  difficulty range may need retuning (ADR 0001's measurements apply per compression).
- The genesis stays valid across packages 2 and 3: it is already in the target format.
