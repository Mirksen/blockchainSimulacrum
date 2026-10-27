# Workbench components — build contract

Temporary contract for the rebuild (web/DESIGN.md, "Rebuild"). Deleted when the
rebuild closes.

## Sources
- Target picture and rules: `web/DESIGN.md` (wins over everything else).
- Visual reference: `web/studies/design-workshop/round-6/` — `base.html` (idle,
  fluid, all breakpoints in its header comment), `mining.html`, `tampered.html`,
  `light.html`, `phone.html`. Match their look; reuse their CSS where it fits,
  rewritten on the product tokens.
- Tokens: `web/src/styles/tokens.css` only. No hex colors in component CSS.
- Simulation API: `web/src/hooks/useBlockchain.js` (snapshot fields incl.
  `blockStatus`, `tamperedEdits`; functions incl. `remineBlock`, `undoTamper`,
  `createWallet`, `backMiner`) and `web/src/lib/blockchain.js`.
- Missions: `web/src/lib/missions.js`; coach marks: `CoachMark.jsx` in this folder.

## Rules for every component
- Presentational: data and callbacks come in as props; no `useBlockchain` call
  inside, no global state, no fetching (except LeaderboardTicker).
- Each component fills its container (`height: 100%`, lists scroll inside,
  header stays visible) so the parent grid decides sizes.
- One CSS file per component next to it, class names prefixed with the component
  name in kebab case (`.chain-band-…`, `.next-block-…`).
- Inline SVG icons, no emoji. English copy per DESIGN.md "Language and tone".
- Status always color plus text. Focus visible. Hover tooltips also on focus.
- `coach` prop: `{ target, label } | null` from `missions.activeStep`; wrap the
  element a mission step targets in `<CoachMark target="…" coach={coach}>`.
  Target ids are the `target` strings in `missions.js`.
- Short hash: first 6 + last 2 characters with "…", leading zeros highlighted.
- A component test (vitest + @testing-library/react) per component for its
  states and callbacks.
