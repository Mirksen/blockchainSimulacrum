import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { join } from 'node:path';
import { menu, openTab, settle, snapshot } from './workbench.helpers.mjs';

const sha = text => createHash('sha256').update(text).digest('hex');

export async function verifyTextHashLab(page, output) {
  const before = await snapshot(page);
  await openTab(page, 'Hash lab');
  const lab = page.locator('.text-hash-lab');
  await lab.waitFor();
  const input = lab.getByLabel('Your text', { exact: true });
  const readHash = async () => (await lab.getByRole('img', { name: /^SHA-256 hash:/ }).getAttribute('aria-label')).slice(14);
  assert.equal(await readHash(), sha(''));
  for (const text of ['abc', 'abc ', 'abc\n', 'Lerntext 🚀', 'abc']) {
    await input.fill(text);
    assert.equal(await readHash(), sha(text), `Exact visible UTF-8 input ${JSON.stringify(text)}`);
  }
  assert.equal(await lab.getByRole('button', { name: 'Try automatically' }).count(), 0, 'Try by hand first');
  let text = 'Learner A';
  let number = 0;
  while (!sha(text).startsWith('0')) {
    await input.fill(text);
    assert.equal(await readHash(), sha(text));
    assert.equal(await lab.getByRole('heading', { name: 'You mined by hand' }).count(), 0);
    text = `Learner A ${++number}`;
  }
  await input.fill(text);
  await lab.getByRole('heading', { name: 'You mined by hand' }).waitFor();
  assert.equal(await readHash(), sha(text));
  const firstHash = await readHash();
  await lab.getByRole('button', { name: 'Try two zeros', exact: true }).click();
  assert.equal(await readHash(), firstHash, 'Target change does not change the hash');
  await lab.getByRole('button', { name: 'Try automatically', exact: true }).click();
  await lab.getByRole('status').filter({ hasText: 'The computer found a match' }).waitFor();
  const automaticText = await input.inputValue();
  assert.equal(await readHash(), sha(automaticText));
  assert.ok((await readHash()).startsWith('00'));
  const foundNumber = Number(automaticText.split(' ').at(-1));
  assert.ok((await lab.getByRole('status').innerText()).includes(`${foundNumber.toLocaleString()} attempts`));
  for (let n = 1; n < foundNumber; n++) assert.ok(!sha(`Learner A ${n}`).startsWith('00'));
  await lab.getByText('Your first proof', { exact: true }).click();
  assert.equal(await lab.locator('.text-hash-proof pre').innerText(), text);
  assert.equal(await lab.locator('.text-hash-proof code').innerText(), firstHash);

  for (const theme of ['dark', 'light']) {
    if (await page.locator('html').getAttribute('data-theme') !== theme) await menu(page, theme === 'light' ? 'Light theme' : 'Dark theme');
    for (const width of [320, 390, 768, 1200, 1512]) {
      await page.setViewportSize({ width, height: 860 });
      await settle(page);
      await input.fill('x'.repeat(1000));
      const fits = await lab.evaluate(element => ({ viewport: innerWidth, page: document.documentElement.scrollWidth,
        panel: element.clientWidth, content: element.scrollWidth }));
      assert.ok(fits.page <= fits.viewport && fits.content <= fits.panel, `Text lab fits ${theme} ${width}: ${JSON.stringify(fits)}`);
      await input.fill(automaticText);
      await page.screenshot({ path: join(output, `text-hash-${theme}-${width}.png`), fullPage: true });
    }
  }
  await page.setViewportSize({ width: 1440, height: 1000 });
  await menu(page, 'Dark theme');
  await lab.getByRole('button', { name: 'Reset text experiment' }).click();
  assert.equal(await readHash(), sha(''));
  assert.equal(await lab.getByRole('heading', { name: 'You mined by hand' }).count(), 0);
  await lab.getByRole('button', { name: 'Back to simulator' }).click();
  assert.deepEqual(await snapshot(page), before, 'Text hashing leaves simulator and wallets unchanged');
  await openTab(page, 'Hash lab');
  assert.equal(await readHash(), sha(''), 'Text is not persisted across leaving');
  return ['Visible text matches independent SHA-256 including whitespace and Unicode',
    'Manual zero match reveals teaching; automation finds first independently verified 00 match',
    'Text lab fits five widths in both themes; reset and navigation preserve simulator state'];
}
