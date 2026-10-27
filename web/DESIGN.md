# proofofwork.fyi — Design System

How the product feels, speaks and behaves, and what it is built from. The
order is deliberate: feeling first, then language and behavior, colors and
components last. Anyone building or changing a view checks it against every
section.

**In force or target picture.** A section without a marker is in force: new
and changed code follows it, and deviations in existing code are named. A
section marked "Target picture · rebuild" is decided but not yet built; new
views follow it with the components that already exist, existing views are
changed only by the [rebuild](#rebuild). Origin and trade-offs of a rule live
in the PR and in [`studies/design-workshop/`](studies/design-workshop/), not
here.

**Reference.** The prototype of the target picture is
[`studies/design-workshop/round-6/`](studies/design-workshop/round-6/)
(`base.html` idle, `mining.html`, `tampered.html`, `light.html`,
`phone.html`); build the board with
`python3 web/studies/design-workshop/build.py round-6`. Where this document and
the prototype disagree, this document wins.

## Core feeling

proofofwork.fyi is a calm lab partner that lets you touch how proof of work
holds a chain together. It looks like a real block explorer, shows one thing
to do next, explains what just happened in plain words, and never pretends to
be real money or a real network.

Five principles follow from that. They decide when a detailed rule is
missing:

1. **One step leads, the rest accompanies.** Each view has exactly one filled
   primary action. Everything else is quieter.
2. **Show the mechanism, then the number.** A hash is shown with what to look
   at: its leading zeros, the link to the previous block. The chain is the
   picture on top; numbers are a quiet line beside it.
3. **Calm means meaning.** Color, glow and motion carry a statement (a miner,
   a broken link, a running race) or are absent. Intact states are neutral;
   color appears when something needs attention.
4. **Everything at once, nothing squeezed.** The workbench shows the whole
   simulation on one screen without hunting through dialogs, and every card
   is as tall as its content.
5. **Honest about the model.** The coin is virtual, there is no network, a
   reset starts over. The UI says so where it matters and never claims more
   than the simulation does.

## Language and tone

English, short sentences, plain words. Blockchain terms are welcome (hash,
nonce, mempool, coinbase, difficulty); jargon that the simulation does not
show stays out.

| Rule | Instead of | Better |
|---|---|---|
| Buttons are verb plus object where the context is not unique | "Mine", "Add" | "Mine block #5", "New transaction" |
| Status says what holds, with its basis | "OK" | "Chain valid · 5 of 5 hashes start with 00 · 4 of 4 links intact" |
| Invalid states name the cause and never overclaim | "Chain broken from #2 on" | #2 "Hash mismatch"; #3 "Built on a broken block" (its own link is intact) |
| The coin is virtual, not "not real" | "no real coins" | "powCoin · virtual" |
| A hint says what happens next | "Mempool" | "goes into #5", "added when #5 is mined" |
| Running work names itself | spinner only | "Mining block #5…" |

Titles carry no full stop. Numbers use tabular figures; hashes and amounts
use the monospace font.

## Information architecture

Target picture · rebuild.

- **Top bar:** brand, navigation **Workbench · Hash lab · Chain lab**, the
  coin label "powCoin · virtual", the chain status pill, and an overflow menu
  (Reset, sound, theme).
- **Workbench is the start page.** It shows the whole simulation at once:
  1. **Mission rail** on the left (collapsible).
  2. **Chain band** across the full width of the main column.
  3. **Card grid** below: Selected block and Next block in row 1, Wallets
     and Mempool in row 2, Activity in row 3 on tall screens.
- **No separate pages for race or missions.** The race lives in the Next
  block card; missions live in the rail and point at the part of the
  workbench they need.
- Hash lab and Chain lab stay separate tools.

### Chain band

- Reads **left to right as a timeline**: #0 Genesis on the left, the newest
  block on the right, then the **dashed candidate** "#N next · k tx waiting".
- Each block tile shows number, time to mine, miner, tx count, stored
  previous hash and the **short hash** (first 6 + last 2 characters,
  `0080a3…4d`) with its leading zeros highlighted. Hover or focus shows the
  full hash with **Copy**.
- **Links between tiles are a 1 px hairline with a small neutral dot.** No
  icon, no badge, no color while intact. Hover explains the link ("Link
  intact · #3 stores the hash of #2"). Red or amber only when broken.
- **Key figures** are one quiet line in the band header: average block time
  against the target, difficulty, reward, next halving. No key-figure tile,
  no chart in the band.
- **Chain health** is one collapsible line under the tiles, collapsed by
  default; "Show checks" opens per-block checks aligned under the tiles. It
  opens by itself when the chain is invalid.
- Clicking a tile selects the block for the Selected block card.

### Card grid

- **One grid with shared rows.** Selected block and Next block start and end
  at the same height; Wallets and Mempool start and end at the same height.
  The right column starts under the candidate tile; a small notch on the Next
  block card points at it without shifting the card.
- **Selected block:** hash with Copy, previous hash, nonce, miner with time,
  tries and reward, transactions; "Open in Chain lab", "Tamper with this
  block".
- **Next block:** the one primary action "Mine block #N", Auto-mine,
  difficulty stepper, and the last round as two lanes (Lars, Minas) with
  "Back Lars / Back Minas". While mining it becomes the **live race** in
  place.
- **Wallets:** sized for the five sample wallets plus one the learner
  creates ("Create wallet"); more wallets scroll inside the card with Create
  wallet staying visible.
- **Mempool:** pending transactions and the coinbase line "added when #N is
  mined"; **"New transaction" sits in the card header** as a tinted button
  with the same glow as Mine block.
- **Activity** (only on tall screens): recent confirmed transactions and
  block times.

### Mission rail

- Lists the five missions with progress; the active mission is expanded with
  its steps, a hint and its reward.
- The current step **marks the element it needs with a coach ring** and a
  small label ("Step 3 · back Minas").
- Collapsed, it becomes a 56 px icon rail with mission state and a progress
  ring; it never disappears.

## Interaction patterns

Every flow covers its states, not only the success path.

| State | Pattern |
|---|---|
| Idle | Mine block #N is the only filled button; New transaction glows as the second invitation. |
| Mining | The Next block card becomes the live race: per miner the current nonce and hash, leading characters checked against the target, attempts and elapsed time against the target time. The primary shows "Mining block #N…" and is disabled; Pause is next to it. The candidate tile says "mining". Mempool rows read "being mined into #N". New transaction stays available without glow. |
| Block found | The new tile appears on the right with a short calm highlight; the race line becomes "Last round". No confetti. |
| Tampered | The changed block turns red with "Hash mismatch" and its new hash (the stored one struck through). Descendants turn amber with "Built on a broken block"; their own links are intact and say so. The chain pill says "Chain invalid", health opens, Mine pauses with "Paused while the chain is invalid", and the single primary becomes "Re-mine block #2". Red only for the broken block and its direct status. |
| Empty | A sentence that says what is recorded ("No transactions waiting.") and the next step under it. |
| Error | Plain text plus a way to retry; inputs stay. |

Mission steps never block free play: the learner can always mine, send and
tamper without a mission.

## Screen sizes

Target picture · rebuild. Reference screen: **MacBook Pro 14"** (1512 × 982
points, 1512 × 860 CSS px inside the browser). The workbench is fluid around
it; type size never changes with the viewport.

| Viewport | Behavior |
|---|---|
| ≥ 1280 wide and ≥ 830 tall | Fills the screen without scrolling. Extra height goes to lists (wallets, mempool), extra width to block tiles (up to ~280 px each) and cards; never to empty padding. |
| ≥ 1100 tall | The Activity card appears as row 3 and takes the height lists cannot fill. |
| ≥ 2200 wide | Content capped at ~2160 px and centered; the background continues. |
| < 830 tall (e.g. 1366 × 657) | The page scrolls vertically; cards keep their density instead of squeezing. |
| 1024–1279 wide | Mission rail collapses to icons; tiles narrower (min ~150 px); earlier blocks behind a "‹ N earlier" control. |
| 768–1023 wide | Mission rail becomes a bar on top; the chain becomes a vertical timeline (newest on top, candidate first); then Next block, Mempool, then Selected block and Wallets side by side. |
| < 768 wide | Phone: compact top bar, mission bar, vertical timeline, health line, key-figure line, then Next block, Mempool, Selected block, Wallets. The race sits directly under the chain. |

No size scrolls sideways.

## Foundation

Target picture · rebuild. One token set in CSS custom properties with a
dark and a light value per token; the light theme needs no markup change.
Components never use hex values; miner colors and validity states are
semantic tokens. Source of the values: the `:root` and
`html[data-theme="light"]` blocks of `round-6/base.html` and
`round-6/light.html`.

| Group | Tokens | Dark (default) |
|---|---|---|
| Surfaces | `--bg`, `--bg-2`, `--panel`, `--panel-2`, `--panel-3`, `--overlay` | navy `#0b1220` → panels `#111a2e`–`#1b2744` |
| Lines | `--line`, `--line-2`, `--line-3`, `--active-line` | `#1f2b45` family |
| Text | `--text`, `--text-2`, `--text-3`, `--on-accent` | `#e7edf8`, `#a3b2cf`, `#6c7d9e` |
| Action | `--blue`, `--blue-bg`, `--blue-line`, `--glow-action`, `--focus` | `#4d8dff`; one shared glow for Mine block and New transaction |
| Status | `--green`, `--amber`, `--red` with `-bg` tints | always paired with text |
| Miners and wallets | `--lars` (amber), `--minas` (violet), `--alice`, `--bob`, `--chris` | |
| Coach | `--coach`, `--coach-ring`, `--coach-glow` | light blue |
| Block tiles | `--blk-0` … `--blk-4`, `--blk-top`, `--blk-side`, `--blk-hash-bg` | blue-violet gradients, only on tiles |
| Candidate | `--pend-*` | dashed, muted |
| Links | `--link-line`, `--link-dot` | `#33415f`, `#55668d`, neutral |

- **Type:** system UI font; monospace (`ui-monospace`, SF Mono) for hashes
  and amounts; tabular figures. Scale 11 label · 12 meta · 13 body · 14 title
  · 16 heading.
- **Spacing:** 4/8 grid (`--s-1` 4 px … `--s-7` 28 px).
- **Radius:** 6 / 8 / 10 px. Tiles are 3D blocks with a 7 px depth.
- **Contrast:** body text ≥ 4.5:1 in both themes, including text on block
  tiles and on the dashed candidate.
- **Icons:** inline SVG; no emoji.

## Components

Target picture · rebuild. Built in the order of the [rebuild](#rebuild).

| Component | Contract |
|---|---|
| Top bar | Brand, three-tab navigation, coin label, chain status pill, overflow menu |
| Block tile | Number, time, miner chip, tx count, stored previous hash, short hash with highlighted zeros; states `is-selected`, `is-newest`, `is-broken`, `is-dependent`; full-hash tooltip with Copy on hover and focus |
| Candidate tile | Dashed; idle "next", mining "mining · 3.4 s", paused while invalid |
| Link | 1 px hairline with a neutral 6 px dot; `is-broken` red, `is-dependent` amber; explaining tooltip |
| Chain health | One line, collapsible strip of per-block checks on the tile column grid |
| Card | Panel surface, 1 px line, no shadow; header with title, status pill and at most one action |
| Next block card | Primary action, Auto-mine, difficulty stepper, race lanes; live race state; repair state |
| Race lane | Miner, nonce, current hash with checked leading characters, progress, Back action, result |
| Coach ring | Ring plus small label on the element a mission step needs |
| Key-value rows | Label, mono value, quiet explanation |
| Wallet row | Avatar, name, role, hash rate for miners, balance in mono |
| Mission rail | Open and collapsed forms, steps with done/current/locked |
| Tooltip | Overlay surface, mono content, Copy |

## Rebuild

Target picture · rebuild. Steps, one PR each, in this order. Each view PR
shows before and after at 1512 × 860 and 390 px, light and dark, and keeps
the existing tests green.

1. **Tokens and theme.** Replace the `--sap*` tokens with the foundation
   above (dark default, light via `data-theme`); no layout change yet.
2. **Shell.** Top bar with Workbench · Hash lab · Chain lab and overflow
   menu; fluid page frame with the size rules.
3. **Chain band.** Tiles, candidate, hairline links, key-figure line, chain
   health with Show checks, full-hash tooltip with Copy, selection.
4. **Card grid.** Selected block, Next block (mining card and live race),
   Wallets, Mempool with New transaction in the header; Activity on tall
   screens; tampered state.
5. **Mobile and tablet.** Vertical timeline and the stacked order.
6. **Missions.** Rail, steps, coach ring. Needs new simulation features that
   do not exist yet: mission progress, backing a miner, creating a wallet,
   re-mining a historical block and undoing an edit. Each is its own PR with
   tests before the rail uses it.
7. **Guards.** A check that components use tokens only (no hex in component
   CSS), and the screenshot comparison for the views above.

The PR finishing step 7 removes the "Target picture · rebuild" markers and
deletes `studies/design-workshop/`; from then on the product is the
reference.

## Findings: current product (2026-10-27, commit 284c54e)

The finding the redesign answers. Inventory of `web/src`:

| Finding | Measured |
|---|---|
| No leading step: the header has seven text buttons of equal weight | `App.jsx` header |
| Three equal columns compete; the learning goal is not guided | `App.jsx` main layout |
| Emoji used as icons | 68 in 12 components |
| Visual tokens drift | 25 distinct `font-size`, 45 distinct hex colors, 12 distinct `border-radius`, 30 `box-shadow` declarations |
| Design language borrowed from SAP Fiori, not the product's own | 363 `sap` references in `index.css` |
| Hashes dominate cards without explaining what to look at | block cards |

## Verification

Each view is checked at 1512 × 860 dark and light, at 390 px, at one small
(1366 × 657) and one large (2560 × 1310) size, and by keyboard. Nothing
scrolls sideways; exactly one filled primary action per view. The lead looks
at the screenshots and judges them; technical checks alone do not replace
looking.

## How design is made

1. **Finding.** A target picture answers a measured finding or Mirko's
   impression at a named place, not taste alone.
2. **Direction.** Workshop rounds in `studies/design-workshop/round-N/`:
   tile 0 is the current product, tiles 1–8 are variants or states. Mirko
   prioritizes; the next round narrows.
3. **Target picture and prototype.** The decision lands here, marked as
   target picture, with its prototype in the study.
4. **Review at the prototype.** The lead checks it at the reference size,
   light and dark, at 390 px and at the size extremes.
5. **Rebuild** in the steps above, one PR per step.
6. **Close.** The last PR removes the markers and the prototype.
