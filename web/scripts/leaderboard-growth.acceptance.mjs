import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { chromium, webkit } from 'playwright';
import { readFileSync } from 'node:fs';
const GENESIS = JSON.parse(readFileSync(new URL('../../shared/genesis.json', import.meta.url), 'utf8'));

export async function verifyLeaderboardGrowth(page, output, baseURL) {
  await mkdir(output, { recursive: true });
  const name = 'fixture-miner-12345';
  const round = { height: 900001, hash: 'a'.repeat(64) };
  const bestHash = '000000' + 'a'.repeat(58);
  const block = { round, header: '00'.repeat(80), coinbase: '0100', branch: [], bestHash, bestZeros: 6, difficulty: 1048576, proofs: 12, foundAt: 1800000000000, inWindow: false, rank: 1 };
  const summary = { bestHash, bestZeros: 6, proofs: 9876, rounds: 250 };
  const errors = [];
  const onError = error => errors.push(error.message);
  page.on('pageerror', onError);
  const mock = async route => {
    const request = route.request();
    assert.equal(request.method(), 'GET', 'Acceptance never writes to the pool');
    const path = new URL(request.url()).pathname;
    let body;
    if (path === '/api/leaderboard') body = { recent: null, allTime: [{ ...block, name }] };
    else if (path === '/api/miner') body = { name, rank: { window: null, allTime: 1 }, summary: { allTime: summary, window: { bestHash: null, bestZeros: null, proofs: 0, rounds: 0 } }, blocks: [block] };
    else if (path === '/api/rounds') body = { genesisHash: GENESIS.hash, rounds: [{ round, name, bestHash, bestZeros: 6, proofs: 1234, miners: 3 }] };
    else return route.abort();
    await route.fulfill({ status: 200, contentType: 'application/json', headers: { 'Access-Control-Allow-Origin': '*' }, body: JSON.stringify(body) });
  };
  await page.route('https://eu.i.posthog.com/**', route => route.abort());
  await page.route('https://api.proofofwork.fyi/**', mock);
  try {
    await page.goto(`${baseURL}/#/pool`);
    await page.getByRole('region', { name: 'Finished rounds' }).waitFor();
    await page.getByRole('region', { name: 'Finished rounds' }).getByRole('link', { name }).click();
    await page.getByRole('heading', { name }).waitFor();
    assert.match(await page.locator('.miner-profile-stats').innerText(), /9,876/);
    await page.getByRole('button', { name: 'Verify the block of round 900001' }).click();
    await page.getByText('Does not match the listed hash and name.').waitFor();
    for (const theme of ['dark', 'light']) {
      await page.evaluate(theme => document.documentElement.setAttribute('data-theme', theme), theme);
      for (const width of [320, 390, 768, 1200, 1440]) {
        await page.setViewportSize({ width, height: 900 });
        const size = await page.evaluate(() => ({ width: innerWidth, scroll: document.documentElement.scrollWidth }));
        assert.ok(size.scroll <= size.width, JSON.stringify({ theme, ...size }));
        await page.screenshot({ path: join(output, `growth-profile-${theme}-${width}.png`), fullPage: true });
      }
    }
    await page.getByRole('link', { name: 'Leaderboard', exact: true }).click();
    await page.getByRole('region', { name: 'Finished rounds' }).waitFor();
    for (const theme of ['dark', 'light']) {
      await page.evaluate(theme => document.documentElement.setAttribute('data-theme', theme), theme);
      for (const width of [320, 390, 768, 1200, 1440]) {
        await page.setViewportSize({ width, height: 900 });
        assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
        await page.screenshot({ path: join(output, `growth-history-${theme}-${width}.png`), fullPage: true });
      }
    }
    assert.deepEqual(errors, []);
  } finally { page.off('pageerror', onError); await page.unroute('https://api.proofofwork.fyi/**', mock); }
}

if (process.argv[1]?.endsWith('leaderboard-growth.acceptance.mjs')) {
  for (const [engine, type] of [['chrome', chromium], ['webkit', webkit]]) {
    const browser = await type.launch({ headless: true, ...(engine === 'chrome' ? { channel: 'chrome' } : {}) });
    try {
      const page = await browser.newPage({ reducedMotion: 'reduce' });
      await verifyLeaderboardGrowth(page, `/tmp/leaderboard-growth-shots/${engine}`, process.env.BASE_URL || 'http://127.0.0.1:4193');
      console.log(`${engine}: populated profiles and history pass five widths and both themes`);
    } finally { await browser.close(); }
  }
}
