import assert from 'node:assert/strict';
import { join } from 'node:path';

const API = 'https://api.proofofwork.fyi';
const UNAVAILABLE = 'The leaderboard server is unavailable right now. The simulator keeps working.';
const NAME_RULE = 'Use 3–20 characters: letters, digits or hyphens.';

// Runs against the preview only: every pool request is refused locally, so no
// leaderboard server (and no remote system) is ever contacted.
export async function verifyPool(page, output) {
  const requests = [];
  const errors = [];
  const onError = error => errors.push(error.message);
  const refuse = route => { requests.push(new URL(route.request().url()).pathname); return route.abort('connectionrefused'); };
  page.on('pageerror', onError);
  await page.route(`${API}/**`, refuse);
  try {
    const initialTheme = await page.locator('html').getAttribute('data-theme');
    const chainBefore = await page.getByRole('button', { name: 'Open blockchain insights' }).innerText();
    const entry = page.getByRole('button', { name: 'Open mining pool', exact: true });
    const pool = page.getByRole('dialog', { name: 'Mining pool', exact: true });
    const status = pool.getByRole('status');
    await entry.click();
    await status.filter({ hasText: UNAVAILABLE }).waitFor();
    assert.equal(await status.innerText(), UNAVAILABLE);
    await pool.locator('.pool-panel-board').getByText(UNAVAILABLE, { exact: true }).waitFor();
    assert.equal(await pool.getByRole('table').count(), 0);
    assert.deepEqual(requests, ['/api/leaderboard']);

    const name = pool.getByLabel('Name on the leaderboard', { exact: true });
    await name.fill('ab');
    await pool.getByRole('button', { name: 'Join', exact: true }).click();
    await pool.getByRole('alert').filter({ hasText: NAME_RULE }).waitFor();
    assert.equal(await name.getAttribute('aria-invalid'), 'true');
    assert.deepEqual(requests, ['/api/leaderboard'], 'An invalid name must not reach the pool');

    await name.fill('test-miner');
    assert.equal(await pool.getByRole('alert').count(), 0);
    const challenged = page.waitForRequest(request => request.url().startsWith(`${API}/api/challenge?`));
    await pool.getByRole('button', { name: 'Join', exact: true }).press('Enter');
    await challenged;
    await status.filter({ hasText: UNAVAILABLE }).waitFor();
    await pool.getByRole('button', { name: 'Join', exact: true }).waitFor();
    assert.deepEqual(requests, ['/api/leaderboard', '/api/challenge']);

    await page.keyboard.press('Escape');
    await pool.waitFor({ state: 'hidden' });
    assert.equal(await entry.evaluate(element => document.activeElement === element), true);

    for (const theme of ['light', 'dark']) {
      if (await page.locator('html').getAttribute('data-theme') !== theme) {
        await page.getByRole('button', { name: `Switch to ${theme} theme`, exact: true }).click();
      }
      await entry.click();
      await status.filter({ hasText: UNAVAILABLE }).waitFor();
      assert.equal(await name.inputValue(), 'test-miner', 'The valid name is remembered');
      for (const width of [320, 390, 768, 1200, 1440]) {
        await page.setViewportSize({ width, height: 900 });
        const bounds = await pool.locator('.pool-panel').boundingBox();
        assert.ok(bounds && bounds.x >= 0 && bounds.x + bounds.width <= width, JSON.stringify({ theme, width, bounds }));
        const size = await page.evaluate(() => {
          const panel = document.querySelector('.pool-panel');
          return { viewport: innerWidth, pageWidth: document.documentElement.scrollWidth, panelWidth: panel.clientWidth, contentWidth: panel.scrollWidth };
        });
        assert.ok(size.pageWidth <= size.viewport && size.contentWidth <= size.panelWidth, JSON.stringify({ theme, ...size }));
        await pool.locator('.pool-panel').evaluate(element => { element.scrollTop = 0; });
        await page.screenshot({ path: join(output, `pool-${theme}-${width}.png`) });
      }
      await page.keyboard.press('Escape');
      await pool.waitFor({ state: 'hidden' });
      assert.equal(await entry.evaluate(element => document.activeElement === element), true);
    }
    if (initialTheme !== 'dark') await page.getByRole('button', { name: 'Switch to light theme', exact: true }).click();
    assert.ok(requests.every(path => path === '/api/leaderboard' || path === '/api/challenge'), JSON.stringify(requests));
    assert.equal(await page.getByRole('button', { name: 'Open blockchain insights' }).innerText(), chainBefore);
    assert.deepEqual(errors, []);
  } finally {
    page.off('pageerror', onError);
    await page.unroute(`${API}/**`, refuse);
  }
  return ['Mining pool: unreachable server shows the unavailable status and table state without page errors',
    'Mining pool: invalid name blocked inline; Escape restores focus to the header button',
    'Mining pool: five widths in both themes'];
}
