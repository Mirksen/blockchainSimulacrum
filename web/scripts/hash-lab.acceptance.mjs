import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { join } from 'node:path';

const nonceLabel = 'Nonce a number you can change';
const initialHash = 'c7045b5e21b4edb436fb86d51830d621c23095d920e36976325d652c4f0207d9';
const hashName = async lab => lab.getByRole('img', { name: /^SHA-256 hash:/ }).getAttribute('aria-label');

// Run in the app's existing browser acceptance session, with auto-mining stopped.
export async function verifyHashLab(page, output) {
  const chainBefore = await page.getByRole('button', { name: 'Open blockchain insights' }).innerText();
  const walletsBefore = await page.getByRole('button', { name: /^Open .+ details$/ }).allTextContents();
  const entry = page.getByRole('button', { name: 'Open hash lab', exact: true });
  await entry.click();
  const lab = page.getByRole('dialog', { name: 'Hash lab', exact: true });
  await lab.waitFor();
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
    await page.locator('.hash-lab').evaluate(element => { element.scrollTop = 0; });
    await page.screenshot({ path: join(output, `hash-lab-${width}.png`) });
  }
  await page.keyboard.press('Escape');
  await lab.waitFor({ state: 'hidden' });
  assert.equal(await page.getByRole('button', { name: 'Open blockchain insights' }).innerText(), chainBefore);
  assert.deepEqual(await page.getByRole('button', { name: /^Open .+ details$/ }).allTextContents(), walletsBefore);
  assert.equal(await entry.evaluate(element => document.activeElement === element), true);
  await entry.click();
  assert.equal(await hashName(lab), `SHA-256 hash: ${initialHash}`);
  await lab.getByRole('button', { name: 'Back to simulator' }).click();
  await lab.waitFor({ state: 'hidden' });
  return ['Hash lab fingerprints and exact search result verified', 'Lab keyboard Stop/Escape and focus restoration verified',
    'Lab fits five widths with long input; closing preserves chain and wallet state'];
}
