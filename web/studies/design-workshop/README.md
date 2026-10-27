# Design workshop

Workshop rounds for the redesign described in [`web/DESIGN.md`](../../DESIGN.md).
Each round shows the current product (tile 0, top left) next to eight
variants; Mirko prioritizes, the next round narrows down.

```
round-N/
  meta.json      labels, UX focus and UI taste per tile
  original.png   current product at 1440 × 900
  vN.html        one self-contained static mockup per variant
```

Build the comparison board (single file, not checked in):

```sh
python3 web/studies/design-workshop/build.py round-1
```

Mockups use the fictional sample data from `round-1/BRIEF.md`: no external
requests, system fonts, inline SVG icons. They are design probes, not product
code; the study is deleted when the target picture in `DESIGN.md` is built.
