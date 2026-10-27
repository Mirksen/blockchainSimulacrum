# proofofwork.fyi — Design System

How the product feels, speaks and behaves, and what it is built from. The
order is deliberate: feeling first, then language and behavior, colors and
components last. Anyone building or changing a view checks it against every
section.

**In force or target picture.** A section without a marker is in force: new
and changed code follows it, and deviations in existing code are named. A
section marked "Target picture · round N" is decided but not yet built. A
section marked "Open · workshop" is still being decided in
[`studies/design-workshop/`](studies/design-workshop/). Origin and trade-offs
of a rule live in the PR and the study, not here.

## Status

The redesign is being workshopped (started 2026-10-27). Round 1 compared the
current product with eight directions, each pairing a **UX focus** (what
leads the screen) with a **UI taste** (how it feels). Round 2 refines the
decisions below. Until the target picture is complete, the existing UI stays
as it is.

## Information architecture

Target picture · round 1 (Mirko, 2026-10-27):

- **One workbench is the start page.** It merges the explorer (round 1,
  variant 6) and the workbench (variant 5): the top band shows the chain as
  block tiles, the candidate "Next block" left of the mined blocks; below it
  the workbench. Everything needed is visible on the page at once, not
  behind modals.
- **The mining race is part of the workbench**, not a page. It comes alive
  while a block is mined.
- **Missions start inside the workbench**, not on a page of their own. A
  mission points at the part of the workbench it needs.
- **Top navigation:** Workbench · Hash lab · Chain lab.
- **Block hashes** in tiles show the first 6 and last 2 characters
  (`0080a3…4d`). Hover or focus shows the full hash with a Copy action.

Target picture · round 2 (Mirko, 2026-10-27):

- **Layout: bento.** Under the block band a bento grid shows everything
  important at 1440 × 900 without scrolling (round 2, variant 5).
- **Missions: a collapsible rail on the left** (round 2, variant 4). The
  active mission is expanded with its steps; the current step marks the
  part of the workbench it needs with a coach ring. Collapsed, the rail
  keeps mission state visible as icons. No separate mission tile.
- **Race: in the block band** (round 2, variant 2). The "Next block" area
  becomes the live race while a block is mined.
- **Invalid states** (round 2, variant 8): the changed block shows "Hash
  mismatch" in red with text; its descendants show "Built on a broken
  block" in amber and never claim their own links changed; the chain pill
  says "Chain invalid"; mining pauses while the chain is invalid.

Target picture · round 3 (Mirko, 2026-10-27):

- **The chain band runs across the full width** and holds only the block
  tiles, with enough room per tile that nothing is squeezed.
- **The mining card lives in the grid**, compact (the "Next block" card of
  round 3, variant 1). It holds the one primary action "Mine block #N" and
  becomes the live race in place while a block is mined.
- **Chain health has no tile of its own**; it is integrated into the band.
- **Every tile fits its content.** Wallets are sized for the five sample
  wallets plus one the learner creates ("Create wallet"); more scroll
  inside the tile. Mempool and the selected block stay compact.
- **Light and dark themes** both ship, from one token set.
- **At 390 px the chain is a vertical list** you scroll down, not a
  sideways strip; the race sits directly under the chain.

Target picture · round 4 (Mirko, 2026-10-27):

- **The band reads left to right as a timeline**: #0 Genesis on the left,
  the newest block on the right, then the dashed candidate "#N next".
- **Links between tiles are quiet lines**, never an icon or badge; they
  carry the link state.
- **Chain health is one collapsible line under the tiles**, collapsed by
  default ("Chain valid · 5 of 5 hashes start with 00 · 4 of 4 links
  intact"); expanded it shows the per-block checks aligned under the tiles.
- **Next block and Mempool are separate cards**, stacked directly under the
  candidate tile.
- **Key figures are a quiet stat line in the band header**, not a tile.
- **Selected block above Wallets**, left of the Next block column.
- **Reference screen: MacBook Pro 14"** (1512 × 982 points, about
  1512 × 860 CSS px inside the browser). The workbench uses that space
  completely, without a fold and without empty strips.

Open in round 5: the link style, and checking the refined layout in its
states, light and at 390 px.

## Screen sizes

Target picture · round 5 (proposed by the lead after Mirko asked for other
common sizes, 2026-10-27; being checked in `round-5-sizes`). The MacBook
Pro 14" stays the reference; the layout is fluid around it:

| Viewport | Behavior |
|---|---|
| ≥ 1280 wide and ≥ 830 tall | Fills the screen without scrolling. Extra height goes to lists (wallets, mempool), extra width to block tiles (up to ~280 px each) and cards; never to empty padding. Type size stays the same. |
| ≥ 2200 wide | Content capped at ~2160 px and centered. Open: at QHD height (~1300) the five wallets and two transactions leave empty space in their cards. |
| < 830 tall (e.g. 1366 × 657) | The page scrolls vertically; cards keep their designed density instead of squeezing. |
| 1024–1279 wide | Mission rail collapses to icons; band tiles narrower (min ~150 px), earlier blocks behind a "‹ N earlier" control; grid in two columns. |
| 768–1023 wide | Chain as a vertical timeline, then Next block and Mempool, then Selected block and Wallets side by side. |
| < 768 wide | Phone layout: vertical timeline, race directly under the chain. |

No size scrolls sideways.

## Findings: current product (2026-10-27, commit 284c54e)

Inventory of `web/src` against the principles below:

| Finding | Measured |
|---|---|
| No leading step: the header has seven text buttons of equal weight (Auto-mine, mined count, Reset, Hash lab, Chain lab, theme, sound) | `App.jsx` header |
| Three equal columns compete; the learning goal is not guided | `App.jsx` main layout |
| Emoji used as icons | 68 in 12 components |
| Visual tokens drift | 25 distinct `font-size`, 45 distinct hex colors, 12 distinct `border-radius`, 30 `box-shadow` declarations in `index.css` and lab CSS |
| Design language borrowed from SAP Fiori (`--sap*` tokens), not the product's own | 363 `sap` references in `index.css` |
| Hashes dominate cards without explaining what to look at; genesis hash does not show the difficulty target | block cards, demo screenshot |

## Core feeling

Open · workshop. Draft to test against round 1:

proofofwork.fyi is a calm lab partner that lets you touch how proof of work
holds a chain together. It shows one thing to do next, explains what just
happened in plain words, and never pretends to be real money or a real
network.

Principles (draft):

1. **One step leads, the rest accompanies.** Each view has exactly one thing
   with the strongest weight: the next learning action.
2. **Show the mechanism, then the number.** A hash is shown with what to look
   at (leading zeros, the link to the previous block), not as a bare string.
3. **Calm means meaning.** Color, motion and sound carry a statement (a miner,
   a valid or broken link, a found block) or are absent.
4. **Honest about the model.** The UI says what the simulation simplifies:
   no network, no monetary value, a reset starts over.

## Language and tone

Open · workshop. In force already: English UI, short sentences, buttons are
verb plus object ("Mine next block", "Send transaction").

## Interaction patterns

Open · workshop. Every flow covers loading, empty, partial, error and
running (mining in progress, cancellable) states.

## Foundation (color, type, spacing, radius)

Target picture · round 1: the visual language of round 1 variant 6
("Explorer"): data-rich dark navy surfaces, blue-violet gradients only on
block tiles, tabular figures, monospace for hashes, status always as color
plus text. One token set with a dark and a light value per token (round 3,
variant 7 proved the light theme needs no markup change); miner colors and
validity states are semantic tokens, never hex values in components.

## Components

Open · workshop.

## Verification

Each view is checked light at 1440 px and dark at 390 px, and by keyboard.
The lead looks at the screenshots and judges them; technical checks alone do
not replace looking.

## How design is made

Adapted from the hausbot design process:

1. **Finding.** A target picture answers a measured finding (inventory,
   usage data) or Mirko's impression at a named place, not taste alone.
2. **Direction.** Workshop rounds in `studies/design-workshop/round-N/`:
   tile 0 is the current product, tiles 1–8 are variants. Mirko prioritizes
   UX focus and UI taste separately; the next round narrows.
3. **Target picture and prototype.** The chosen direction lands here as
   "Target picture · round N" with a prototype in the study.
4. **Review at the prototype.** Light at desktop, dark at 390 px.
5. **Backlog** with fixed steps: tokens and components, then views (one PR
   per view), then guards.
6. **Rebuild.** Each view PR shows before and after at 390 and 1440 px,
   light and dark.
7. **Close.** The PR finishing the target picture removes the marker and
   deletes the prototype; from then on the product is the reference.
