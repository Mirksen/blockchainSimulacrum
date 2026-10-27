#!/usr/bin/env python3
"""Build one self-contained comparison board for a design-workshop round.

Usage: python3 build.py round-1 [--out board.html]

The round directory holds meta.json, original.png and one HTML file per
variant. The board embeds everything (iframes via srcdoc, images as data URIs)
so it opens as a single file on another machine.
"""
import argparse
import base64
import html
import json
import subprocess
from pathlib import Path

HERE = Path(__file__).resolve().parent


def commit() -> str:
    try:
        return subprocess.check_output(
            ["git", "rev-parse", "--short", "HEAD"], cwd=HERE, text=True
        ).strip()
    except (OSError, subprocess.CalledProcessError):
        return "unknown"


def tile_body(round_dir: Path, item: dict) -> str:
    source = round_dir / item["file"]
    if source.suffix == ".png":
        data = base64.b64encode(source.read_bytes()).decode()
        return f'<img src="data:image/png;base64,{data}" alt="">'
    srcdoc = html.escape(source.read_text(encoding="utf-8"), quote=True)
    return f'<iframe tabindex="-1" loading="lazy" srcdoc="{srcdoc}"></iframe>'


def build(round_dir: Path) -> str:
    meta = json.loads((round_dir / "meta.json").read_text(encoding="utf-8"))
    axes = meta.get("axes", {"ux": "UX", "ui": "UI"})
    tiles = []
    for item in meta["variants"]:
        chips = "".join(
            f'<span class="chip chip-{k}"><b>{html.escape(axes[k])}</b> {html.escape(item[k])}</span>'
            for k in ("ux", "ui")
        )
        tiles.append(
            f'''<figure class="tile" data-n="{item["n"]}">
  <button class="frame" aria-label="Open variant {item["n"]}: {html.escape(item["title"])}">
    <div class="screen">{tile_body(round_dir, item)}</div>
  </button>
  <figcaption>
    <div class="cap-head"><span class="num">{item["n"]}</span><h2>{html.escape(item["title"])}</h2></div>
    <div class="chips">{chips}</div>
    <p>{html.escape(item["why"])}</p>
  </figcaption>
</figure>'''
        )
    return TEMPLATE.format(
        title=html.escape(meta["title"]),
        intro=html.escape(meta["intro"]),
        answer=html.escape(meta["answer"]),
        basis=f'Stand {meta["date"]} · Commit {commit()} · {html.escape(meta["round"])}',
        tiles="\n".join(tiles),
    )


TEMPLATE = """<!doctype html>
<html lang="de"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>{title}</title>
<style>
:root {{ --bg:#f3f2ef; --fg:#1b1b1a; --mut:#6b6a66; --line:#dddbd5; --card:#fff; --acc:#c2410c; }}
@media (prefers-color-scheme: dark) {{ :root {{ --bg:#141413; --fg:#ecebe7; --mut:#9a9893; --line:#2c2b29; --card:#1d1c1b; --acc:#fb923c; }} }}
* {{ box-sizing:border-box; }}
body {{ margin:0; background:var(--bg); color:var(--fg); font:15px/1.5 -apple-system, "SF Pro Text", system-ui, sans-serif; }}
header {{ padding:28px 32px 8px; max-width:1800px; margin:0 auto; }}
.basis {{ font-size:12px; color:var(--mut); margin:0 0 10px; }}
h1 {{ font-size:26px; margin:0 0 6px; letter-spacing:-.01em; }}
header p {{ margin:0 0 6px; color:var(--mut); max-width:880px; }}
.answer {{ display:inline-block; margin-top:8px; padding:8px 12px; border:1px solid var(--line); border-radius:8px; background:var(--card); font-size:13px; }}
.answer code {{ font:13px ui-monospace, Menlo, monospace; color:var(--acc); }}
main {{ display:grid; grid-template-columns:repeat(3, minmax(0,1fr)); gap:28px 24px; padding:20px 32px 48px; max-width:1800px; margin:0 auto; }}
@media (max-width:1100px) {{ main {{ grid-template-columns:repeat(2, minmax(0,1fr)); }} }}
@media (max-width:700px) {{ main {{ grid-template-columns:1fr; padding:16px; }} header {{ padding:20px 16px 0; }} }}
.tile {{ margin:0; }}
.frame {{ all:unset; display:block; width:100%; cursor:zoom-in; border-radius:10px; overflow:hidden; border:1px solid var(--line); background:#fff; box-shadow:0 1px 2px rgba(0,0,0,.06); transition:transform .15s, box-shadow .15s; }}
.frame:hover, .frame:focus-visible {{ transform:translateY(-2px); box-shadow:0 8px 24px rgba(0,0,0,.14); }}
.frame:focus-visible {{ outline:3px solid var(--acc); outline-offset:3px; }}
.tile[data-n="0"] .frame {{ border:2px solid var(--fg); }}
.screen {{ position:relative; width:100%; aspect-ratio:1440/900; overflow:hidden; }}
.screen iframe, .screen img {{ position:absolute; top:0; left:0; width:1440px; height:900px; border:0; transform-origin:0 0; pointer-events:none; display:block; }}
figcaption {{ padding:12px 2px 0; }}
.cap-head {{ display:flex; align-items:baseline; gap:10px; }}
.num {{ font:600 13px ui-monospace, Menlo, monospace; color:var(--acc); min-width:16px; }}
figcaption h2 {{ font-size:16px; margin:0; }}
.chips {{ display:flex; flex-wrap:wrap; gap:6px; margin:6px 0 4px 26px; }}
.chip {{ font-size:12px; padding:2px 8px; border-radius:999px; border:1px solid var(--line); background:var(--card); }}
.chip b {{ font-size:10px; letter-spacing:.06em; color:var(--mut); margin-right:4px; }}
figcaption p {{ margin:0 0 0 26px; font-size:13px; color:var(--mut); }}
dialog {{ border:0; padding:0; margin:0; inset:0; width:100vw; height:100vh; max-width:none; max-height:none; background:#111; }}
dialog::backdrop {{ background:transparent; }}
.dlg-bar {{ position:fixed; top:0; left:0; right:0; display:flex; gap:12px; align-items:center; padding:10px 16px; color:#fff; font-size:14px; z-index:2; background:rgba(0,0,0,.55); }}
.dlg-bar button {{ background:#fff2; color:#fff; border:1px solid #fff4; border-radius:6px; padding:4px 10px; font:inherit; cursor:pointer; }}
.dlg-bar .sp {{ flex:1; }}
.dlg-stage {{ position:absolute; top:48px; left:0; right:0; bottom:0; overflow:auto; display:flex; justify-content:center; }}
.dlg-stage .wrap {{ position:relative; flex:none; }}
.dlg-stage iframe, .dlg-stage img {{ width:1440px; height:900px; border:0; background:#fff; transform-origin:0 0; display:block; }}
</style></head>
<body>
<header>
  <p class="basis">{basis}</p>
  <h1>{title}</h1>
  <p>{intro}</p>
  <div class="answer">{answer}</div>
</header>
<main>
{tiles}
</main>
<dialog id="dlg" aria-label="Variante gross">
  <div class="dlg-bar"><button data-go="-1" aria-label="Vorherige">&larr;</button><button data-go="1" aria-label="Naechste">&rarr;</button><span id="dlg-title"></span><span class="sp"></span><span>Pfeiltasten, 0–8, Esc</span><button id="dlg-close">Schliessen</button></div>
  <div class="dlg-stage"><div class="wrap" id="dlg-wrap"></div></div>
</dialog>
<script>
const tiles = [...document.querySelectorAll('.tile')];
function fit() {{
  for (const s of document.querySelectorAll('.screen')) {{
    const k = s.clientWidth / 1440;
    for (const el of s.children) el.style.transform = 'scale(' + k + ')';
  }}
  const w = document.getElementById('dlg-wrap');
  const el = w.firstElementChild;
  if (el) {{
    const k = Math.min(1, (window.innerWidth - 32) / 1440);
    // Iframes fill the stage and scroll inside; screenshots keep their size.
    const h = el.tagName === 'IFRAME' ? Math.max(900, (window.innerHeight - 48) / k) : 900;
    el.style.height = h + 'px';
    el.style.transform = 'scale(' + k + ')';
    w.style.width = (1440 * k) + 'px'; w.style.height = (h * k) + 'px';
  }}
}}
const dlg = document.getElementById('dlg');
let current = 0, opener = null;
function show(n) {{
  current = (n + tiles.length) % tiles.length;
  const t = tiles[current];
  const src = t.querySelector('.screen').firstElementChild.cloneNode(true);
  src.removeAttribute('loading'); src.style.transform = '';
  if (src.tagName === 'IFRAME') {{ src.removeAttribute('tabindex'); src.style.pointerEvents = 'auto'; }}
  const w = document.getElementById('dlg-wrap'); w.replaceChildren(src);
  document.getElementById('dlg-title').textContent = t.querySelector('.num').textContent + ' · ' + t.querySelector('h2').textContent;
  if (!dlg.open) dlg.showModal();
  fit();
}}
tiles.forEach((t, i) => t.querySelector('.frame').addEventListener('click', e => {{ opener = e.currentTarget; show(i); }}));
dlg.addEventListener('click', e => {{ const b = e.target.closest('[data-go]'); if (b) show(current + Number(b.dataset.go)); }});
document.getElementById('dlg-close').addEventListener('click', () => dlg.close());
dlg.addEventListener('close', () => {{ document.getElementById('dlg-wrap').replaceChildren(); if (opener) opener.focus(); }});
document.addEventListener('keydown', e => {{
  if (/^[0-8]$/.test(e.key)) {{ opener = tiles[Number(e.key)].querySelector('.frame'); show(Number(e.key)); }}
  else if (dlg.open && e.key === 'ArrowRight') show(current + 1);
  else if (dlg.open && e.key === 'ArrowLeft') show(current - 1);
}});
window.addEventListener('resize', fit);
fit();
</script>
</body></html>
"""

if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("round")
    parser.add_argument("--out")
    args = parser.parse_args()
    round_dir = HERE / args.round
    out = Path(args.out) if args.out else HERE / f"board-{args.round}.html"
    out.write_text(build(round_dir), encoding="utf-8")
    print(out)
