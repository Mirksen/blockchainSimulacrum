# ADR 0003: A leaderboard proof is a mined block, and every block counts

Status: accepted, 2026-11-01 (Mirko)

## Context

The leaderboard only knew its own proof: `SHA256(proofofwork.fyi|genesis|round|name|nonce)`, mined
on the Mining pool tab. Blocks mined in the workbench never reached it, the name could only be
entered on that tab, and an empty board hid its ticker. Mirko expected every newly mined block to
land on the leaderboard, with the name directly visible while mining: "jeder Block zählt".

## Decision

1. **The proof is the block.** A leaderboard entry is a block in Bitcoin's byte format (ADR 0002):
   the 80-byte header, the coinbase and the merkle branch from the coinbase to the root. The old
   text proof is gone; the board started empty on the final genesis, so nothing was lost.
2. **The name signs the coinbase.** A signed coinbase carries the name as its tag, the way a mining
   pool tags its blocks, and ends with an OP_RETURN output of 0 value holding
   `SHA256(proofofwork.fyi|genesis|round|name|)`. The genesis hash ties the work to this chain, the
   round (a Bitcoin block of the last 144) makes it unminable in advance, the name makes it
   untransferable. The header commits to the coinbase through the merkle root, so changing the name
   invalidates the work. This is the shape of a merged-mining commitment.
3. **Every block of the browser counts.** With a name, every candidate of every miner is signed,
   so the block counts whichever simulated miner wins: all lanes hash in the visitor's browser.
   The reward still goes to the winning lane; the name is the operator's tag, not the payee.
   Re-mined blocks keep their coinbase and do not count again.
4. **No floor.** The server accepts one leading zero (`PROOF_ZEROS = 1`), the workbench minimum.
   The board ranks by the smallest hash, so easy blocks cost nothing but a counter.
5. **One row per name and round, 20,000 rows at most.** The server keeps the best block and a
   count, not every block, so a miner left running on Auto-mine adds a number instead of rows. Past
   the limit the worst hash goes. Half the room belongs to finished rounds and half to the 144-block
   window, so a flood of new blocks cannot reach the all-time leaders. The board shows 20 rows per
   list, so this stays invisible; a dropped block is answered like any other. Floors and tighter
   rate limits were rejected: neither stops a script that rotates addresses, and both hit honest
   visitors. Measured: 54 MiB free on the host; 20,000 realistic rows take 24.8 MiB, and dropping a
   row at that size costs about 8 ms on the m1.
6. **The server checks work, not a chain.** Each visitor's chain lives in their own browser, so it
   cannot check `previousHash`. It checks that the header hashes as claimed, that its merkle root
   leads to a coinbase and that the coinbase ends with this name's commitment. Malformed
   transactions are harmless: the rule is about what the hash committed to, not ledger validity.
7. **Every visitor is on the board.** A visitor starts with a generated name from Bitcoin's history
   (`Not-Satoshi-4`, `Adam-Back-86`, `shared/miner-names.mjs`), kept in the browser; the field glows
   until they choose their own. Hyphens, because the name rule has no spaces. Only the name and the
   best block are stored, so this adds no personal data to the board.
8. **Mining never waits for the server.** The round is fetched beside the mining, not before it.
   An unreachable server leaves blocks unsigned and says so; the simulator keeps working.

## Consequences

- The Mining pool tab is now the Leaderboard tab. Its continuous search mines the same blocks,
  built on the genesis, and raises its goal by one zero after each accepted block.
- Every visitor's blocks are sent by default, under a generated name.
- Anyone can mine blocks under any name; names are not accounts, as before. A script can fill the
  20,000 rows by rotating names, but only real work moves it up the board, and weak rows lose their
  block count when they are dropped.
- The table `blocks` is added next to the unread `proofs` and `shares`; data version 1 stays, since
  older code ignores the new table.
