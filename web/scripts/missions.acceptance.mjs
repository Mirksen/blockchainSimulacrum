import assert from 'node:assert/strict';
import { join } from 'node:path';
import { menu, openTab, settle, workbench } from './workbench.helpers.mjs';
import { MISSIONS, earnedBadges, totalXp } from '../src/lib/missions.js';

// The mission track with the rail open: the first three missions, coach marks,
// lab lessons and progress that survives a reload. Starts on the workbench after a demo.
export async function verifyMissions(page, output) {
  const rail = page.getByRole('complementary', { name: 'Missions' });
  const done = count => rail.locator('.mission-rail-xp').filter({ hasText: `${count} of 9 done` });
  const showMe = () => rail.getByRole('button', { name: 'Show me' });
  const activeCoach = target => page.locator(`[data-coach-target="${target}"].is-active`);
  await done(0).waitFor();
  await page.screenshot({ path: join(output, 'missions-rail-1440.png') });

  // Mission 1: Show me switches to the hash lab lesson and marks the message.
  await showMe().click();
  await page.waitForURL(/#\/hash-lab$/);
  await page.getByRole('heading', { name: 'Small change. New fingerprint.' }).waitFor();
  await activeCoach('hash-lab.message').waitFor();
  await page.getByLabel('Message', { exact: true }).fill('Hello, block?');
  await done(1).waitFor();

  // Mission 2 runs in the same tab: a fixed message and two searches from nonce 0.
  await page.getByRole('heading', { name: 'Same input. A stricter target.' }).waitFor();
  await activeCoach('hash-lab.search').waitFor();
  const lab = page.locator('section.hash-lab');
  await lab.getByRole('button', { name: 'Find a nonce', exact: true }).click();
  await lab.getByRole('status').filter({ hasText: 'Target found' }).waitFor({ timeout: 30000 });
  assert.equal(await done(1).count(), 1, 'One zero alone does not finish mission 2');
  const comparison = page.getByRole('region', { name: 'Proof-of-work search comparison' });
  const row = target => comparison.getByRole('row', { name: new RegExp(`^${target} `) });
  const first = await row('One zero').innerText();
  assert.equal(await row('One zero').getByRole('cell').first().innerText(), '4');
  await lab.getByLabel('Find a hash starting with').selectOption('2');
  assert.equal(await row('One zero').innerText(), first, 'Changing target retains the real first result');
  await lab.getByRole('button', { name: 'Find a nonce', exact: true }).click();
  await done(2).waitFor({ timeout: 30000 });
  await lab.getByRole('button', { name: 'Back to simulator' }).waitFor();
  assert.equal(await row('One zero').innerText(), first, 'Mission completion retains the first result');
  assert.equal(await row('Two zeros').getByRole('cell').first().innerText(), '72');
  assert.match(await comparison.innerText(), /does not guarantee/);
  // Inspect the actual full hashes and comparison at each responsive breakpoint.
  for (const details of await comparison.locator('details').all()) await details.locator('summary').click();
  for (const theme of ['dark', 'light']) {
    if (await page.locator('html').getAttribute('data-theme') !== theme) await menu(page, theme === 'light' ? 'Light theme' : 'Dark theme');
    for (const width of [320, 390, 768, 1440]) {
      await page.setViewportSize({ width, height: 1000 });
      await settle(page);
      await comparison.scrollIntoViewIfNeeded();
      const fits = await comparison.evaluate(element => ({ scroll: element.scrollWidth, width: element.clientWidth,
        containerScroll: element.closest('.hash-lab').scrollWidth, containerWidth: element.closest('.hash-lab').clientWidth,
        page: document.documentElement.scrollWidth, viewport: innerWidth }));
      assert.ok(fits.scroll <= fits.width && fits.containerScroll <= fits.containerWidth && fits.page <= fits.viewport,
        `Comparison fits ${width}: ${JSON.stringify(fits)}`);
      await page.screenshot({ path: join(output, `work-comparison-${theme}-${width}.png`), fullPage: true });
    }
  }
  await page.setViewportSize({ width: 1440, height: 1000 });
  await settle(page);
  await menu(page, 'Dark theme');
  await lab.getByRole('button', { name: 'Reset lab', exact: true }).click();
  await openTab(page, 'Chain lab');
  await openTab(page, 'Hash lab');
  assert.equal(await comparison.count(), 0, 'Reset clears the App recap as well as the mounted lab');
  // Progress lives in this browser: a reload keeps it, the simulator starts fresh.
  await page.reload();
  await done(2).waitFor();
  await openTab(page, 'Workbench');

  // Mission 3 needs funded wallets: set up the demo, then Show me marks New transaction.
  const wb = workbench(page);
  await page.getByRole('button', { name: 'Start demo', exact: true }).click();
  await wb.mine(3).waitFor({ timeout: 30000 });
  await showMe().click();
  await page.waitForURL(/#\/$/);
  await activeCoach('workbench.new-transaction').waitFor();
  await page.screenshot({ path: join(output, 'missions-coach-workbench.png') });
  await page.getByRole('button', { name: 'New transaction', exact: true }).click();
  const form = page.getByRole('form', { name: 'New transaction' });
  await form.getByRole('combobox',{name:'From'}).selectOption('Alice');
  await form.getByRole('combobox',{name:'To'}).selectOption('Bob');
  await form.getByLabel(/^Amount/).fill('0.05');
  await form.getByRole('button', { name: 'Add to mempool' }).click();
  await done(3).waitFor();
  await activeCoach('workbench.back-miner').waitFor();

  // Phone: the rail becomes a mission bar on top of the timeline.
  await page.setViewportSize({ width: 390, height: 844 });
  await page.locator('.mission-rail-bar').waitFor();
  await page.evaluate(() => scrollTo(0, 0));
  await page.screenshot({ path: join(output, 'missions-bar-390.png') });
  await page.setViewportSize({ width: 1440, height: 1000 });
  return ['Missions: Show me switches tabs and marks the step; lab lessons complete missions 1 and 2',
    'Work comparison: actual one/two-zero counts survive target and mission changes, fit both themes/four widths, and Reset clears the recap',
    'Missions: progress survives a reload; sending a coin completes mission 3 and coaches the next step'];
}

// A real App and hook, with persisted snapshots from before a page reload.
// Remote writes stay refused, including when this runs against the public domain.
export async function verifyMissionReload(browser, baseURL, output) {
  const cases = [
    ['win-mining-race', 1, { backed: 'fixture-miner' }],
    ['forge-a-block', 2, { tampered: 2, next: 3 }],
    ['survive-halving', 1, { epoch: 3 }],
  ];
  const errors = [];
  for (const width of [1440, 390]) {
    for (const [id, step, data] of cases) {
      const context = await browser.newContext({ viewport: { width, height: 1000 }, reducedMotion: 'reduce' });
      try {
        await context.route('https://api.proofofwork.fyi/**', route => route.abort('connectionrefused'));
        await context.route('https://eu.i.posthog.com/**', route => route.abort('connectionrefused'));
        const page = await context.newPage();
        page.setDefaultTimeout(10000);
        page.on('pageerror', error => errors.push(error.message));
        await page.goto(baseURL);
        const completed = MISSIONS.slice(0, MISSIONS.findIndex(mission => mission.id === id)).map(mission => mission.id);
        const stored = { version: 1, completed, step, data };
        await page.evaluate(progress => {
          localStorage.setItem('proofofwork-missions', JSON.stringify(progress));
          localStorage.setItem('proofofwork-rail-collapsed', '0');
          localStorage.setItem('proofofwork-missions-intro-seen', '1');
        }, stored);
        await page.reload();
        const wb = workbench(page);
        await page.getByRole('button', { name: 'Start demo', exact: true }).waitFor();
        assert.equal(await wb.tiles().count(), 1, 'Reload has a fresh genesis-only simulator');
        await page.locator('.app-shell.is-rail-expanded').waitFor();
        const readProgress = () => page.evaluate(() => JSON.parse(localStorage.getItem('proofofwork-missions')));
        assert.deepEqual(await readProgress(), { version: 1, completed, step: 0, data: {} }, `${id} clears discarded runtime prerequisites`);
        if (width < 1024) await page.getByRole('button', { name: /steps\. Open missions$/ }).click();
        const tasks = width < 1024 ? page.getByRole('dialog', { name: 'Missions' }) : page.getByRole('complementary', { name: 'Missions' });
        assert.ok((await tasks.locator('.mission-rail-step.is-current').innerText()).includes(MISSIONS[completed.length].steps[0].text));
        const rewards = await tasks.locator('.mission-rail-xp').innerText();
        assert.ok(rewards.includes(`${totalXp(stored)} XP`));
        const badges = earnedBadges(stored).length;
        assert.ok(rewards.includes(`${badges} ${badges === 1 ? 'badge' : 'badges'}`));
        assert.ok(rewards.includes(`${completed.length} of ${MISSIONS.length} done`));
        await tasks.getByRole('button', { name: 'Show me' }).click();
        await page.getByRole('button', { name: 'Start demo', exact: true }).click();
        await wb.mine(3).waitFor({ timeout: 30000 });
        if (id === 'win-mining-race') {
          await page.getByRole('button', { name: /^Back / }).first().click();
        } else if (id === 'forge-a-block') {
          // Block #2's coinbase is the unspent one after the demo.
          await wb.tile(2).click();
          await page.getByRole('button', { name: 'Tamper with this block', exact: true }).click();
          const editor = page.getByRole('form', { name: 'Change a transaction amount in block 2' });
          await editor.getByLabel('New amount').fill('1');
          await editor.getByRole('button', { name: 'Change amount' }).click();
          await page.getByRole('button', { name: 'Re-mine block #2', exact: true }).waitFor();
        } else {
          await wb.mine(3).click();
          await wb.mine(4).waitFor({ timeout: 30000 });
        }
        await page.waitForFunction(() => JSON.parse(localStorage.getItem('proofofwork-missions')).step === 1);
        const advanced = await readProgress();
        const hide = width < 1024 ? 'Hide missions' : 'Collapse mission rail';
        await page.getByRole('button', { name: hide, exact: true }).click();
        assert.deepEqual(await readProgress(), advanced, 'Hiding preserves this run’s active progress');
        await page.getByRole('button', { name: width < 1024 ? 'Open missions' : 'Expand mission rail', exact: true }).click();
        if (width < 1024) await page.getByRole('button', { name: 'Close missions', exact: true }).click();
        assert.deepEqual(await readProgress(), advanced, 'Reopening preserves this run’s active progress');
        await page.screenshot({ path: join(output, `mission-reload-${id}-${width}.png`), fullPage: true });
        await page.reload();
        await page.getByRole('button', { name: 'Start demo', exact: true }).waitFor();
        assert.deepEqual(await readProgress(), { version: 1, completed, step: 0, data: {} }, 'A second reload clears newly discarded prerequisites too');
      } finally { await context.close(); }
    }
  }
  assert.deepEqual(errors, []);
  return ['Mission reload: race, forge and halving restart against the fresh simulator at desktop/phone widths; rewards and visibility survive, new evidence advances, hide/show preserves in-page steps'];
}
