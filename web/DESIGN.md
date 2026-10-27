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

The redesign is being workshopped (started 2026-10-27). Round 1 compares the
current product with eight directions, each pairing a **UX focus** (what
leads the screen) with a **UI taste** (how it feels). Until a direction is
chosen, the existing UI stays as it is and only the findings below apply.

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

Open · workshop. Decided after the UI taste is chosen: one token set with a
light and a dark value per token; miner colors and validity states are
semantic tokens, never hex values in components.

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
