# Design workshop round 4 — full-width chain band, tighter grid

## Base
Start from `ref-r3-v1-base.html` (tokens, components, mission rail, tiles, compact mining card,
6+2 short hashes with hover tooltip + Copy, look). Sample data as in `BRIEF-r2.md`. Light tokens:
`ref-r3-v7-light.html`. Invalid-state vocabulary: `ref-r3-v5-tampered.html`. Mobile reference:
`ref-r3-v8-mobile.html` (superseded layout, reuse components only).

## Mirko's feedback on round 3 (binding for every variant)
1. **The chain band runs across the full width of the main area**, left to right, containing ONLY the
   block tiles (the purple ones). Tiles get more room: wider, not squeezed, comfortable padding,
   miner, tx count, time, short hash readable at a glance. No Next block / mining controls in the band.
2. **The mining card moves down into the grid.** Its look and compact size from ref-r3-v1 (the "Next
   block #5" area with Mine block #5 as the only primary action, Auto-mine, Difficulty, last round as
   two thin lanes with Back Lars / Back Minas, coach ring "Step 3 · back Minas") is liked; keep it as
   compact as it was. While mining it becomes the live race in place (not drawn this round).
3. **Chain health gets no tile of its own.** Integrate it into the band (variants differ how): e.g. a
   band header line ("Chain valid · 5 of 5 hashes start with 00 · 4 of 4 links intact"), check marks on
   tiles, link connectors between tiles that carry the state.
4. **Wallets are sized for 6 rows**: the 5 wallets plus room for one self-created wallet, with a
   "Create wallet" action; more wallets scroll inside the tile. No large empty area.
5. **Mempool is compact** (2 rows + a compact way to add a transaction; the full form may open in place
   or as a popover — show the closed state). **Selected block is compact** (no dead space).
6. Mission rail open (mission 2, step 3 active), top bar as in the base. Everything within 1440×900.
7. No dead space anywhere: every tile's height fits its content.

## Technical rules (binding)
One self-contained HTML file per variant, inline `<style>`, tokens as CSS custom properties at the top,
no external requests, no web fonts, inline SVG, no emoji, English copy, exactly one primary action per
view, header comment (variant, layout decisions, 3 sentences rationale), 1440×900 canvas, no horizontal
overflow, page height ≤ 900, real CSS :hover tooltips on tiles with one shown open.

## Validation (run yourself, report the result)
`node /private/tmp/claude-501/-Users-d068879-1-dev-blockchainSimulacrumApp/684ebfac-916c-4730-af35-0a76dd027c2f/scratchpad/shot.cjs <file.html> <file.png>`
and `node …/shot.cjs <file.html> <file>-full.png 1440 900 full`.
Expected: `overflowX` ≤ 0, `external` empty, full PNG 900 px tall. Look at the PNG with the Read tool
and judge it yourself, especially for empty space and squeezed tiles. One correction pass after
looking is part of building, not a failed check.
