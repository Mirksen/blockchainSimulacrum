import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { join } from 'node:path';
import { openTab, settle, snapshot } from './workbench.helpers.mjs';

const nonceLabel = 'Nonce a number you can change';
const initialHash = 'c7045b5e21b4edb436fb86d51830d621c23095d920e36976325d652c4f0207d9';
const hashName = async lab => lab.getByRole('img', { name: /^SHA-256 hash:/ }).getAttribute('aria-label');

// Run in the app's browser acceptance session in free play, with mining stopped.
export async function verifyHashLab(page, output, before) {
  await openTab(page, 'Hash lab');
  const lab = page.locator('section.hash-lab');
  await lab.waitFor();
  assert.match(page.url(), /#\/hash-lab$/);
  assert.equal(await hashName(lab), `SHA-256 hash: ${initialHash}`);
  await lab.getByLabel('Message', { exact: true }).fill('Hello, block?');
  const edited = createHash('sha256').update('{"message":"Hello, block?","nonce":0}').digest('hex');
  assert.equal(await hashName(lab), `SHA-256 hash: ${edited}`);
  assert.ok(await lab.locator('.hash-lab-changed').count() > 0);
  await lab.getByLabel('Message', { exact: true }).fill('Hello, block!');
  assert.equal(await hashName(lab), `SHA-256 hash: ${initialHash}`);
  await lab.getByLabel(nonceLabel, { exact: true }).fill('1.5');
  await lab.getByRole('alert').waitFor();
  assert.ok(await lab.getByRole('button', { name: 'Find a nonce', exact: true }).isDisabled());
  await lab.getByRole('button', { name: 'Reset lab' }).click();
  await lab.getByRole('button', { name: 'Find a nonce', exact: true }).click();
  await lab.getByRole('status').filter({ hasText: 'Target found after 72 attempts' }).waitFor();
  assert.equal(await lab.getByLabel(nonceLabel, { exact: true }).inputValue(), '71');
  assert.ok((await hashName(lab)).startsWith('SHA-256 hash: 00'));

  // This deterministic message has no three-zero match in its first 25,000 candidates.
  await lab.getByLabel('Message', { exact: true }).fill('Stop experiment 35');
  await lab.getByLabel(nonceLabel, { exact: true }).fill('0');
  await lab.getByLabel('Find a hash starting with').selectOption('3');
  await lab.getByRole('button', { name: 'Find a nonce', exact: true }).press('Enter');
  await lab.getByRole('button', { name: 'Stop search', exact: true }).press('Enter');
  await lab.getByRole('status').filter({ hasText: 'Stopped after' }).waitFor();
  assert.equal(await page.evaluate(() => document.activeElement.textContent), 'Find a nonce');
  await lab.getByRole('button', { name: 'Reset lab' }).click();

  for (const width of [320, 390, 768, 1200, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    await settle(page);
    const bounds = await lab.boundingBox();
    assert.ok(bounds && bounds.x >= 0 && bounds.x + bounds.width <= width, JSON.stringify({ width, bounds }));
    await lab.getByLabel('Message', { exact: true }).fill('A'.repeat(1000));
    if (!(await lab.locator('.hash-lab-preimage').evaluate(element => element.open))) {
      await lab.getByText('What exactly are we hashing?', { exact: true }).click();
    }
    const size = await page.evaluate(() => {
      const panel = document.querySelector('.hash-lab');
      return { viewport: innerWidth, pageWidth: document.documentElement.scrollWidth, panelWidth: panel.clientWidth, contentWidth: panel.scrollWidth };
    });
    assert.ok(size.pageWidth <= size.viewport, JSON.stringify(size));
    assert.ok(size.contentWidth <= size.panelWidth, JSON.stringify(size));
    await lab.getByRole('button', { name: 'Reset lab' }).click();
    await page.screenshot({ path: join(output, `hash-lab-${width}.png`) });
  }
  await page.setViewportSize({ width: 1440, height: 1000 });
  await lab.getByRole('button', { name: 'Back to simulator' }).click();
  await lab.waitFor({ state: 'hidden' });
  assert.deepEqual(await snapshot(page), before, 'The hash lab leaves the chain and wallets untouched');
  await openTab(page, 'Hash lab');
  assert.equal(await hashName(lab), `SHA-256 hash: ${initialHash}`, 'Reopening restores the sample');
  await openTab(page, 'Workbench');
  return ['Hash lab fingerprints and exact search result verified', 'Lab keyboard Stop and reset verified',
    'Lab fits five widths with long input; leaving preserves chain and wallet state'];
}
