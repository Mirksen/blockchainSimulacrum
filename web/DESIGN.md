# proofofwork.fyi — Design System

How the product feels, speaks and behaves, and what it is built from. The
order is deliberate: feeling first, then language and behavior, colors and
components last. Anyone building or changing a view checks it against every
section.

**In force or target picture.** A section without a marker is in force: new
and changed code follows it, and deviations in existing code are named under
[Deviations](#deviations). A section marked "Target picture" is decided but
not yet built. Origin and trade-offs of a rule live in the PR, not here; the
workshop behind the current design is in PRs #14 and #15. The product is the
reference.

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
| The coin is virtual, not "not real" | "no real coins" | "powfyicoin · virtual" |
| A hint says what happens next | "Mempool" | "goes into #5", "added when #5 is mined" |
| Running work names itself | spinner only | "Mining block #5…" |

Titles carry no full stop. Numbers use tabular figures; hashes and amounts
use the monospace font.

## Information architecture

- **Top bar:** brand, navigation **Workbench · Hash lab · Chain lab · Mining
  pool**, the coin label "powfyicoin · virtual", the chain status pill, and an
  overflow menu (Reset, Settings, sound, theme, usage sharing); the
  leaderboard ticker runs directly below it.
- **Workbench is the start page.** It shows the whole simulation at once:
  1. **Mission rail** on the left (collapsible).
  2. **Chain band** across the full width of the main column.
  3. **Card grid** below: Selected block and Next block in row 1, Wallets
     and Mempool in row 2, Activity in row 3 on tall screens.
- **No separate pages for race or missions.** The race lives in the Next
  block card; missions live in the rail and point at the part of the
  workbench they need.
- Hash lab and Chain lab stay separate tools.

### Existing features in the workbench

Features that reached master during the workshop get these places (lead
decision, 2026-10-27):

- **Mining pool** becomes the fourth tab: Workbench · Hash lab · Chain lab ·
  Mining pool. The labs and the pool are views behind the tabs, not dialogs;
  the tab is in the URL (`#/hash-lab`, `#/chain-lab`, `#/pool`). Joining the
  pool happens on its tab.
- **Pool proofs** (Mirko, 2026-10-29): a proof hashes our genesis hash, a
  recent Bitcoin block (height and hash), the name and a nonce. It counts
  while that Bitcoin block is one of the last 144 (about a day); the pool
  tab lists "Last 144 blocks" and "All time", ranked by the smallest hash.
  Every row has Verify. A bridge genesis says so under the board; the final
  genesis (mined 31 October 2026) starts the board again.
- **Leaderboard ticker** (Mirko): a slim band directly under the top bar
  runs the all-time pool leaderboard from right to left (rank, name, zeros,
  difficulty, best hash). It pauses on hover and focus, is static under
  `prefers-reduced-motion`, and disappears quietly when the leaderboard
  server is unavailable. Clicking it opens the Mining pool tab.
- **Missions and the learning path are one track** (Mirko). The three guided
  experiments become missions; the learning path dialog goes away. A
  mission names the view it needs, switches to that tab and marks the
  element with the coach ring. Track:
  1. Change a fingerprint (Hash lab)
  2. Earn a proof of work (Hash lab)
  3. Send your first coin (Workbench)
  4. Win a mining race (Workbench)
  5. Change the past (Chain lab)
  6. Forge a block without getting caught (Workbench)
  7. Survive a halving (Workbench)
  8. Beat the difficulty adjustment (Workbench)
  Missions unlock in order; free play never needs a mission. Progress stays
  in the browser. Lab missions use the labs' own temporary state and never
  change the simulator chain.
- **Experiment settings** (coin name, difficulty, halving interval, target
  block time) move into a "Settings" dialog in the overflow menu; difficulty
  also stays in the Next block card.
- **Usage sharing** (analytics opt-in) moves into the overflow menu and keeps
  its consent text.
- **Wallet details** (recovery phrase, transactions) open from a wallet row;
  **block and transaction details** open from the Selected block card.
- **Fresh start:** before the demo is set up, the chain band shows only
  Genesis and the candidate, and the single primary in the Next block card
  is "Start demo".
- **Stop mining** is the Pause action of the running race; Auto-mine is the
  switch in the Next block card.

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

- **Starts collapsed for free play.** The learner can expand it at any
  time; the browser remembers the expanded or collapsed state. With the
  rail collapsed, Hash lab and Chain lab open without the mission lesson;
  tasks, XP and coach marks stay hidden. The entry is labelled Missions in
  the 56 px desktop rail, or shown as a neutral Missions bar on smaller
  screens. On smaller screens, Hide missions returns to free play; closing
  the task sheet alone keeps guidance enabled. Opening or closing missions
  preserves progress.
- **First-visit invitation:** while the rail is collapsed and no mission
  progress has been made, a non-modal card introduces the track. "Start
  missions" expands the rail; "Don't show again" dismisses only the card.
  Showing it marks it seen in this browser, so it stays away on later
  visits when browser storage is available, even if ignored. Navigating
  away or toggling missions dismisses it. It points at the Missions entry
  with one brief highlight unless reduced motion is requested. The card
  stays in the page flow, never takes focus, adds no filled primary action
  and never blocks free play.
- When expanded, the rail lists the missions of the track with progress;
  the active mission is expanded with its steps, a hint and its reward.
- When missions are open, the current step **marks the element it needs
  with a coach ring** and a small label ("Step 3 · back Minas").

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

Reference screen: **MacBook Pro 14"** (1512 × 982
points, 1512 × 860 CSS px inside the browser). The workbench is fluid around
it; type size never changes with the viewport.

| Viewport | Behavior |
|---|---|
| ≥ 1280 wide and ≥ 830 tall | Fills the screen without scrolling. Extra height goes to lists (wallets, mempool), extra width to block tiles (up to ~280 px each) and cards; never to empty padding. |
| ≥ 1100 tall | The Activity card appears as row 3 and takes the height lists cannot fill. |
| ≥ 2200 wide | Content capped at ~2160 px and centered; the background continues. |
| < 830 tall (e.g. 1366 × 657) | The page scrolls vertically; cards keep their density instead of squeezing. |
| 1024–1279 wide | Collapsed Missions entry unless explicitly opened; tiles narrower (min ~150 px); earlier blocks behind a "‹ N earlier" control. |
| 768–1023 wide | Mission rail becomes a bar on top; the chain becomes a vertical timeline (newest on top, candidate first); then Next block, Mempool, then Selected block and Wallets side by side. |
| < 768 wide | Phone: compact top bar, mission bar, vertical timeline, health line, key-figure line, then Next block, Mempool, Selected block, Wallets. The race sits directly under the chain. |

No size scrolls sideways.

## Foundation

One token set in CSS custom properties with a dark and a light value per
token, in [`src/styles/tokens.css`](src/styles/tokens.css); the light theme
needs no markup change. Components never use color literals; miner colors
and validity states are semantic tokens.

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

| Component | Contract |
|---|---|
| Top bar | Brand, four-tab navigation, coin label, chain status pill, overflow menu; below 768 px the tabs fold into the menu |
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

Rules for every workbench component (`src/components/workbench/`):

- Presentational: data and callbacks come in as props; no `useBlockchain`
  call, no global state, no fetching (except the leaderboard ticker).
  `App.jsx` owns state and side effects; `Workbench.jsx` turns the
  simulation snapshot into view models.
- Each component fills its container; lists scroll inside and the header
  stays visible, so the parent grid decides sizes.
- One CSS file per component, class names prefixed with the component name
  in kebab case (`.chain-band-…`, `.next-block-…`).
- Status is always color plus text. Focus is visible; hover tooltips also
  open on focus.
- A step a mission needs is wrapped in `<CoachMark target="…" coach={coach}>`;
  the target ids are the `target` strings in `src/lib/missions.js`.
- Short hash: first 6 + last 2 characters with "…", leading zeros
  highlighted.
- Each component has a test (vitest and Testing Library) for its states and
  callbacks.

## Guards

- `src/__tests__/designTokens.test.js` fails on any color literal (hex,
  `rgb()`, `hsl()`) outside `src/styles/tokens.css`.
- The browser acceptance (`npm run test:browser`) writes the reference views
  `view-workbench-*` and `view-tampered-*` at 1512 × 860 and 390 px in both
  themes; CI uploads them as the `screenshots` artifact for review. Chain
  content is random per run, so they are compared by eye, not pixel by pixel.

## Deviations

- The card grid uses two equal columns. The workshop prototype started the
  right column under the third visible tile and gave the Next block card a
  notch pointing at the candidate; both are not built, because the chain band
  shows a varying number of tiles.

## Findings: product before the redesign (2026-10-27, commit 284c54e)

The finding the redesign answered. Inventory of `web/src` at the time:

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
2. **Direction.** Workshop rounds in `studies/<workshop>/round-N/`: tile 0
   is the current product, tiles 1–8 are variants or states. Mirko
   prioritizes; the next round narrows.
3. **Target picture and prototype.** The decision lands here, marked as
   target picture, with its prototype in the study.
4. **Review at the prototype.** The lead checks it at the reference size,
   light and dark, at 390 px and at the size extremes.
5. **Rebuild** in steps, one PR per step, each with before and after
   screenshots of the reference views.
6. **Close.** The last PR removes the markers and the prototype.
