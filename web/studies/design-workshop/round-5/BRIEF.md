# Design workshop round 5 — refinement of the converged workbench

## Reference screen
MacBook Pro 14" at its default scaled resolution (1512 × 982 points) with the browser chrome:
**canvas 1512 × 860 CSS px**. Use the space completely: the layout fills the full width and height,
no empty band at the bottom, nothing below the fold.

## Mirko's decisions after round 4 (binding)
Sample data as in `BRIEF-r2.md`. Base look and components from the references in this folder.
1. **Chain band from r4-v2** (`ref-r4-v2-chain-right.*`): full width, read left to right, #0 Genesis on
   the left … #4 newest, then the dashed candidate tile "#5 next · 2 tx waiting" at the right end.
2. **The links between tiles must be restrained and must not look like an emoji** (no round badge
   with a chain-link icon and a check dot). Quiet, technical, consistent with the tiles.
3. **Chain health from r4-v3** (`ref-r4-v3-health-strip.*`): the "Chain valid" summary plus the
   per-block checks strip under the tiles — but **collapsible and collapsed by default**: one quiet
   line ("Chain valid · 5 of 5 hashes start with 00 · 4 of 4 links intact", a "Show checks" toggle with
   chevron). Expanded it shows the per-block strip aligned under the tiles.
4. **Next block and Mempool are separate cards** as in r4-v2: the Next block card (compact mining
   card: Mine block #5 as the only primary action, Auto-mine, Difficulty, last round lanes with Back
   Lars / Back Minas, coach ring "Step 3 · back Minas") sits directly under the candidate #5 tile; the
   Mempool card below it ("goes into #5", 2 rows, Coinbase → winner row, closed "New transaction").
5. **Key figures restrained as in r4-v5** (`ref-r4-v5-quiet-figures.*`): a quiet stat line in the band
   header (avg 3.9 s / target 10 s · difficulty 2 · reward 1.5625 · next halving #8). No key-figure tile,
   no block-times chart.
6. **Selected block on top, Wallets below** (left of the Next block / Mempool column): Selected
   block #4 compact (hash with Copy, previous, nonce, miner, time · tries · reward, transactions, Open
   in Chain lab, Tamper with this block); Wallets for 6 rows incl. Create wallet, scrolling beyond.
7. Mission rail open as before (mission 2, step 3 active), top bar as before. One hash tooltip shown
   open on a tile, real CSS :hover on all tiles.

## Technical rules (binding)
One self-contained HTML file per variant, inline `<style>`, all colors/spacing/sizes as CSS custom
properties at the top, no external requests, no web fonts, inline SVG, no emoji, English copy, exactly
one primary action per view, header comment (variant, state, decisions), canvas 1512 × 860, no
horizontal overflow, page height ≤ 860 and visibly filled (no empty strip at the bottom).

## Validation (run yourself, report the result)
`node /private/tmp/claude-501/-Users-d068879-1-dev-blockchainSimulacrumApp/684ebfac-916c-4730-af35-0a76dd027c2f/scratchpad/shot.cjs <file.html> <file.png> 1512 860`
and `node …/shot.cjs <file.html> <file>-full.png 1512 860 full`.
Expected: `overflowX` ≤ 0, `external` empty, full PNG exactly 860 px tall. Look at the PNG with the
Read tool and judge it yourself (filled screen, no dead space, nothing squeezed or overlapping). One
correction pass after looking is part of building, not a failed check.
