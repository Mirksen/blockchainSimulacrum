import assert from 'node:assert/strict';
import { join } from 'node:path';
import { MISSIONS } from '../src/lib/missions.js';
import { menu, settle, workbench } from './workbench.helpers.mjs';

async function missionPage(browser, baseURL, id) {
  const context = await browser.newContext({ viewport: { width: 1512, height: 860 }, reducedMotion: 'reduce' });
  await context.route(/^https:\/\/(eu\.i\.posthog\.com|api\.proofofwork\.fyi)\//, route => route.abort('connectionrefused'));
  const page = await context.newPage();
  page.setDefaultTimeout(60000);
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(baseURL);
  await page.evaluate(completed => {
    localStorage.setItem('proofofwork-missions', JSON.stringify({ version: 1, completed, step: 0, data: {} }));
    localStorage.setItem('proofofwork-rail-collapsed', '0');
    localStorage.setItem('proofofwork-missions-intro-seen', '1');
  }, MISSIONS.slice(0, MISSIONS.findIndex(m => m.id === id)).map(m => m.id));
  await page.reload();
  return { context, page, errors };
}
const progress = page => page.evaluate(() => JSON.parse(localStorage.getItem('proofofwork-missions')));
const coach = (page, target) => page.locator(`[data-coach-target="${target}"].is-active`);

export async function verifyFeeMission(browser, baseURL, output) {
  assert.ok(['localhost', '127.0.0.1', '[::1]'].includes(new URL(baseURL).hostname), 'Fee mining acceptance requires a local preview');
  const { context, page, errors } = await missionPage(browser, baseURL, 'get-payment-in');
  try {
    for (let n = 0; n < 3; n++) await page.getByRole('button', { name: 'Lower difficulty', exact: true }).click();
    const wb = workbench(page);
    await page.getByRole('button', { name: 'Start demo', exact: true }).click();
    await wb.mine(2).click();
    await wb.mine(3).waitFor();
    await page.getByRole('button', { name: 'Create wallet', exact: true }).click();
    const wallet = page.getByRole('form', { name: 'Create wallet', exact: true });
    await wallet.getByRole('textbox').fill('WalletZ');
    await wallet.getByRole('button', { name: 'Create', exact: true }).click();
    const transfer = async (from, to, amount, rate) => {
      await page.getByRole('button', { name: 'New transaction', exact: true }).click();
      const form = page.getByRole('form', { name: 'New transaction', exact: true });
      await form.getByRole('combobox', { name: 'From', exact: true }).selectOption(from);
      await form.getByRole('combobox', { name: 'To', exact: true }).selectOption(to);
      await form.getByLabel(/^Amount /).fill(amount);
      await form.getByRole('combobox', { name: 'Fee rate', exact: true }).selectOption(rate);
      await form.getByRole('button', { name: 'Add to mempool', exact: true }).click();
      await form.waitFor({ state: 'hidden' });
    };
    await transfer('Alice', 'WalletZ', '0.1', '1');
    for (let n = 0; n < 6; n++) await transfer('Bob', 'Chris', '0.01', '5');
    await page.waitForFunction(() => JSON.parse(localStorage.getItem('proofofwork-missions')).step === 1);
    await page.getByText('waits · block full', { exact: true }).first().waitFor();
    await transfer('WalletZ', 'Alice', '0.05', '20');
    await page.waitForFunction(() => JSON.parse(localStorage.getItem('proofofwork-missions')).step === 2);
    assert.equal((await progress(page)).completed.includes('get-payment-in'), false, 'Selected package is not confirmed yet');
    await referenceViews(page, output, 'mission-fee-package');
    await page.setViewportSize({ width: 1512, height: 860 });
    await settle(page);
    await wb.mine(3).click();
    await page.waitForFunction(() => JSON.parse(localStorage.getItem('proofofwork-missions')).completed.includes('get-payment-in'));
    assert.deepEqual(errors, []);
    return ['Fee mission: low-fee payment waits, its high-fee child selects the package, only accepted inclusion completes'];
  } finally { await context.close(); }
}

async function referenceViews(page, output, name, focus = null) {
  for (const theme of ['dark', 'light']) {
    if (await page.locator('html').getAttribute('data-theme') !== theme) await menu(page, theme === 'light' ? 'Light theme' : 'Dark theme');
    for (const [width, height] of [[390, 844], [768, 1000], [1366, 657], [1512, 860], [2560, 1310]]) {
      await page.setViewportSize({ width, height });
      await settle(page);
      if (focus) await page.locator(focus).scrollIntoViewIfNeeded();
      const bounds = await page.evaluate(() => ({ viewport: innerWidth, page: document.documentElement.scrollWidth }));
      assert.ok(bounds.page <= bounds.viewport, `${name} fits ${width}: ${JSON.stringify(bounds)}`);
      await page.screenshot({ path: join(output, `${name}-${theme}-${width}.png`), fullPage: true });
      if (focus && [390, 1512].includes(width)) {
        await page.locator('.merkle-proof-verdict').scrollIntoViewIfNeeded();
        await page.screenshot({ path: join(output, `${name}-verdict-${theme}-${width}.png`), fullPage: true });
      }
    }
  }
}

// Runs in Chrome and WebKit. Uses real verifyProof results through App/ChainLab.
export async function verifyMerkleMission(browser, baseURL, output, screenshots = true) {
  const { context, page, errors } = await missionPage(browser, baseURL, 'prove-a-payment');
  try {
    const rail = page.getByRole('complementary', { name: 'Missions' });
    await rail.getByRole('button', { name: 'Show me' }).click();
    await coach(page, 'chain-lab.merkle-payment').waitFor();
    assert.equal((await progress(page)).step, 0, 'Navigation cannot complete the proof step');
    await page.getByRole('button', { name: /^Tx 5 / }).click();
    await coach(page, 'chain-lab.merkle-sibling').waitFor();
    await page.getByRole('button', { name: 'Back to simulator', exact: true }).click();
    assert.equal((await progress(page)).step, 0, 'Leaving discards the unmounted proof evidence');
    await rail.getByRole('button', { name: 'Show me' }).click();
    await page.getByRole('button', { name: /^Tx 5 / }).click();
    const sibling = page.getByLabel(/^Sibling at level 0 /);
    await sibling.fill('abc');
    assert.equal((await progress(page)).step, 1, 'Malformed text is not an observed cryptographic failure');
    await page.getByRole('button', { name: 'Reset example', exact: true }).click();
    assert.equal((await progress(page)).step, 0, 'Reset discards the first proof');
    const original = await sibling.inputValue();
    const changed = (original[0] === '0' ? '1' : '0') + original.slice(1);
    await sibling.fill(changed);
    assert.equal((await progress(page)).completed.includes('prove-a-payment'), false, 'An invalid proof without a preceding valid proof cannot complete');
    await page.getByRole('button', { name: /^Tx 5 / }).click();
    await sibling.fill(changed);
    await page.getByRole('status').filter({ hasText: /Payment not proven.*fails at level 1/ }).waitFor();
    await page.waitForFunction(() => JSON.parse(localStorage.getItem('proofofwork-missions')).completed.includes('prove-a-payment'));
    assert.equal(await page.locator('.merkle-proof-level.is-failed').count(), 1);
    assert.equal(await page.locator('.coach-mark.is-active').count(), 0, 'The observed result stays visible without stale coaching');
    if (screenshots) await referenceViews(page, output, 'mission-merkle-complete', '.merkle-proof-level.is-failed');
    await page.reload();
    assert.ok((await progress(page)).completed.includes('prove-a-payment'), 'Completion survives reload');
    assert.deepEqual(errors, []);
    return ['Merkle mission: navigation and malformed/reset proofs rejected; actual same-payment valid-to-invalid path completes and persists'];
  } finally { await context.close(); }
}

// Local only: mining against the real domain would affect the public leaderboard.
export async function verifySignatureMission(browser, baseURL, output) {
  assert.ok(['localhost', '127.0.0.1', '[::1]'].includes(new URL(baseURL).hostname), 'Signature mining acceptance requires a local preview');
  const { context, page, errors } = await missionPage(browser, baseURL, 'test-a-signature');
  try {
    // Lower the difficulty while the chain is still empty; no reset confirmation.
    const decrease = page.getByRole('button', { name: 'Lower difficulty', exact: true });
    for (let n = 0; n < 3; n++) await decrease.click();
    const wb = workbench(page);
    await page.getByRole('button', { name: 'Start demo', exact: true }).click();
    await wb.mine(2).click();
    await wb.mine(3).waitFor();
    await page.getByRole('button', { name: 'Tamper with this block', exact: true }).click();
    const editor = page.getByRole('form', { name: 'Change a transaction amount in block 2' });
    await editor.getByRole('combobox', { name: 'Transaction', exact: true }).selectOption('1');
    const before = Number(await editor.getByLabel('New amount').inputValue());
    await editor.getByLabel('New amount').fill(String(Number((before / 2).toFixed(8))));
    await editor.getByRole('button', { name: 'Change amount', exact: true }).click();
    assert.equal((await progress(page)).step, 1);
    await page.getByRole('button', { name: 'Test proof of work anyway', exact: true }).click();
    await page.locator('.selected-block .card-kit-pill').filter({ hasText: 'Signature invalid' }).waitFor();
    await page.waitForFunction(() => JSON.parse(localStorage.getItem('proofofwork-missions')).completed.includes('test-a-signature'));
    await wb.chainPill().filter({ hasText: 'Chain invalid' }).waitFor();
    await referenceViews(page, output, 'mission-signature-complete');
    assert.deepEqual(errors, []);
    return ['Signature mission: real signed tip tampered and re-mined; signature stays invalid and chain is rejected'];
  } finally { await context.close(); }
}
