# Design workshop round 3 — one combined workbench, shown in its states

## Decided by Mirko after round 2 (fixed)
Everything from round 2's brief (`BRIEF-r2.md`: look of round-1 v6, one workbench as start page,
top nav Workbench · Hash lab · Chain lab, 6+2 short hashes with hover tooltip + Copy, sample data)
still holds. On top of that, the workbench combines:
- **Layout: the bento of r2-v5** (`ref-r2-v5-bento.html`): compact block band on top, a bento grid
  below, everything important visible at 1440×900 without scrolling.
- **Missions: the collapsible left rail of r2-v4** (`ref-r2-v4-mission-rail.html`): ~248 px rail with
  the 5 missions, active mission expanded with steps, XP/badge small, collapse control; the active
  step marks the UI it needs with a coach ring and a small pointer label. Collapsed it becomes a
  ~56 px icon rail (mission numbers with state, a progress ring for the active one, expand control).
  Because the rail exists, the bento has no separate mission tile.
- **Race: from r2-v2** (`ref-r2-v2-race-in-band.html`): the "Next block" area in the band becomes
  the live race while a block is mined (two lanes Lars/Minas with nonce, current hash vs target 00,
  attempts/elapsed, Pause; the mined tiles stay compact to the right).
- **Invalid states: from r2-v8** (`ref-r2-v8-invalid-states.html`): red "Hash mismatch" with text on
  the changed block, amber "Built on a broken block" on its descendants (never claiming their own
  links changed), chain pill "Chain invalid", Mine paused while invalid, re-mine order markers.

## Base layout of the combined workbench (for v1; all state variants derive from v1)
- Top bar as in r2 (logo, Workbench · Hash lab · Chain lab, "powCoin · simulated, no real coins",
  chain status pill, overflow menu with Reset / sound / theme).
- Left: mission rail (open in v1).
- Main column, top: block band. Left part of the band is the **Next block area**, roughly 36–40 %
  of the band width: idle it shows "Next block #5 · 2 tx waiting · reward 1.5625", the primary
  action "Mine block #5" (only filled button on the page), Auto-mine toggle, Difficulty stepper, and
  a compact "Last round #4: Lars won at nonce 5,775 · 332 tries · 7.1 s" line with two thin lanes
  showing the final positions. Right part: mined tiles #4…#0 with 6+2 short hashes; one tooltip open.
- Main column, bento below (no race tile, no mission tile): Mempool with inline New transaction
  form; Wallets; Selected block #4 (compact inspector: hash, previous, nonce, miner, tx, "Open in
  Chain lab", "Tamper with this block"); Key figures (avg 3.9 s / target 10 s, difficulty 2, reward
  1.5625 epoch 2, next halving #8) with the small block-times chart; Chain health ("Chain valid ·
  every block links to the one before", five small check marks #0–#4).
- Coach ring for mission 2 step 3 "Back Minas and win one block": on the Minas lane in the Next
  block area, with a "Back Minas" control there (the learner picks which miner to back).
- Everything visible at 1440×900, nothing below the fold.

## Technical rules (binding)
Same as round 2: one self-contained HTML file per variant, inline `<style>`, colors and spacing as CSS
custom properties at the top, no external requests, no web fonts, inline SVG icons, no emoji,
English copy, exactly one primary action per view, header comment (variant, state shown, 3 sentences
rationale), target viewport 1440×900, no horizontal overflow, real CSS :hover tooltips on tiles.

## Validation (run yourself, report the result)
`node /private/tmp/claude-501/-Users-d068879-1-dev-blockchainSimulacrumApp/684ebfac-916c-4730-af35-0a76dd027c2f/scratchpad/shot.cjs <file.html> <file.png>`
Expected: `overflowX` ≤ 0 and `external` empty. Look at the PNG with the Read tool and judge it
yourself. One correction pass after looking is part of building, not a failed check.
