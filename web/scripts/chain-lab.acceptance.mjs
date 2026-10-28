import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { join } from 'node:path';
import { menu, openTab, settle, snapshot } from './workbench.helpers.mjs';

export async function verifyChainLab(page, output, before) {
  const lab = page.locator('section.chain-lab');
  const block = number => lab.getByRole('article', { name: `Block ${number}`, exact: true });
  const hashes = async () => lab.locator('.chain-lab-hashes dd:last-child code').allTextContents();
  await openTab(page, 'Chain lab');
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
  // Read the running virtual clock after installation; pause ahead of it.
  const pauseTime = await page.evaluate(() => Date.now() + 60_000);
  await page.clock.pauseAt(pauseTime);
  try {
    await block(1).getByRole('button', { name: 'Re-mine Block 1' }).press('Enter');
    await block(1).getByRole('button', { name: 'Stop search', exact: true }).press('Enter');
    await page.clock.runFor(1);
    await lab.getByRole('status').filter({ hasText: 'Stopped after 0 attempts' }).waitFor();
    assert.deepEqual(await hashes(), original);
  } finally { await page.clock.resume(); }
  await lab.getByRole('button', { name: 'Reset chain lab' }).click();

  for (const theme of ['light', 'dark']) {
    if (await page.locator('html').getAttribute('data-theme') !== theme) await menu(page, theme === 'light' ? 'Light theme' : 'Dark theme');
    for (const width of [320, 390, 768, 1200, 1440]) {
      await page.setViewportSize({ width, height: 900 });
      await settle(page);
      await lab.getByLabel('Block 1 data', { exact: true }).fill('A'.repeat(300));
      await block(1).getByText('Inspect Block 1 input', { exact: true }).click();
      const bounds = await lab.boundingBox();
      assert.ok(bounds && bounds.x >= 0 && bounds.x + bounds.width <= width, JSON.stringify({ width, bounds }));
      const size = await page.evaluate(() => {
        const panel = document.querySelector('.chain-lab');
        return { viewport: innerWidth, pageWidth: document.documentElement.scrollWidth, panelWidth: panel.clientWidth, contentWidth: panel.scrollWidth };
      });
      assert.ok(size.pageWidth <= size.viewport && size.contentWidth <= size.panelWidth, JSON.stringify(size));
      await lab.getByRole('button', { name: 'Reset chain lab' }).click();
      await page.evaluate(() => scrollTo(0, 0));
      await page.screenshot({ path: join(output, `chain-lab-${theme}-${width}.png`) });
      if (width === 390) await page.screenshot({ path: join(output, `chain-lab-${theme}-mobile-full.png`), fullPage: true });
      // The input details remain open across reset; close them for the next iteration.
      await block(1).getByText('Inspect Block 1 input', { exact: true }).click();
    }
  }
  await openTab(page, 'Workbench');
  await openTab(page, 'Chain lab');
  assert.deepEqual(await hashes(), original, 'Reopening restores the deterministic sample');
  await lab.getByRole('button', { name: 'Back to simulator' }).click();
  await lab.waitFor({ state: 'hidden' });
  assert.deepEqual(await snapshot(page), before, 'The chain lab leaves the simulator chain and wallets untouched');
  return ['Chain lab: edit, real recomputed SHA-256 and sequential repair verified',
    'Chain lab: bounded search Stop and reset verified',
    'Chain lab: five widths in both themes with long input, unchanged simulator and wallets'];
}
