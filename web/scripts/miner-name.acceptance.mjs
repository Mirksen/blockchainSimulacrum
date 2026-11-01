import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { isGeneratedName } from '../../shared/miner-names.mjs';
import { headerHash, openTab, workbench } from './workbench.helpers.mjs';

const API = 'https://api.proofofwork.fyi';
const GENESIS = JSON.parse(readFileSync(new URL('../../shared/genesis.json', import.meta.url), 'utf8'));
const ROUND = { height: 900001, hash: `0000${'ab'.repeat(30)}` };
const NAME = 'test-signer';
const CORS = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'GET, POST, OPTIONS', 'Access-Control-Allow-Headers': 'content-type' };
const prefix = name => `proofofwork.fyi|${GENESIS.hash}|${ROUND.height}:${ROUND.hash}|${name}|`;
const sha256 = text => createHash('sha256').update(text).digest('hex');

// A synthetic pool in the page's network: no leaderboard server is ever contacted. It keeps
// what the real one keeps, so the board in the browser shows what the browser sent.
function syntheticPool() {
  const blocks = [];
  const row = () => {
    const best = [...blocks].sort((a, b) => (headerHash(a.header) < headerHash(b.header) ? -1 : 1))[0];
    const bestHash = headerHash(best.header);
    return { name: NAME, round: ROUND, header: best.header, coinbase: best.coinbase, branch: best.branch, bestHash,
      bestZeros: /^0*/.exec(bestHash)[0].length, difficulty: 16, proofs: blocks.length, foundAt: 0 };
  };
  const route = async request => {
    if (request.request().method() === 'OPTIONS') return request.fulfill({ status: 204, headers: CORS });
    const url = new URL(request.request().url());
    const json = body => request.fulfill({ status: 200, headers: CORS, contentType: 'application/json', body: JSON.stringify(body) });
    if (url.pathname === '/api/challenge') {
      const name = url.searchParams.get('name');
      return json({ name, round: ROUND, windowStart: ROUND.height - 143, prefix: prefix(name), minZeros: 1, genesisHash: GENESIS.hash });
    }
    if (url.pathname === '/api/shares') {
      blocks.push(JSON.parse(request.request().postData()));
      return json({ accepted: true });
    }
    const rows = blocks.length ? [row()] : [];
    return json({ genesisHash: GENESIS.hash, recent: { from: ROUND.height - 143, to: ROUND.height, rows }, allTime: rows });
  };
  return { blocks, route };
}

// The name signs every block this browser mines, whichever miner wins the race.
export async function verifyMinerName(browser, baseURL, output) {
  const page = await browser.newPage({ viewport: { width: 1280, height: 830 } });
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  const pool = syntheticPool();
  await page.route(`${API}/**`, pool.route);
  await page.route('https://eu.i.posthog.com/**', route => route.abort('blockedbyclient'));
  try {
    await page.goto(baseURL);
    const input = page.getByLabel('Your miner name');
    const status = page.locator('#miner-name-status');
    await input.waitFor();
    const generated = await input.inputValue();
    assert.ok(isGeneratedName(generated), generated);
    await status.filter({ hasText: 'Every block you mine lands on the leaderboard under this name.' }).waitFor();
    assert.equal(await page.locator('.miner-name.is-generated').count(), 1, 'The field glows until the name is chosen');
    await page.getByTestId('leaderboard-ticker').filter({ hasText: 'No blocks yet.' }).waitFor();
    await page.screenshot({ path: join(output, 'miner-name-generated.png') });
    await input.fill(NAME);
    await status.filter({ hasText: 'Every block you mine now carries this name' }).waitFor();
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
    await page.screenshot({ path: join(output, 'miner-name-signed.png') });

    await page.getByRole('button', { name: 'Start demo', exact: true }).click();
    await status.filter({ hasText: 'Block #2 is on the leaderboard' }).waitFor({ timeout: 30000 });
    await workbench(page).mine(3).click();
    await status.filter({ hasText: 'Block #3 is on the leaderboard' }).waitFor({ timeout: 30000 });
    assert.equal(pool.blocks.length, 3, 'Every mined block reached the leaderboard');
    const commitment = sha256(prefix(NAME));
    for (const block of pool.blocks) {
      assert.deepEqual([block.name, block.round], [NAME, ROUND]);
      assert.ok(block.coinbase.endsWith(`${'00'.repeat(8)}226a20${commitment}${'00'.repeat(4)}`), 'The coinbase commits to name and round');
      assert.ok(block.coinbase.includes(Buffer.from(NAME).toString('hex')), 'The coinbase carries the name');
    }
    await page.getByTestId('leaderboard-ticker').filter({ hasText: NAME }).waitFor();
    await status.filter({ hasText: 'rank #1' }).waitFor();
    await page.screenshot({ path: join(output, 'miner-name-on-board.png') });

    await page.reload();
    assert.equal(await input.inputValue(), NAME, 'The name survives a reload');
    await openTab(page, 'Leaderboard');
    const board = page.locator('section.pool-panel');
    await board.getByRole('button', { name: `Verify the proof of ${NAME}` }).first().click();
    await board.getByText(`signed by ${NAME} in round ${ROUND.height}.`, { exact: false }).first().waitFor();
    await page.screenshot({ path: join(output, 'miner-name-verified.png') });
    assert.deepEqual(errors, []);
  } finally {
    await page.close();
  }
  return ['Miner name: visible on the workbench; every mined block is signed, sent and listed; the board verifies it in the browser'];
}
