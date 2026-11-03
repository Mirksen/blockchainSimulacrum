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

Workbench difficulty is selectable from 1 to 10 leading hexadecimal zeros in
both the card stepper and Settings. The upper settings are experiments, even
when a block is impractical to find. Each extra zero means 16 times the expected
attempts. Pause stops the active search without committing an unfinished block;
the user can then lower the difficulty and start a new search.

## Language and tone

English, short sentences, plain words. Blockchain terms are welcome (hash,
nonce, mempool, coinbase, difficulty); jargon that the simulation does not
show stays out.

| Rule | Instead of | Better |
|---|---|---|
| Buttons are verb plus object where the context is not unique | "Add" | "New transaction" |
| Status says what holds, with its basis on request | "OK" | "Chain valid", a click adds "5 of 5 hashes start with 00 · 4 of 4 links intact" |
| Invalid states name the cause and never overclaim | "Chain broken from #2 on" | #2 "Hash mismatch"; #3 "Built on a broken block" (its own link is intact) |
| The coin is virtual, not "not real" | "no real coins" | "powfyicoin · virtual" |
| A hint says what happens next | "Mempool" | "goes into #5", "added when #5 is mined" |
| Running work names itself | spinner only | "Mining block #5…" |

Titles carry no full stop. Numbers use tabular figures; hashes and amounts
use the monospace font.

## Information architecture

- **Top bar:** brand, navigation **Workbench · Hash lab · Chain lab · Mining
  pool**, and an overflow menu (Reset, Settings, sound, theme, usage sharing)
  whose last line names the coin "powfyicoin · virtual"; the leaderboard
  ticker runs directly below it. The chain status is not repeated here
  (Mirko, 2026-11-03): it lives once, on the chain.
- **Workbench is the start page.** It shows the whole simulation at once:
  1. **Mission rail** on the left (collapsible).
  2. **Chain band** across the full width of the main column.
  3. **Card grid** below: the Block card with its transactions fills the left
     half; Next block sits top right, Mempool and Wallets under it. Activity
     takes a last row on tall screens.
- **No separate pages for race or missions.** The race lives in the Next
  block card; missions live in the rail and point at the part of the
  workbench they need.
- Hash lab and Chain lab stay separate tools.
- Chain lab offers three experiments within the same view: **Repair a chain**,
  **Competing branches** and **Prove a payment**. The fork experiment has Competition and Rewrite history scenarios, a
  nominal hash-power split, two labelled histories and a visible selected branch.
  Keep Run/Stop and one-block stepping above the growing history. Runs stop after
  twelve new blocks. Shared ancestry is shown once; each branch states its valid
  block count and accumulated expected target work. At the fixed one-zero target,
  every valid block adds 16 work units. Extra zeros and observed attempts add no
  extra work. A tie retains the incumbent; strictly more valid work can switch it.
  Changing power cancels unfinished work and keeps history; scenario/reset starts
  fresh. Leaving cancels pending work. Explain the altered payment as text, not a
  forged signature, real ledger or measured attack probability. Mission completion
  leaves the observed outcome visible. Closing guidance cancels pending lesson work
  and hides coaching; completed mission rewards remain.
- **Prove a payment** shows a Merkle proof. The learner chooses a block of 4, 16,
  256 or 4,096 toy payments ("12 hashes instead of 4,096 transactions") and one
  transaction; only the 4- and 16-transaction blocks list every transaction. The
  path runs level by level from the txid to the computed root, each sibling with
  its side, then compares it with the header's full 64-character Merkle root and
  says "Payment proven" or "Payment not proven". An edited payment text or sibling
  hash turns only the first diverging level red, with its level named in text. The
  verdict is live, so the experiment adds no filled action; "Reset example" restores
  the 16-transaction example.

### Existing features in the workbench

Features that reached master during the workshop get these places (lead
decision, 2026-10-27):

- **Leaderboard** is the fourth tab: Workbench · Hash lab · Chain lab ·
  Leaderboard. The labs and the board are views behind the tabs, not dialogs;
  the tab is in the URL (`#/hash-lab`, `#/chain-lab`, `#/pool`).
- **Miner name** (Mirko, 2026-11-01): the strip at the top of the Next block
  card holds the visitor's name, in every mode. A visitor starts with a
  generated name from Bitcoin's history (`Not-Satoshi-4`); until they choose
  their own the strip invites them: label "Enter your name", larger, blue, the
  field glows. Once a name is chosen the strip steps back to a quiet line
  ("Your name") (Mirko, 2026-11-03). An emptied field returns to the generated
  name. It locks
  during a race. One line says what happens to the next block and what
  became of the last one, with the rank. The Leaderboard tab shows the same
  name.
- **Every block counts** (Mirko, 2026-11-01): every block this browser mines
  carries the name in the coinbase and goes to the leaderboard,
  whichever simulated miner wins (ADR 0003). The selected block says "signed
  <name>" beside its miner. A proof counts while its Bitcoin block is one of
  the last 144 (about a day); the tab lists "Last 144 blocks" and "All time",
  ranked by the smallest hash, then a continuous search for one more zero.
  Every row has Verify.
- **Miner profile** (2026-11-03): a name on the board opens that miner's
  profile inside the Leaderboard tab at `#/pool/<name>`, a shareable link
  ("Copy link"); browser back and a "Leaderboard" link return to the lists.
  It shows both ranks, rounds, blocks sent, the whole best hash with its
  leading zeros, and one row per round (Bitcoin block linked to
  mempool.space, zeros, difficulty, blocks, time) with Verify. A name without
  blocks says "No blocks for this name yet."; the visitor's own name gets a
  quiet "you". The search below keeps running while a profile is open.
- **Leaderboard ticker** (Mirko): a slim band directly under the top bar
  runs the all-time leaderboard of all visitors from right to left (rank,
  name, zeros, difficulty, best hash), then the special finds: best today,
  most blocks, latest find. It pauses on hover and focus, is static under
  `prefers-reduced-motion`, invites to the first block while the board is
  empty and disappears quietly when the leaderboard server is unavailable.
  Clicking it opens the Leaderboard tab.
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
  9. Follow the stronger chain (Chain lab)
  Missions unlock in order; free play never needs a mission. Progress stays
  in the browser. Reloading retains completed missions and rewards; the active
  mission restarts at its first step because simulator and lab state start fresh.
  Opening or hiding missions within the page retains the active step. Lab missions
  use the labs' own temporary state and never change the simulator chain.
- **Experiment settings** (coin name, difficulty, halving interval, target
  block time) move into a "Settings" dialog in the overflow menu; difficulty
  also stays in the Next block card.
- **Usage sharing** (analytics opt-in) moves into the overflow menu and keeps
  its consent text.
- **Wallet details** (recovery phrase, transactions) open from a wallet row;
  **block and transaction details** open from the Block card.
- **Fresh start:** before the demo is set up, the chain band shows only
  Genesis and the candidate, and the single primary in the Next block card
  is "Start demo".
- **Stop mining** is the Pause action of the running race; Auto-mine is the Repeat toggle joined to Play/Pause in the Next block card.
  **Auto-mine is a setting, not a start** (Mirko, 2026-11-02): it starts off and never
  starts or stops a search by itself. Play ("Mining", or "Start demo" on a fresh chain)
  starts a run; with Auto-mine on, each found block starts the next one after a short
  pause, and Pause stays the primary between blocks. Turning it off lets the active
  block finish and schedules no further block; turning it on during a block lets the
  run continue. Pause stops the current search and the run, including between rounds,
  and keeps the setting for the next Play. Auto-transact separately
  fills the empty mempool with sample transactions between rounds.
  **Repeat toggle form** (Mirko, 2026-11-03, workshop round 1, variant 1): a slim add-on
  joined to the right of its action, an icon and the visible label "Auto" (the accessible
  name stays "Auto-mine" or "Auto-transact"). On is tinted (blue tint, blue text), never
  filled, so the action beside it stays the one filled or tinted invitation; an inset seam
  separates the two.
- **Auto-transact** starts off. Its Repeat toggle is joined to the right of "New
  transaction" in the Mempool header, in the same form as Auto-mine beside Mining, and
  explains its behavior on hover. It fills only an empty mempool with eight sample
  transfers, waits while a candidate is being mined, and keeps existing transfers
  when switched off.
  A fresh unfunded chain waits for a mining reward. Reset turns both repeats off.
- **Live zero bars** show the highest observed zero count from the last second,
  including peaks between rendered frames. New highs rise promptly; older highs
  settle to the highest younger result with a 360 ms ease-out. The current hash
  and exact zero count remain instantaneous. Reduced motion retains the one-second
  observation window and removes the interpolation.
- **Difficulty** starts at 4; the selectable range remains 1–10.
- **Sound** starts on. A short, warm impact and bright success chime mark a completed
  mining operation. The first click or keyboard action unlocks browser audio;
  enabling Sound also unlocks it. A mute change during mining applies to its result.

### Chain band

- Reads **left to right as a timeline**: #0 Genesis on the left, the newest
  block on the right, then the **dashed candidate** "#N next · k tx waiting".
- The **block number stands above its tile** ("#3"). The tile shows how long
  ago the block was mined ("just now", "2 min ago", from its header time,
  ticking), the time it took to mine, miner, tx count, stored previous hash and
  the **short hash** (first 6 + last 2 characters, `0080a3…4d`) with its
  leading zeros highlighted. Hover or keyboard focus shows the full hash with
  **Copy**.
- **No hint text in the header** (Mirko, 2026-11-03): no "grows to the right",
  no "click a block …"; the band explains itself.
- **Links between tiles are a 1 px hairline with a small neutral dot.** No
  icon, no badge, no color while intact. Hover explains the link ("Link
  intact · #3 stores the hash of #2"). Red or amber only when broken.
- **Key figures** are one quiet line in the band header: average block time
  against the target, difficulty, reward, next halving. No key-figure tile,
  no chart in the band.
- **Chain health is one pill** beside the title, "Chain valid" or "Chain
  invalid": the only standing chain status in the product (Mirko,
  2026-11-03). A click on it shows the line "N of N hashes meet their target ·
  N of N links intact" (or the causes) and the per-block checks aligned under
  the tiles; another click hides them. They open by themselves when the chain
  is invalid.
- **The Block card follows the newest block.** A click on a tile holds that
  block, also while new blocks are mined; a second click lets go. A held tile has the strong white frame, the followed newest a thin one.
  Tampering and re-mining show their block while the chain is invalid, without
  holding it: once the chain is valid again the card follows the newest block,
  or the block the learner holds.
- **The row scrolls sideways with the touchpad** (Mirko, 2026-11-03): all
  blocks sit in one row of fixed-width tiles; a horizontal swipe moves through
  them. No paging buttons, no visible scrollbar, no swipe-back navigation at
  the edges. While the row is at its newest end it follows new blocks;
  scrolled back it stays on its blocks. Letting go of a held block returns to
  the newest; a held or repaired block outside the view scrolls in.

### Card grid

- **One grid.** The Block card spans both rows on the left. Next block and
  Mempool share their column edges with the cards beside them; Wallets is the
  narrow column next to Mempool.
- **Block:** one card for the block shown in the chain: the whole hash with
  Copy, the whole previous hash, nonce, miner with time, tries and reward, the
  whole Merkle root; "Open in Chain lab", "Tamper with this block". Details show
  the block's 80 header bytes, field by field. All hashes keep their 64
  characters, on two lines of 32 where one line is too short: their length is
  part of the lesson. Under them the card lists the block's **transactions**,
  one line each. A click opens one in place: inputs, outputs and the whole TXID;
  scripts, signature and raw bytes stay one click further in the dialog.
- **Next block:** the one primary action "Mining" with Play, an adjacent Repeat toggle for Auto-mine,
  difficulty stepper, and the last round as one lane per miner (Hal, Dorian, Laszlo by default)
  with "Back Hal / Back Dorian / Back Laszlo". While mining it becomes the **live race** in
  place. The header names no predecessor and the stepper no `bits` (Mirko, 2026-11-03).
- **Miner editor** (Mirko, 2026-11-03): between races a click on a miner's name opens a small
  editor under its lane: a name for this session only (blocks and transactions store scripts, so
  every view shows it; the color stays; a reset restores the defaults) and a hashpower slider
  (1–10) labelled with the miner's share of all hashpower in percent, its chance to find the next
  block. There is no standing odds line.
- **Create miner** (Mirko, 2026-11-02): a quiet "Create miner" link at the right under the lanes
  opens a name form under the lanes, like "Create wallet". The new miner is also a wallet, shares
  the wallets' name rules, starts at 0 and races from the next block at hashpower 5 of 10; it
  shows a lane and a wallet row at once. It is offered between races only, never during a live
  race or a repair. At most four miners race; from three on the lanes get slimmer so Mempool and
  Wallets keep their lists at the reference size.
- **Wallets:** a narrow column with name and balance, sized for the five sample
  wallets plus one the learner creates; more wallets scroll inside the card and
  "Create wallet" stays in its header. Role, blocks won and hash rate appear
  where the card is wider; blocks won and hashpower are in the wallet details.
- **Mempool:** pending transactions with their coins, change, fee, size and fee rate, one line
  each where the card is narrow, in the order the next block's miner takes them, and the coinbase
  line "added when #N is mined" with reward plus the fees of what fits. Under the header a quiet
  **block space** line shows the next block's room for payments as a meter ("Block space #7 ·
  1,262 B of 1,300 B · 3 wait"); the header says "5 of 8 fit into #7" instead of "goes into #7"
  when not all fit. A transfer without room steps back (secondary text) and names why with an amber
  dot: "waits · block full" or "waits for its parent"; one orphaned by an edit says so in red. While
  mining, only the rows that fit read "being mined into #N". The form offers a **Fee rate** (1 sat/B
  low, 5 normal as default, 20 high) and its preview names the size and rate. A row opens its
  transaction details; **"New transaction" sits in the card header** as a tinted button
  with the same glow as Mine block, with the Auto-transact Repeat toggle joined to its right.
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
  with a coach ring** and a small label ("Step 3 · back Hal").

## Interaction patterns

Every flow covers its states, not only the success path.

| State | Pattern |
|---|---|
| Idle | Mining is the primary action; New transaction glows as the second invitation. |
| Mining | The Next block card becomes the live race: per miner the current nonce and hash, leading characters checked against the target, attempts and elapsed time against the target time. The Play primary becomes Pause in the same place; the header says "Mining block #N…". The adjacent Repeat toggle stays available as a setting, and Pause also stays available between the blocks of a run that Auto-mine continues. The candidate tile says "mining". Mempool rows read "being mined into #N". New transaction stays available without glow. |
| Block found | The new tile appears on the right with a short calm highlight; the race line becomes "Last round". No confetti. |
| Tampered | The changed block turns red with "Hash mismatch" and its new hash (the stored one struck through). Descendants turn amber with "Built on a broken block"; their own links are intact and say so. The chain pill says "Chain invalid", the checks open, Mine pauses with "Paused while the chain is invalid", and the single primary becomes "Re-mine block #2". When the edit breaks a ledger rule (a signature, a spent coin, a coinbase claiming too much) re-mining cannot help, so the primary is "Undo edit in block #2" with the reason beside it. Red only for the broken block and its direct status. |
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
| ≥ 1200 wide and ≥ 830 tall | Fills the screen without scrolling. Extra height goes to lists (wallets, mempool), extra width to more block tiles in view and to cards; never to empty padding. |
| ≥ 1100 tall | The Activity card appears as row 3 and takes the height lists cannot fill. |
| ≥ 2200 wide | Content capped at ~2160 px and centered; the background continues. |
| < 830 tall (e.g. 1366 × 657) | The page scrolls vertically; cards keep their density instead of squeezing. |
| 1024–1279 wide | Collapsed Missions entry unless explicitly opened; tiles keep their width; the row scrolls sideways. Below 1200 the Block card stays left and Next block, Mempool and Wallets stack on the right; the page scrolls. |
| 768–1023 wide | Mission rail becomes a bar on top; the chain becomes a vertical timeline (newest on top, candidate first); then Next block, Mempool, Block and Wallets, one under the other. |
| < 768 wide | Phone: compact top bar, mission bar, vertical timeline, health line, key-figure line, then Next block, Mempool, Block, Wallets. The race sits directly under the chain. |

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
| Miners and wallets | `--hal` (amber), `--dorian` (violet), `--laszlo` (pink), `--spare` (teal, a created miner), `--alice`, `--bob`, `--chris` | fixed per participant at creation, kept through a rename |
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
| Top bar | Brand, four-tab navigation, overflow menu (with the coin label); below 768 px the tabs fold into the menu |
| Block tile | Number above, age ("2 min ago"), time to mine, miner chip, tx count, stored previous hash, short hash with highlighted zeros; states `is-selected` (held), `is-current` (followed), `is-newest`, `is-broken`, `is-dependent`; full-hash tooltip with Copy on hover and keyboard focus |
| Candidate tile | Dashed; idle "next", mining "mining · 3.4 s", paused while invalid |
| Link | 1 px hairline with a neutral 6 px dot; `is-broken` red, `is-dependent` amber; explaining tooltip |
| Chain health | One line, collapsible strip of per-block checks on the tile column grid |
| Card | Panel surface, 1 px line, no shadow; header with title, status pill and at most one action |
| Next block card | Miner name, primary action, Auto-mine, difficulty stepper, race lanes; live race state; repair state |
| Repeat toggle | "Auto" with the repeat icon, joined right of its action; pressed is tinted, never filled; the card gives height, border and outer corners |
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
  highlighted. Only for tiles, hints and lists, where the full hash is one hover
  or one click away. Where a hash is the subject, show all 64 characters.
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

- The workshop prototype started the right column under the third visible tile
  and gave the Next block card a notch pointing at the candidate; both are not
  built, because the chain band shows a varying number of tiles.

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
