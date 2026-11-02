# Next block controls workshop

Workshop rounds for the Auto-mine toggle beside Play (see `web/DESIGN.md`, "How design is made").
The behavior is built: Auto-mine is a setting, Play starts, Pause ends. The rounds decide only the
form of the toggle add-on. Tile 0 is the product, tiles 1–8 are CSS overlays on the real app, so
every screenshot shows the real card, tokens and states.

```
round-N/
  variants.mjs          tile titles, notes (German, for Mirko) and the CSS of each variant
  board.mjs             captures every variant in three states and both themes, writes the board
  board.template.html   the board page
```

Build the board (not checked in) from `web/`, with the dev server on port 4190:

```sh
npx vite --port 4190 &
node studies/next-block-controls/round-1/board.mjs /tmp/next-block-controls
```

The study is deleted when the chosen form is built.
