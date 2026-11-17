import { verifyMerkleMission } from './new-missions.acceptance.mjs';
import { verifyTour } from './tour.acceptance.mjs';
// Layout checks in WebKit, the engine of Safari on iPhone: the Chrome acceptance
// (scripts/acceptance.mjs) does not see engine-specific layout. Today: the blocks of the
// chain band stand apart, with the link between them, on a phone and on a desktop.
// Pool and telemetry requests are refused, so no live data changes.
import { asReturningVisitor, workbench } from './workbench.helpers.mjs';
import { webkit, devices } from 'playwright';
import { spawn } from 'node:child_process';
import { mkdir, mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { stripVTControlCharacters } from 'node:util';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';

const root = fileURLToPath(new URL('..', import.meta.url));
const baseURL = process.env.BASE_URL || 'http://127.0.0.1:4182';
let server, browser;

// Mines blocks #2–#3 after the demo and returns the left/right edges of every tile in the row.
const tileEdges = async (context, band) => {
  const page = await context.newPage();
  page.setDefaultTimeout(120000);
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.route(/^https:\/\/(eu\.i\.posthog\.com|api\.proofofwork\.fyi)\//, route => route.abort('connectionrefused'));
  await page.goto(baseURL);
  const wb = workbench(page);
  await page.getByRole('button', { name: 'Start demo', exact: true }).click();
  await wb.mine(2).waitFor();
  for (const next of [2, 3]) { await wb.mine(next).click(); await wb.mine(next + 1).waitFor(); }
  const edges = await page.evaluate(selector => {
    const scroll = document.querySelector(`${selector} .chain-band-scroll`);
    scroll.scrollLeft = 0;
    return [...scroll.querySelectorAll('.chain-band-row:not(.chain-band-strip) .chain-band-item')].map(item => {
      const tile = item.querySelector('.chain-band-tile, .chain-band-cand').getBoundingClientRect();
      return [Math.round(tile.left), Math.round(tile.right)];
    });
  }, band);
  assert.deepEqual(errors, []);
  await page.close();
  return edges;
};

// A first visit: the three answers of the start question stack inside the screen, and after
// "I know what a hash is" the first and the widest Basics scene (Sealed pages) fit without
// horizontal overflow.
const firstVisit = async (context, label) => {
  const page = await context.newPage();
  page.setDefaultTimeout(60000);
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.route(/^https:\/\/(eu\.i\.posthog\.com|api\.proofofwork\.fyi)\//, route => route.abort('connectionrefused'));
  await page.goto(baseURL);
  const question = page.getByRole('region', { name: 'Where do you want to start?', exact: true });
  await question.waitFor();
  // A configured build asks about usage sharing first; answer it so it covers nothing.
  const notice = page.locator('.usage-consent');
  if (await notice.count()) await notice.getByRole('button', { name: 'Opt out', exact: true }).click();
  const fits = async what => {
    const size = await page.evaluate(() => ({ viewport: innerWidth, page: document.documentElement.scrollWidth }));
    assert.ok(size.page <= size.viewport, `${label} ${what}: horizontal overflow ${JSON.stringify(size)}`);
  };
  await fits('start question');
  const boxes = await question.locator('.start-choice-option').evaluateAll(options => options.map(option => {
    const box = option.getBoundingClientRect();
    return [Math.round(box.left), Math.round(box.right), Math.round(box.top), Math.round(box.bottom)];
  }));
  const width = await page.evaluate(() => innerWidth);
  assert.equal(boxes.length, 3, `${label}: three answers`);
  for (let i = 0; i < boxes.length; i++) {
    assert.ok(boxes[i][0] >= 0 && boxes[i][1] <= width, `${label}: answer ${i + 1} inside the screen: ${JSON.stringify(boxes)}`);
    if (i) assert.ok(boxes[i][2] >= boxes[i - 1][3], `${label}: answer ${i + 1} below answer ${i}: ${JSON.stringify(boxes)}`);
  }
  await question.getByRole('button', { name: /^I know what a hash is/ }).click();
  await page.getByRole('heading', { level: 2, name: 'The copy problem', exact: true }).waitFor();
  await fits('Basics scene 1');
  await page.getByRole('button', { name: /^Scene 6: / }).click();
  await page.getByRole('heading', { level: 2, name: 'Sealed pages', exact: true }).waitFor();
  await fits('Basics scene 6');
  assert.deepEqual(errors, []);
  await context.close();
};

// Each tile face starts one link width after the previous face ends (the 3D side is
// drawn into that link, so the visible gap is the link minus --block-depth).
const assertApart = (label, edges, minGap) => {
  assert.ok(edges.length >= 4, `${label}: ${JSON.stringify(edges)}`);
  for (let i = 1; i < edges.length; i++) {
    const gap = edges[i][0] - edges[i - 1][1];
    assert.ok(gap >= minGap, `${label}: tile ${i} starts ${gap} px after tile ${i - 1} (expected ≥ ${minGap}): ${JSON.stringify(edges)}`);
  }
};

try {
  if (!process.env.BASE_URL) {
    server = spawn(process.execPath, [fileURLToPath(new URL('../node_modules/vite/bin/vite.js', import.meta.url)), 'preview', '--host', '127.0.0.1', '--port', new URL(baseURL).port, '--strictPort'], { cwd: root, stdio: ['ignore', 'pipe', 'pipe'] });
    let log = '';
    server.stdout.on('data', data => { log += data; });
    server.stderr.on('data', data => { log += data; });
    let ready = false;
    for (let i = 0; i < 100 && !ready; i++) {
      if (server.exitCode !== null) throw new Error(`Preview exited: ${log}`);
      try { ready = stripVTControlCharacters(log).includes(baseURL) && (await fetch(baseURL)).ok; } catch { /* Startup only. */ }
      if (!ready) await new Promise(resolve => setTimeout(resolve, 100));
    }
    assert.ok(ready, `Preview did not start: ${log}`);
  }
  browser = await webkit.launch({ headless: true });
  for (const [label, options] of [['phone', devices['iPhone 13']], ['desktop', { viewport: { width: 1512, height: 860 } }]]) {
    await firstVisit(await browser.newContext({ ...options, reducedMotion: 'reduce' }), label);
  }
  const phone = await browser.newContext({ ...devices['iPhone 13'], reducedMotion: 'reduce' });
  await asReturningVisitor(phone);
  // compact band: 16 px link
  assertApart('phone', await tileEdges(phone, '.chain-band.is-compact'), 16);
  const desktop = await browser.newContext({ viewport: { width: 1512, height: 860 }, reducedMotion: 'reduce' });
  await asReturningVisitor(desktop);
  // full band: 32 px link
  assertApart('desktop', await tileEdges(desktop, '.chain-band:not(.is-compact)'), 32);
  await verifyMerkleMission(browser, baseURL, process.env.SCREENSHOT_DIR || '/tmp', false);
  const screenshots = process.env.SCREENSHOT_DIR
    ? join(process.env.SCREENSHOT_DIR, 'webkit')
    : await mkdtemp(join(tmpdir(), 'proofofwork-webkit-'));
  await mkdir(screenshots, { recursive: true });
  for (const result of await verifyTour(browser, baseURL, screenshots)) console.log(`WebKit: ${result}`);
  console.log('WebKit layout: start question and Basics scenes fit; chain band blocks stand apart on phone and desktop');
} finally {
  await browser?.close();
  server?.kill();
}
