# ADR 0004: Lowering the difficulty by hand starts a new chain

Status: accepted, 2026-11-03 (Mirko)

## Context

The learner sets the workbench difficulty with the stepper of the Next block card and the slider
in Settings, both from 1 to 10 leading zeros. Lowering it kept the chain: after a few hard blocks
the learner could drop to one zero and add easy blocks at will. The chain then grew longer without
more work, and "the longest chain" stopped meaning what it means in Bitcoin, the chain with the
most accumulated work. Mirko: start at a low difficulty and work up; lowering it in between must
not produce a longer chain, and a warning has to say that lowering resets the chain.

## Decision

1. **Raising keeps the chain.** A higher difficulty only makes the next blocks harder.
2. **Lowering by hand starts a new chain.** When the chain has a block after the genesis block,
   a manual lowering (stepper or slider) first asks for confirmation. "Keep chain" (also Escape and
   a click outside) changes nothing; "Start new chain at N" is the simulator Reset with the new
   difficulty: blocks, mempool, added wallets and miners and renames go, coin name, halving
   interval and target block time stay. With only the genesis block there is nothing to lose, so
   lowering needs no confirmation.
3. **The automatic adjustment may lower.** Every 10 mined blocks the difficulty adapts to the
   target block time, as Bitcoin's retargeting does, and can step down by one when blocks are too
   slow. That is the protocol's own rule, earned by measured block times, not a shortcut, so it
   keeps the chain.

## Consequences

- A chain's length again reflects its work, up to the automatic adjustment.
- A learner stuck at a difficulty too high to mine has to start over to go lower; the Settings help
  and the dialog say so.
- The Reset telemetry (`chain_reset`) is followed by `difficulty_changed` with the old and new
  value; an active workbench mission restarts as on any Reset.
