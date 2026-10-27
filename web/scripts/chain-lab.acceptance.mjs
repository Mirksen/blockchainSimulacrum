import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { join } from 'node:path';

export async function verifyChainLab(page, output) {
  const chainBefore = await page.getByRole('button', { name: 'Open blockchain insights' }).innerText();
  const walletsBefore = await page.getByRole('button', { name: /^Open .+ details$/ }).allTextContents();
  const entry = page.getByRole('button', { name: 'Open chain lab', exact: true });
  const lab = page.getByRole('dialog', { name: 'Chain lab', exact: true });
  const block = number => lab.getByRole('article', { name: `Block ${number}`, exact: true });
  const hashes = async () => lab.locator('.chain-lab-hashes dd:last-child code').allTextContents();
  await entry.click();
  await lab.getByText('Toy chain consistent', { exact: true }).waitFor();
  const original = await hashes();
  await lab.getByLabel('Block 1 data', { exact: true }).fill('An edited parcel record.');
  await lab.getByText('Toy chain inconsistent', { exact: true }).waitFor();
  assert.deepEqual(await hashes(), original, 'Editing data must preserve all stored hashes');
  await block(1).getByText('Hash does not match input', { exact: true }).waitFor();
  await block(2).getByText('Previous link matches', { exact: true }).waitFor();
  await block(2).getByText('Earlier block invalid', { exact: true }).waitFor();
  await block(1).getByText('Inspect Block 1 input', { exact: true }).click();
  const preimage = await block(1).locator('.chain-lab-input code').first().innerText();
  const actual = createHash('sha256').update(preimage).digest('hex');
  assert.equal(await block(1).locator('.chain-lab-input code').nth(1).innerText(), actual);
  assert.notEqual(actual, original[0]);
  await block(1).getByText('Inspect Block 1 input', { exact: true }).click();
  for (const number of [1, 2, 3]) {
    const previous = await hashes();
    await block(number).getByRole('button', { name: `Re-mine Block ${number}`, exact: true }).press('Enter');
    await lab.getByRole('status').filter({ hasText: `Block ${number} re-mined in` }).waitFor();
    const nonce = Number(await lab.getByLabel(`Block ${number} nonce`, { exact: true }).inputValue());
    assert.match(await lab.getByRole('status').innerText(), new RegExp(`in ${nonce + 1} attempts?\\.`));
    const current = await hashes();
    assert.notEqual(current[number - 1], previous[number - 1]);
    assert.deepEqual(current.slice(number), previous.slice(number), 'Successor hashes must remain untouched');
    await block(number).getByText('Valid through here', { exact: true }).waitFor();
    if (number < 3) await block(number + 1).getByText('Previous link does not match', { exact: true }).waitFor();
  }
  await lab.getByText('Toy chain consistent', { exact: true }).waitFor();
  await lab.getByLabel('Block 1 nonce', { exact: true }).fill('1.5');
  await lab.getByRole('alert').waitFor();
  assert.ok(await block(1).getByRole('button', { name: 'Re-mine Block 1' }).isDisabled());
  await lab.getByRole('button', { name: 'Reset chain lab' }).click();
  assert.deepEqual(await hashes(), original);

  // Freeze the initial yield so the one-zero search can be stopped deterministically.
  const now = new Date();
  await page.clock.install({ time: now });
  await page.clock.pauseAt(now);
  try {
    await block(1).getByRole('button', { name: 'Re-mine Block 1' }).press('Enter');
    await block(1).getByRole('button', { name: 'Stop search', exact: true }).press('Enter');
    await page.clock.runFor(1);
    await lab.getByRole('status').filter({ hasText: 'Stopped after 0 attempts' }).waitFor();
    assert.deepEqual(await hashes(), original);
  } finally { await page.clock.resume(); }
  await lab.getByRole('button', { name: 'Reset chain lab' }).click();
  await page.keyboard.press('Escape');
  await lab.waitFor({ state: 'hidden' });
  assert.equal(await entry.evaluate(element => document.activeElement === element), true);

  for (const theme of ['light', 'dark']) {
    const currentTheme = await page.locator('html').getAttribute('data-theme');
    if (currentTheme !== theme) await page.getByRole('button', { name: `Switch to ${theme} theme`, exact: true }).click();
    await entry.click();
    for (const width of [320, 390, 768, 1200, 1440]) {
      await page.setViewportSize({ width, height: 900 });
      await lab.getByLabel('Block 1 data', { exact: true }).fill('A'.repeat(300));
      await block(1).getByText('Inspect Block 1 input', { exact: true }).click();
      const bounds = await lab.locator('.chain-lab').boundingBox();
      assert.ok(bounds && bounds.x >= 0 && bounds.x + bounds.width <= width, JSON.stringify({ width, bounds }));
      const size = await page.evaluate(() => {
        const panel = document.querySelector('.chain-lab');
        return { viewport: innerWidth, pageWidth: document.documentElement.scrollWidth, panelWidth: panel.clientWidth, contentWidth: panel.scrollWidth };
      });
      assert.ok(size.pageWidth <= size.viewport && size.contentWidth <= size.panelWidth, JSON.stringify(size));
      await lab.getByRole('button', { name: 'Reset chain lab' }).click();
      await lab.locator('.chain-lab').evaluate(element => { element.scrollTop = 0; });
      await page.screenshot({ path: join(output, `chain-lab-${theme}-${width}.png`) });
      if (width === 390) {
        await lab.locator('.chain-lab').evaluate(element => { element.scrollTop = element.scrollHeight; });
        await page.screenshot({ path: join(output, `chain-lab-${theme}-mobile-bottom.png`) });
      }
      // The input details remain open across reset; close them for the next iteration.
      await block(1).getByText('Inspect Block 1 input', { exact: true }).click();
    }
    await page.keyboard.press('Escape');
    await lab.waitFor({ state: 'hidden' });
    assert.equal(await entry.evaluate(element => document.activeElement === element), true);
  }
  await entry.click();
  assert.deepEqual(await hashes(), original, 'Reopening restores the deterministic sample');
  await lab.getByRole('button', { name: 'Back to simulator' }).click();
  await lab.waitFor({ state: 'hidden' });
  assert.equal(await entry.evaluate(element => document.activeElement === element), true);
  assert.equal(await page.getByRole('button', { name: 'Open blockchain insights' }).innerText(), chainBefore);
  assert.deepEqual(await page.getByRole('button', { name: /^Open .+ details$/ }).allTextContents(), walletsBefore);
  return ['Chain lab: edit, real recomputed SHA-256 and sequential repair verified',
    'Chain lab: bounded search Stop, keyboard Escape/back focus and reset verified',
    'Chain lab: five widths in both themes with long input, unchanged simulator and wallets'];
}
