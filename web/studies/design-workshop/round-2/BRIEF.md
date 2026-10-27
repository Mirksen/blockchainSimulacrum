# Design workshop round 2 — shared brief for all variants

## What Mirko decided after round 1 (fixed for every variant)
- **Look:** the visual language of round-1 variant 6 ("Explorer", data-rich dark navy).
  Source of truth: `web/studies/design-workshop/round-1/v6.html` — reuse its tokens (background
  navy around #0b1220, surfaces, borders, blue-violet gradient block tiles, tabular figures,
  monospace hashes, status pills with text). Refine, don't redesign.
- **One workbench is the start page.** Round-1 variant 6 (explorer) and variant 5 (workbench)
  are merged: the top band shows the chain as block tiles like v6 (candidate "Next block" on the
  left, mined blocks to the right), below it the workbench. All important information is visible on
  the page at once, arranged cleverly — no hunting through modals.
- **Mining race** (round-1 variant 3) is not a page; it is part of the workbench and comes alive
  when a block is being mined.
- **Missions** (round-1 variant 8) are not a page; they start from inside the workbench, cleverly
  (e.g. a launcher, a coach strip, a side rail). A mission points at the UI it needs.
- **Top navigation:** Workbench · Hash lab · Chain lab (Hash lab and Chain lab stay separate tools).
- **Block hashes in tiles:** every block tile shows its short hash = first 6 + last 2 characters,
  e.g. `0080a3…4d`. Hovering shows the full 64-char hash in a tooltip with a "Copy" button.
  Each mockup shows this tooltip opened on one tile (static), plus a real CSS :hover on all tiles.

## Sample data (same in every variant)
- Coin powCoin. Difficulty 2 (hash must start with `00`). Block reward 1.5625 (epoch 2, halving every 4 blocks; next halving at block #8). Target block time 10 s.
- Blocks (full hashes → short form):
  - #0 Genesis — 0000a1f3c9e2b7d4e81c5f0a9b27d36c41e0f8a29d7b53c6e1048f2a9c3d5b71 → `0000a1…71` — 0 tx
  - #1 Minas — 00d1664c1246a070cebdc05febb822d3b66af97bf43bb6fd7ad9835f2ceaaf48 → `00d166…48` — 1 tx — 0.3 s
  - #2 Lars — 009a6e73cac3934378dbc6e1f385239bc4ef87a5bc351687156c97341f438394 → `009a6e…94` — 5 tx — 0.1 s
  - #3 Lars — 00e61301ea0b9765106bd0eaa4ed68c1a108de9f700451072c4b75f5830011f8 → `00e613…f8` — 1 tx — 8.0 s
  - #4 Lars (new) — 0080a3e897fb1e3839f43f95b033620ff7fb2f9739c8e415e5ce6e7df0726c4d → `0080a3…4d` — 1 tx — 7.1 s
- Wallets: Alice 0.60000000, Bob 0.60000000, Chris 0.60000000, Lars 8.41250004 (miner, 3 blocks), Minas 0.72499996 (miner, 1 block)
- Miners: Lars 11,133 H/s (amber), Minas 11,000 H/s (violet).
- Last race (block #4): Lars won at nonce 5,775 → `0080a3…4d` 2/2 zeros; Minas at nonce 905 → dc80146e… 0/2; 332 attempts, 7.1 s.
- Live race (block #5, only where a variant shows mining in progress): Lars nonce 3,218 → d16d6eb1… 0/2; Minas nonce 1,048 → 0b7e41c9… 1/2; 148 attempts, 3.4 s.
- Mempool: 2 pending — Alice → Bob 0.25 "Coffee"; Chris → Alice 0.10 "Rent split".
- Stats: avg block time 3.9 s, fastest 0.1 s, slowest 8.0 s, total mined 10.9375.
- Missions: 1 "Send your first coin" (done), 2 "Win a mining race" (active, 2 of 3 steps), 3 "Forge a block without getting caught", 4 "Survive a halving", 5 "Beat the difficulty adjustment" (3–5 locked).
- Workbench controls that must exist somewhere: Mine next block (the one primary action), Auto-mine toggle, Difficulty stepper, New transaction (from/to/amount/reference), Tamper with a block, Reset, sound and theme in an overflow menu.

## Technical rules (binding)
- Exactly one self-contained HTML file per variant: inline `<style>`, no external requests (no CDN, no web fonts, no image URLs). Icons as inline SVG, no emoji. Small inline JS only if needed for hover/copy demo; static is fine.
- System fonts as in v6. Target viewport 1440×900; the first screen shows the whole idea. No horizontal overflow. The page may continue below the fold, but the variant's claim "everything visible" is judged at 1440×900.
- Professional quality: consistent 4/8 spacing, real hierarchy, exactly one primary action per view, English copy, short and concrete. Colors as CSS custom properties at the top.
- An HTML comment at the very top: variant, how race / missions / density are solved, 3 sentences rationale.

## Validation (run yourself, report the result)
`node /private/tmp/claude-501/-Users-d068879-1-dev-blockchainSimulacrumApp/684ebfac-916c-4730-af35-0a76dd027c2f/scratchpad/shot.cjs <file.html> <file.png>`
Expected: `overflowX` ≤ 0 and `external` empty. Then look at the PNG with the Read tool and judge it
yourself (legibility, hierarchy, nothing cut off or overlapping). One correction pass after looking is
part of building, not a failed check.
