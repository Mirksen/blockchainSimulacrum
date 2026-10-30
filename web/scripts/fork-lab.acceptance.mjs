import assert from 'node:assert/strict';
import { join } from 'node:path';
import { menu, openTab, settle, snapshot } from './workbench.helpers.mjs';

// Real browser proofs, local state only. No challenge or proof is sent to the pool.
export async function verifyForkLab(page, output, before) {
  await openTab(page, 'Chain lab');
  await page.getByRole('button', { name: 'Competing branches', exact: true }).click();
  const lab = page.locator('.fork-experiment');
  const rounds = count => lab.getByText(`${count} / 12 new blocks`, { exact: true });
  const selected = name => lab.getByText(`${name} is selected.`, { exact: true });
  const step = async count => {
    await lab.getByRole('button', { name: 'Mine one block', exact: true }).click();
    await rounds(count).waitFor();
    await lab.getByRole('button', { name: 'Run experiment', exact: true }).waitFor();
  };
  await lab.getByText(/Work is tied/).waitFor();
  await lab.getByRole('radio', { name: 'Rewrite history', exact: true }).check();
  const power = lab.getByRole('slider', { name: 'Alternative hash power', exact: true });
  await power.focus();
  await power.press('End');
  assert.equal(await power.inputValue(), '100');
  await step(1);
  await selected('Original').waitFor();
  await step(2);
  await lab.getByText(/Work is tied/).waitFor();
  await selected('Original').waitFor();
  await step(3);
  await selected('Alternative').waitFor();
  await lab.getByText(/Rewrite observed:/).waitFor();
  await power.focus();
  await power.press('Home');
  await step(4);
  await lab.getByText(/Work is tied/).waitFor();
  await selected('Alternative').waitFor();
  await step(5);
  await selected('Original').waitFor();

  const proofChecks = await lab.evaluate(async element => {
    const parse = record => {
      const values = [...record.querySelectorAll('dd')].map(dd => dd.textContent);
      return { number: Number(record.querySelector(':scope > strong').textContent.replace('Block ', '')),
        data: record.querySelector(':scope > p').textContent, previousHash: values[2], nonce: Number(values[0]), hash: values[1] };
    };
    const shared = [...element.querySelectorAll('.fork-experiment-ancestor .fork-experiment-block')].map(parse);
    return Promise.all([...element.querySelectorAll('.fork-experiment-branch')].map(async branch => {
      const blocks = [...shared, ...[...branch.querySelectorAll('.fork-experiment-block')].map(parse)];
      const checks = await Promise.all(blocks.map(async (block, index) => {
        const preimage = JSON.stringify({ number: block.number, data: block.data, previousHash: block.previousHash, nonce: block.nonce });
        const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(preimage));
        const hash = [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, '0')).join('');
        return block.number === index + 1 && hash === block.hash && hash.startsWith('0') &&
          block.previousHash === (index ? blocks[index - 1].hash : '0'.repeat(64));
      }));
      const work = Number(branch.querySelector('.fork-experiment-work strong').textContent.split(' ')[0]);
      return { valid: checks.every(Boolean), count: blocks.length, work };
    }));
  });
  for (const proof of proofChecks) { assert.ok(proof.valid, JSON.stringify(proof)); assert.equal(proof.work, proof.count * 16); }

  for (const theme of ['dark', 'light']) {
    if (await page.locator('html').getAttribute('data-theme') !== theme) await menu(page, theme === 'light' ? 'Light theme' : 'Dark theme');
    for (const width of [320, 390, 768, 1440]) {
      await page.setViewportSize({ width, height: 960 });
      await settle(page);
      const fits = await lab.evaluate(element => ({ page: document.documentElement.scrollWidth, viewport: innerWidth,
        lab: element.scrollWidth, width: element.clientWidth }));
      assert.ok(fits.page <= fits.viewport && fits.lab <= fits.width, JSON.stringify(fits));
      assert.equal(await lab.locator('.btn-emphasized').count(), 1);
      await page.evaluate(() => { scrollTo(0, 0); document.querySelector('.chain-lab').scrollTop = 0; });
      await page.screenshot({ path: join(output, `fork-lab-${theme}-${width}.png`), fullPage: true });
    }
  }
  await page.setViewportSize({ width: 1440, height: 960 });
  await settle(page);
  await lab.getByRole('button', { name: 'Reset fork experiment' }).click();
  await power.focus();
  await power.press('End');
  await lab.getByRole('button', { name: 'Run experiment', exact: true }).click();
  await rounds(12).waitFor({ timeout: 30000 });
  assert.equal(await lab.getByRole('button', { name: 'Mine one block' }).isDisabled(), true);
  assert.equal(await lab.getByRole('button', { name: 'Run experiment' }).isDisabled(), true);
  await lab.getByRole('button', { name: 'Reset fork experiment' }).click();
  await lab.getByRole('button', { name: 'Run experiment' }).press('Enter');
  await lab.getByRole('button', { name: 'Stop experiment' }).press('Enter');
  const stoppedAt = await lab.locator('.fork-experiment-rounds').innerText();
  await page.clock.runFor(1000);
  assert.equal(await lab.locator('.fork-experiment-rounds').innerText(), stoppedAt);
  await lab.getByRole('status').filter({ hasText: 'Experiment stopped' }).waitFor();
  await page.locator('section.chain-lab').getByRole('button', { name: 'Back to simulator' }).click();
  assert.deepEqual(await snapshot(page), before, 'Fork lab never changes the simulator');
  return ['Fork lab: real SHA-256 proofs, strict-work switches in both directions and incumbent preserved on ties',
    'Fork lab: twelve-block cap, Stop, simulator isolation, both themes and four viewport widths'];
}

export async function verifyForkMission(browser, baseURL, output) {
  const page = await browser.newPage({ viewport: { width: 1440, height: 960 }, reducedMotion: 'reduce' });
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.clock.install();
  await page.route('https://eu.i.posthog.com/**', route => route.abort('connectionrefused'));
  await page.route('https://api.proofofwork.fyi/**', route => route.abort('connectionrefused'));
  try {
    await page.goto(baseURL);
    // Fixture: an old browser record with the original eight missions completed.
    await page.evaluate(() => {
      localStorage.setItem('proofofwork-rail-collapsed', '0');
      localStorage.setItem('proofofwork-missions-intro-seen', '1');
      localStorage.setItem('proofofwork-missions', JSON.stringify({ version: 1, step: 0, data: {}, completed: [
        'change-fingerprint', 'earn-proof-of-work', 'send-first-coin', 'win-mining-race', 'change-the-past',
        'forge-a-block', 'survive-halving', 'beat-difficulty-adjustment' ] }));
    });
    await page.reload();
    const rail = page.locator('.wb-rail');
    await rail.getByText('8 of 9 done', { exact: false }).waitFor();
    await rail.getByRole('button', { name: 'Show me', exact: true }).click();
    const lab = page.locator('.fork-experiment');
    await lab.getByRole('radio', { name: 'Rewrite history' }).check();
    const power = lab.getByRole('slider', { name: 'Alternative hash power' });
    await power.focus(); await power.press('End');
    // Closing guidance during a paced run revokes its lesson authority.
    await lab.getByRole('button', { name: 'Mine one block' }).click();
    await lab.getByText('1 / 12 new blocks', { exact: true }).waitFor();
    await page.clock.pauseAt(await page.evaluate(() => Date.now() + 1000));
    await lab.getByRole('button', { name: 'Run experiment' }).click();
    await lab.getByText('2 / 12 new blocks', { exact: true }).waitFor();
    const partial = await page.evaluate(() => localStorage.getItem('proofofwork-missions'));
    await rail.getByRole('button', { name: 'Collapse mission rail' }).click();
    await page.clock.runFor(1000);
    await page.waitForTimeout(200);
    assert.equal(await page.evaluate(() => localStorage.getItem('proofofwork-missions')), partial,
      'Hidden guidance cannot receive a late mission completion');
    await lab.getByText('0 / 12 new blocks', { exact: true }).waitFor();
    await page.clock.resume();
    await rail.getByRole('button', { name: 'Expand mission rail' }).click();
    await lab.getByRole('radio', { name: 'Rewrite history' }).check();
    await power.focus(); await power.press('End');
    for (let i = 1; i <= 3; i++) {
      await lab.getByRole('button', { name: 'Mine one block' }).click();
      await lab.getByText(`${i} / 12 new blocks`, { exact: true }).waitFor();
    }
    await rail.getByText('All 9 missions done. Free play is open.', { exact: true }).waitFor();
    await lab.getByText(/Rewrite observed:/).waitFor();
    assert.equal(await page.locator('.coach-mark.is-active').count(), 0);
    const stored = await page.evaluate(() => JSON.parse(localStorage.getItem('proofofwork-missions')));
    assert.equal(stored.completed.at(-1), 'follow-stronger-chain');
    await page.screenshot({ path: join(output, 'fork-mission-complete.png'), fullPage: true });
    await page.reload();
    await rail.getByText('All 9 missions done. Free play is open.', { exact: true }).waitFor();
    assert.deepEqual(errors, []);
    return ['Fork mission: old eight-complete progress unlocks mission nine; hiding guidance cancels pending work; actual rewrite proof switches complete and persist it'];
  } finally { await page.close(); }
}
