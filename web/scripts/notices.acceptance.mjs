import assert from 'node:assert/strict';
import { join } from 'node:path';
import { menu, workbench } from './workbench.helpers.mjs';

// Real Chrome pointer interaction and signed blocks; virtual time covers the deadline.
export async function verifyNoticeLifetime(browser, baseURL, output) {
  const page = await browser.newPage({ viewport: { width: 1512, height: 860 }, reducedMotion: 'reduce' });
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.route('https://api.proofofwork.fyi/**', route => route.abort('connectionrefused'));
  await page.route('https://eu.i.posthog.com/**', route => route.abort('connectionrefused'));
  await page.addInitScript(() => {
    localStorage.setItem('proofofwork-missions-intro-seen', '1');
    localStorage.setItem('pow.analytics.enabled', 'false');
  });
  await page.clock.install();
  try {
    await page.goto(baseURL);
    const wb = workbench(page);
    await wb.tile(0).waitFor();
    await menu(page, 'Settings');
    const settings = page.getByRole('dialog', { name: 'Settings', exact: true });
    assert.equal(await settings.getByLabel('Halving interval', { exact: true }).inputValue(), '21');
    await settings.getByLabel('Mining difficulty', { exact: true }).fill('1');
    await settings.getByLabel('Halving interval', { exact: true }).fill('2');
    await settings.getByRole('button', { name: 'Done' }).click();
    await page.getByRole('button', { name: 'Start demo', exact: true }).click();
    await wb.mine(2).waitFor();
    await wb.mine(2).click();
    await wb.mine(3).waitFor();
    const note = page.locator('.kf-note.is-halving').filter({ hasText: 'The reward halved with #2' });
    await note.hover();
    await page.clock.fastForward(31_000);
    assert.equal(await note.count(), 1, 'Hover retains a notice beyond 30 seconds');
    await page.screenshot({ path: join(output, 'notice-hover-desktop.png') });
    await page.mouse.move(1, 1);
    await page.clock.fastForward(30_000);
    await note.waitFor({ state: 'detached' });
    assert.equal(await page.getByRole('complementary', { name: 'What changed' }).count(), 0, 'Expired notes release footer space');
    await page.getByRole('link', { name: 'Hash lab', exact: true }).click();
    await page.getByRole('link', { name: 'Workbench', exact: true }).click();
    assert.equal(await page.getByRole('complementary', { name: 'What changed' }).count(), 0, 'Lab navigation does not revive an expired note');
    await page.setViewportSize({ width: 390, height: 844 });
    await page.screenshot({ path: join(output, 'notice-expired-phone.png'), fullPage: true });
    await page.reload();
    await wb.mine(3).waitFor();
    await menu(page, 'Settings');
    assert.equal(await page.getByRole('dialog', { name: 'Settings', exact: true })
      .getByLabel('Halving interval', { exact: true }).inputValue(), '2', 'Saved explicit interval survives the default change');
    assert.deepEqual(errors, []);
    return ['Notice lifetime: default 21, real hover past 30 seconds, expiry after leaving, footer space released, saved interval retained'];
  } finally {
    await page.close();
  }
}

export async function verifyFeeMarketCounts(browser, baseURL, output) {
  const page = await browser.newPage({ viewport: { width: 1512, height: 860 }, reducedMotion: 'reduce' });
  const errors = [];
  let release = () => {};
  page.on('pageerror', error => errors.push(error.message));
  await page.route('https://api.proofofwork.fyi/**', route => route.abort('connectionrefused'));
  await page.route('https://eu.i.posthog.com/**', route => route.abort('connectionrefused'));
  await page.addInitScript(() => {
    localStorage.setItem('proofofwork-missions-intro-seen', '1');
    localStorage.setItem('pow.analytics.enabled', 'false');
  });
  try {
    await page.goto(baseURL);
    const wb = workbench(page);
    await wb.tile(0).waitFor();
    await menu(page, 'Settings');
    const settings = page.getByRole('dialog', { name: 'Settings', exact: true });
    await settings.getByLabel('Mining difficulty', { exact: true }).fill('1');
    await settings.getByRole('button', { name: 'Done' }).click();
    await page.getByRole('button', { name: 'Start demo', exact: true }).click();
    await wb.mine(2).waitFor();
    await wb.mine(2).click();
    await wb.mine(3).waitFor();
    const mempool = page.getByRole('region', { name: 'Mempool', exact: true });
    for (let index = 0; index < 8; index++) {
      await mempool.getByRole('button', { name: 'New transaction', exact: true }).click();
      const form = page.getByRole('form', { name: 'New transaction', exact: true });
      await form.getByRole('combobox', { name: 'From', exact: true }).selectOption({ index: 1 });
      await form.getByRole('combobox', { name: 'To', exact: true }).selectOption({ index: 2 });
      await form.getByLabel(/^Amount/).fill('0.01');
      await form.getByLabel('Reference', { exact: true }).fill('Demo transfer');
      await form.getByRole('combobox', { name: 'Fee rate', exact: true }).selectOption(String([1, 5, 20][index % 3]));
      await form.getByRole('button', { name: 'Add to mempool', exact: true }).click();
      await form.waitFor({ state: 'detached' });
    }
    assert.equal(await mempool.locator('.mempool-card-tx.is-waiting').count(), 3);
    assert.ok((await page.locator('.next-block-meta').innerText()).includes('5 tx selected'));
    assert.ok((await page.getByRole('group', { name: /^Candidate block 3,/ }).getAttribute('aria-label')).includes('5 transactions'));
    const gate = new Promise(resolve => { release = resolve; });
    await page.route('**/*powSearch.worker*', async route => { await gate; await route.continue(); });
    await wb.mine(3).click();
    await mempool.getByText('5 in #3', { exact: true }).waitFor();
    assert.ok((await mempool.innerText()).includes('8 pending · 3 waiting'));
    assert.equal(await mempool.locator('.mempool-card-tx.is-mining').count(), 5);
    assert.equal(await mempool.locator('.mempool-card-tx.is-waiting').count(), 3);
    await page.screenshot({ path: join(output, 'fee-market-mining-desktop.png') });
    await page.setViewportSize({ width: 390, height: 844 });
    assert.ok((await mempool.innerText()).includes('8 pending · 3 waiting'), 'The queue counts remain visible on phones');
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'Fee-market view fits the phone');
    await page.screenshot({ path: join(output, 'fee-market-mining-phone.png'), fullPage: true });
    release();
    await wb.mine(4).waitFor();
    assert.ok((await mempool.innerText()).includes('3 pending'));
    assert.deepEqual(errors, []);
    return ['Fee market: eight real signed payments, five selected and mined, three waiting; desktop and phone counts agree'];
  } finally {
    release();
    await page.close();
  }
}
