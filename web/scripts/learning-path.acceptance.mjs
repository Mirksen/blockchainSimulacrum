import assert from 'node:assert/strict';
import { join } from 'node:path';

export async function verifyLearningPath(page, output) {
  const chainBefore = await page.getByRole('button', { name: 'Open blockchain insights' }).innerText();
  const walletsBefore = await page.getByRole('button', { name: /^Open .+ details$/ }).allTextContents();
  const entry = page.getByRole('button', { name: 'Learning path', exact: true });
  const guide = page.getByRole('dialog', { name: 'Guided learning', exact: true });
  const next = () => guide.getByRole('button', { name: 'Next experiment', exact: true });
  await entry.click();
  assert.ok(await next().isDisabled(), 'Navigation must not complete an untouched experiment');
  assert.ok(await guide.getByRole('button', { name: /Earn a proof of work/ }).isDisabled());
  await guide.getByRole('button', { name: 'Next nonce', exact: true }).click();
  assert.ok(await next().isDisabled(), 'Nonce-only edit must not complete the message task');
  await guide.getByLabel('Message', { exact: true }).fill('Hello, block?');
  await guide.getByText('1 of 3 experiments complete', { exact: true }).waitFor();
  await next().click();
  assert.equal(await guide.getByLabel('Message', { exact: true }).evaluate(element => element.readOnly), true);
  assert.equal(await guide.getByLabel(/Nonce/).evaluate(element => element.readOnly), true);

  const time = new Date();
  await page.clock.install({ time }); await page.clock.pauseAt(time);
  try {
    await guide.getByRole('button', { name: 'Find a nonce', exact: true }).click();
    await guide.getByRole('button', { name: 'Stop search', exact: true }).click();
    await page.clock.runFor(1);
    await guide.locator('.hash-lab-feedback').filter({ hasText: 'Stopped after 0 attempts' }).waitFor();
    assert.ok(await next().isDisabled(), 'Stopped work must not receive credit');
    assert.equal(await guide.getByText(/✓ 1 zero:/).count(), 0);
  } finally { await page.clock.resume(); }
  for (const target of ['1', '2']) {
    await guide.getByLabel('Find a hash starting with', { exact: true }).selectOption(target);
    assert.equal(await guide.getByLabel(/Nonce/).inputValue(), '0');
    await guide.getByRole('button', { name: 'Find a nonce', exact: true }).click();
    await guide.locator('.hash-lab-feedback').filter({ hasText: 'Target found' }).waitFor();
    if (target === '1') {
      assert.ok(await next().isDisabled(), 'One target is not two completed experiments');
      await page.keyboard.press('Escape'); await guide.waitFor({ state: 'hidden' });
      assert.equal(await entry.evaluate(element => document.activeElement === element), true);
      await entry.click();
      await guide.getByText(/✓ 1 zero: [1-9]/).waitFor();
    }
  }
  await guide.getByText('2 of 3 experiments complete', { exact: true }).waitFor();
  await next().click();
  const finish = guide.getByRole('button', { name: 'Finish learning path', exact: true });
  assert.ok(await finish.isDisabled(), 'The starting sample is not a completed repair');
  await guide.getByLabel('Block 1 data', { exact: true }).fill('A synthetic retained first record.');
  await guide.getByText('Toy chain inconsistent', { exact: true }).waitFor();
  for (const number of [1, 2, 3]) {
    await guide.getByRole('button', { name: `Re-mine Block ${number}`, exact: true }).click();
    await guide.locator('.chain-lab-feedback').filter({ hasText: `Block ${number} re-mined in` }).waitFor();
    if (number < 3) assert.ok(await finish.isDisabled(), 'Partial repair must not finish the lesson');
  }
  assert.equal(await guide.getByLabel('Block 1 data', { exact: true }).inputValue(), 'A synthetic retained first record.');
  await guide.getByText('3 of 3 experiments complete', { exact: true }).waitFor();
  assert.equal(await finish.isDisabled(), false);

  for (const theme of ['light', 'dark']) {
    await guide.getByRole('button', { name: 'Close guide', exact: true }).click();
    await guide.waitFor({ state: 'hidden' });
    if (await page.locator('html').getAttribute('data-theme') !== theme) {
      await page.getByRole('button', { name: `Switch to ${theme} theme`, exact: true }).click();
    }
    await entry.click();
    for (const width of [320, 390, 768, 1200, 1440]) {
      await page.setViewportSize({ width, height: 900 });
      const bounds = await guide.locator('.learning-path').boundingBox();
      const size = await guide.locator('.learning-path').evaluate(element => ({ width: element.clientWidth, content: element.scrollWidth, page: document.documentElement.scrollWidth, viewport: innerWidth }));
      assert.ok(bounds && bounds.x >= 0 && bounds.x + bounds.width <= width, `Guide bounds: ${JSON.stringify({ width, bounds })}`);
      assert.ok(size.content <= size.width && size.page <= size.viewport, `Guide overflow: ${JSON.stringify(size)}`);
      await guide.locator('.learning-path').evaluate(element => { element.scrollTop = 0; });
      await page.screenshot({ path: join(output, `learning-${theme}-${width}.png`) });
      if (width === 390) {
        await guide.locator('.learning-path').evaluate(element => { element.scrollTop = element.scrollHeight; });
        await page.screenshot({ path: join(output, `learning-${theme}-mobile-bottom.png`) });
      }
    }
  }
  await finish.click();
  await guide.getByRole('heading', { name: 'You followed the proof.' }).waitFor();
  await page.screenshot({ path: join(output, 'learning-completed.png') });
  await guide.getByRole('button', { name: 'Continue in simulator', exact: true }).click();
  await guide.waitFor({ state: 'hidden' });
  assert.equal(await entry.evaluate(element => document.activeElement === element), true);
  await entry.click();
  await guide.getByRole('button', { name: 'Restart learning path', exact: true }).click();
  await guide.getByText('0 of 3 experiments complete', { exact: true }).waitFor();
  assert.equal(await guide.getByLabel('Message', { exact: true }).inputValue(), 'Hello, block!');
  assert.ok(await next().isDisabled());
  await page.keyboard.press('Escape'); await guide.waitFor({ state: 'hidden' });
  assert.equal(await page.getByRole('button', { name: 'Open blockchain insights' }).innerText(), chainBefore);
  assert.deepEqual(await page.getByRole('button', { name: /^Open .+ details$/ }).allTextContents(), walletsBefore);
  return ['Guided learning: observed message edit, two fixed-input searches and full retained-data chain repair',
    'Guided learning: Stop, locked navigation, resume, restart and native focus restoration',
    'Guided learning: five viewport widths in both themes; simulator blocks and wallets unchanged'];
}
