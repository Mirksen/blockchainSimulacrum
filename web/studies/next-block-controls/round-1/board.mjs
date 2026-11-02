// Capture every variant on the running app and write one self-contained board.
// Usage (from web/, with `npx vite --port 4190` running):
//   node studies/next-block-controls/round-1/board.mjs <out-dir> [base-url]
// Screenshots and the board go to <out-dir>; nothing here is checked in.
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';
import process from 'node:process';
import { chromium } from 'playwright';
import { variants } from './variants.mjs';

const out = process.argv[2];
const base = process.argv[3] ?? 'http://localhost:4190/';
if (!out) throw new Error('Usage: node board.mjs <out-dir> [base-url]');
await mkdir(out, { recursive: true });

const STATES = [
  { key: 'off', label: 'Aus, bereit' },
  { key: 'on', label: 'An, bereit (Play startet)' },
  { key: 'run', label: 'An, Lauf aktiv (Pause)' }
];

async function capture(theme) {
  const browser = await chromium.launch({ channel: 'chrome' });
  const page = await browser.newPage({ viewport: { width: 1512, height: 860 }, deviceScaleFactor: 2 });
  await page.addInitScript(() => localStorage.setItem('proofofwork-missions-intro-seen', '1'));
  await page.route('https://api.proofofwork.fyi/**', route => route.abort());
  await page.route('https://eu.i.posthog.com/**', route => route.abort());
  // After the demo, hold every search at its start so "running" stays on screen.
  let hold = false;
  await page.route(/powSearch\.worker/, route => (hold ? undefined : route.continue()));
  await page.goto(base);
  await page.evaluate(value => document.documentElement.setAttribute('data-theme', value), theme);
  await page.getByRole('button', { name: 'Start demo', exact: true }).click();
  await page.getByRole('button', { name: 'Mining', exact: true }).waitFor({ timeout: 60000 });
  hold = true;
  const repeat = page.getByRole('button', { name: 'Auto-mine', exact: true });
  const card = page.locator('section.next-block');
  const clip = async () => {
    const top = await card.boundingBox();
    const actions = await page.locator('.next-block-actions').boundingBox();
    return { x: top.x, y: top.y, width: top.width, height: actions.y + actions.height + 14 - top.y };
  };
  const shots = {};
  for (const variant of variants) {
    await page.evaluate(css => {
      let style = document.getElementById('study-variant');
      if (!style) { style = document.createElement('style'); style.id = 'study-variant'; document.head.append(style); }
      style.textContent = css;
    }, variant.css);
    await page.mouse.move(0, 0);
    if (await repeat.getAttribute('aria-pressed') === 'true') await repeat.click();
    await page.mouse.move(0, 0);
    shots[`${variant.n}-off`] = await page.screenshot({ clip: await clip() });
    await repeat.click();
    await page.mouse.move(0, 0);
    shots[`${variant.n}-on`] = await page.screenshot({ clip: await clip() });
    await page.getByRole('button', { name: 'Mining', exact: true }).click();
    await page.getByRole('button', { name: 'Pause', exact: true }).waitFor();
    await page.mouse.move(0, 0);
    shots[`${variant.n}-run`] = await page.screenshot({ clip: await clip() });
    await page.getByRole('button', { name: 'Pause', exact: true }).click();
    await page.getByRole('button', { name: 'Mining', exact: true }).waitFor();
  }
  await browser.close();
  return shots;
}

const dark = await capture('dark');
const light = await capture('light');
for (const [key, png] of Object.entries(dark)) await writeFile(join(out, `v${key}-dark.png`), png);
for (const [key, png] of Object.entries(light)) await writeFile(join(out, `v${key}-light.png`), png);

const commit = execFileSync('git', ['rev-parse', '--short', 'HEAD'], { encoding: 'utf8' }).trim();
const esc = text => String(text).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const img = (png, alt) => `<img alt="${esc(alt)}" src="data:image/png;base64,${png.toString('base64')}">`;
const tiles = variants.map(v => `
<figure class="tile" id="v${v.n}">
  <figcaption><div class="head"><span class="num">${v.n}</span><h2>${esc(v.title)}</h2></div>
    <div class="chips"><span class="chip"><b>UX</b> ${esc(v.ux)}</span><span class="chip"><b>UI</b> ${esc(v.ui)}</span></div>
    <p>${esc(v.why)}</p></figcaption>
  <div class="states">${STATES.map(s => `<div class="state"><span class="lbl">${esc(s.label)}</span>
    <div class="theme dark">${img(dark[`${v.n}-${s.key}`], `${v.title}, ${s.label}, dunkel`)}</div>
    <div class="theme light">${img(light[`${v.n}-${s.key}`], `${v.title}, ${s.label}, hell`)}</div></div>`).join('')}</div>
</figure>`).join('');
const template = await readFile(new URL('./board.template.html', import.meta.url), 'utf8');
await writeFile(join(out, 'board.html'), template
  .replace('{{basis}}', `Stand ${new Date().toISOString().slice(0, 10)} · Commit ${commit} · Runde 1`)
  .replace('{{tiles}}', tiles));
console.log(join(out, 'board.html'));
