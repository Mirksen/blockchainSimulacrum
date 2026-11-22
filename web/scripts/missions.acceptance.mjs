import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { join } from 'node:path';
import { asReturningVisitor, menu, openTab, progressBefore, settle, workbench } from './workbench.helpers.mjs';
import { MISSIONS, earnedBadges, textOf, totalXp } from '../src/lib/missions.js';

// The mission track with the rail open, from the guided start on the first Basics scene (the
// caller opened the missions with fresh progress): the six scenes with their coach marks and
// the closing table, then the proof-of-work search in the Hash lab, the repair in the Chain lab
// and the first coin on the workbench. Rail counts, stored progress and visible results are
// checked after every mission.
export async function verifyMissions(page, output) {
  const rail = page.getByRole('complementary', { name: 'Missions' });
  // The counter's own span, matched whole: "1 of 17 done" must not also match "11 of 17 done".
  const done = count => rail.locator('.mission-rail-xp span').filter({ hasText: new RegExp(`^${count} of ${MISSIONS.length} done$`) });
  const showMe = () => rail.getByRole('button', { name: 'Show me' });
  const activeCoach = target => page.locator(`[data-coach-target="${target}"].is-active`);
  const button = name => page.getByRole('button', { name, exact: true });
  const scene = title => page.getByRole('heading', { level: 2, name: title, exact: true });
  const learned = page.getByRole('heading', { name: 'What you learned', exact: true });
  const status = page.locator('.basics-scene-body > .basics-status');
  const completed = () => page.evaluate(() => JSON.parse(localStorage.getItem('proofofwork-missions')).completed);
  const firstIds = count => MISSIONS.slice(0, count).map(mission => mission.id);
  // A done scene shows what it taught and waits for Continue; the course never moves on by itself.
  const finishScene = async (count, title) => {
    await done(count).waitFor();
    await learned.waitFor();
    assert.equal(await scene(title).count(), 1, `${title} stays open until Continue`);
    assert.deepEqual(await completed(), firstIds(count), `Stored progress after ${title}`);
    await button('Continue').click();
  };
  await page.waitForURL(/#\/basics$/);
  await done(0).waitFor();
  await page.screenshot({ path: join(output, 'missions-rail-1440.png') });

  // Scene 1: a photo and a coin are copied alike until the shared list rejects the second payment.
  await scene('The copy problem').waitFor();
  await activeCoach('basics.copy-photo').waitFor();
  await button('Send photo to Bob').click();
  await activeCoach('basics.copy-coin').waitFor();
  await button('Send coin to Bob').click();
  await button('Send same coin to Carol').click();
  await status.filter({ hasText: 'The same coin was spent twice.' }).waitFor();
  await activeCoach('basics.copy-list').waitFor();
  await page.getByRole('switch', { name: 'Shared list' }).click();
  await button('Send coin to Bob').click();
  await button('Send same coin to Carol').click();
  await status.filter({ hasText: 'Rejected: the list says Alice already paid this coin to Bob.' }).waitFor();
  await finishScene(1, 'The copy problem');

  // Scene 2: the same text gives the same fingerprint again.
  await scene('Take a fingerprint').waitFor();
  await activeCoach('basics.text').waitFor();
  const text = page.getByLabel('Your text', { exact: true });
  await text.fill('Synthetic note');
  await text.fill('Synthetic note!');
  assert.equal(await done(1).count(), 1, 'A different text alone does not finish the scene');
  await text.fill('Synthetic note');
  await status.filter({ hasText: 'Same text, same fingerprint.' }).waitFor();
  await finishScene(2, 'Take a fingerprint');

  // Scene 3: four different small changes, each with a different fingerprint.
  await scene('One letter, everything changes').waitFor();
  await activeCoach('basics.compare').waitFor();
  const copy = page.getByRole('textbox', { name: 'Your copy' });
  for (const value of ['Alice pays Bob 100', 'Alice pays Bob 11', 'Alice pays Bob 10 ', 'alice pays Bob 10']) {
    await copy.fill(value);
    const differ = Number(await page.locator('.basics-compare-count .basics-count strong').innerText());
    assert.ok(differ > 0 && differ <= 64, `${JSON.stringify(value)} changes the fingerprint: ${differ}`);
  }
  await finishScene(3, 'One letter, everything changes');

  // Scene 4: "Learner" is a lucky first roll that does not count; "Learner 8" is the find on roll 9.
  await scene('Guess a fingerprint').waitFor();
  await activeCoach('basics.guess').waitFor();
  await page.getByLabel('Your text', { exact: true }).fill('Learner');
  await status.filter({ hasText: 'Lucky roll: 1 in 16 texts starts with 0.' }).waitFor();
  assert.equal(await done(3).count(), 1, 'A lucky first roll does not count');
  for (let roll = 1; roll <= 8; roll++) await button('Roll').click();
  await status.filter({ hasText: 'Found after 9 rolls. Hash the text once and check the leading zero.' }).waitFor();
  assert.equal(await page.getByLabel('Your text', { exact: true }).inputValue(), 'Learner 8');
  assert.equal(await page.locator('.basics-proof pre').textContent(), 'Learner 8');
  assert.equal(await page.locator('.basics-proof code').textContent(), createHash('sha256').update('Learner 8').digest('hex'));
  await finishScene(4, 'Guess a fingerprint');

  // Scene 5: three draws, each won by the first fingerprint that starts with 00.
  await scene('Why would anyone guess?').waitFor();
  await activeCoach('basics.draw').waitFor();
  for (let draw = 1; draw <= 3; draw++) {
    await button('Run the draw').click();
    await page.locator('.basics-page-line').filter({ hasText: `Page ${draw + 1}: ` }).waitFor();
    assert.match(await status.innerText(), /^(Hal|Dorian|Laszlo) wins page \d+ after \d+ rolls in total and writes it\. Reward: 1 coin\.$/);
  }
  const wins = await page.locator('.basics-writer-wins').allInnerTexts();
  assert.equal(wins.reduce((sum, line) => sum + Number(line.replace('Wins: ', '')), 0), 3, `Three pages written: ${wins}`);
  await finishScene(5, 'Why would anyone guess?');

  // Scene 6: a change breaks every later seal; repair is cheap without guessing and costly with it.
  await scene('Sealed pages').waitFor();
  await activeCoach('basics.page-1').waitFor();
  const page1 = page.getByLabel('Page 1 text', { exact: true });
  await page1.fill('Alice pays Bob 1000');
  await status.filter({ hasText: 'Page 1 no longer fits its seal' }).waitFor();
  await activeCoach('basics.repair').waitFor();
  await button('Repair').click();
  await status.filter({ hasText: /^Repaired: .* All seals fit\.$/ }).waitFor();
  const guessing = page.getByLabel('Guessing', { exact: true });
  await guessing.selectOption({ label: '3 zeros' });
  await page1.fill('Alice pays Bob 2000');
  await guessing.selectOption({ label: '2 zeros' });
  await guessing.selectOption({ label: '3 zeros' });
  await button('Repair').click();
  await status.filter({ hasText: /^Repaired: .* All seals fit\.$/ }).waitFor();
  assert.deepEqual(await completed(), firstIds(5), 'A guessing reset discards the page edit');
  await page1.fill('Alice pays Bob 2000');
  await button('Repair').click();
  // Shown once both repairs ran: without guessing and with 3 zeros.
  const costLine = page.locator('.basics-sealed > .basics-count');
  await costLine.waitFor();
  const costs = await costLine.innerText();
  const [, free, work] = costs.match(/^Chain alone: repaired in ([\d,]+) hash(?:es)?\. With work: ([\d,]+) tr(?:y|ies)\.$/) ?? [];
  assert.ok(free && Number(work.replace(/,/g, '')) > Number(free.replace(/,/g, '')), `Work costs more than the chain alone: ${costs}`);
  await finishScene(6, 'Sealed pages');

  // The closing table; its Continue leaves the course for the next mission.
  await scene("Your words, Bitcoin's words").waitFor();
  assert.equal(await page.getByRole('row', { name: 'Lucky number Nonce' }).count(), 1);
  await page.screenshot({ path: join(output, 'missions-basics-bridge-1440.png') });
  await button('Continue').click();

  // Earn a proof of work: Continue opens the Hash lab lesson, a fixed message and two searches from nonce 0.
  await page.waitForURL(/#\/hash-lab$/);
  await page.getByRole('heading', { name: 'Same message. A stricter target.' }).waitFor();
  await activeCoach('hash-lab.search').waitFor();
  const lab = page.locator('section.hash-lab');
  await lab.getByRole('button', { name: 'Find a nonce', exact: true }).click();
  await lab.getByRole('status').filter({ hasText: 'Valid hash found' }).waitFor({ timeout: 30000 });
  assert.equal(await done(6).count(), 1, 'One zero alone does not finish the proof-of-work mission');
  const comparison = page.getByRole('region', { name: 'Proof-of-work search comparison' });
  const row = target => comparison.getByRole('row', { name: new RegExp(`^${target} `) });
  const first = await row('One zero').innerText();
  assert.equal(await row('One zero').getByRole('cell').first().innerText(), '12');
  await lab.getByLabel('Find a hash starting with').selectOption('2');
  assert.equal(await row('One zero').innerText(), first, 'Changing target retains the real first result');
  await lab.getByRole('button', { name: 'Find a nonce', exact: true }).click();
  await done(7).waitFor({ timeout: 30000 });
  assert.deepEqual(await completed(), firstIds(7));
  await lab.getByRole('button', { name: 'Back to simulator' }).waitFor();
  assert.equal(await row('One zero').innerText(), first, 'Mission completion retains the first result');
  assert.equal(await row('Two zeros').getByRole('cell').first().innerText(), '188');
  assert.match(await comparison.innerText(), /more or fewer attempts than the average/);
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
  // Progress and the chain live in this browser: a reload keeps both; Reset starts the chain over.
  const wb = workbench(page);
  await openTab(page, 'Workbench');
  const tilesBefore = await wb.tiles().count();
  await page.reload();
  await done(7).waitFor();
  await openTab(page, 'Workbench');
  await wb.tile(tilesBefore - 1).waitFor();
  assert.equal(await wb.tiles().count(), tilesBefore, 'A reload restores the saved chain');
  assert.equal(await page.getByRole('button', { name: 'Start demo', exact: true }).count(), 0, 'A restored demo needs no new start');
  await menu(page, 'Reset');

  // Change the past: Show me opens the Chain lab repair; an edit of Block 1 and re-mining
  // Blocks 1, 2 and 3 in order complete it.
  await showMe().click();
  await page.waitForURL(/#\/chain-lab$/);
  const chain = page.locator('section.chain-lab');
  await activeCoach('chain-lab.block-1').waitFor();
  await chain.getByLabel('Block 1 data', { exact: true }).fill('A synthetic edited record.');
  await chain.getByText('Toy chain inconsistent', { exact: true }).waitFor();
  await activeCoach('chain-lab.remine').waitFor();
  assert.equal(await done(7).count(), 1, 'An edit alone does not repair the past');
  for (const number of [1, 2, 3]) {
    await chain.getByRole('button', { name: `Re-mine Block ${number}`, exact: true }).click();
    await chain.getByRole('status').filter({ hasText: `Block ${number} re-mined in` }).waitFor({ timeout: 30000 });
  }
  await chain.getByText('Toy chain consistent', { exact: true }).waitFor();
  await done(8).waitFor();
  assert.deepEqual(await completed(), firstIds(8));
  await openTab(page, 'Workbench');

  // Send your first coin needs funded wallets: set up the demo, then Show me marks New transaction.
  // Start demo mines #1; one Mining click confirms the transfers that fund the wallets.
  await page.getByRole('button', { name: 'Start demo', exact: true }).click();
  await wb.mine(2).click({ timeout: 30000 });
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
  await done(9).waitFor();
  assert.deepEqual(await completed(), firstIds(9));
  await activeCoach('workbench.back-miner').waitFor();

  // Phone: the rail becomes a mission bar on top of the timeline.
  await page.setViewportSize({ width: 390, height: 844 });
  await page.locator('.mission-rail-bar').waitFor();
  await page.evaluate(() => scrollTo(0, 0));
  await page.screenshot({ path: join(output, 'missions-bar-390.png') });
  await page.setViewportSize({ width: 1440, height: 1000 });
  return ['Missions: from the guided start the six Basics scenes complete with coach marks, visible results and Continue; the closing table opens the Hash lab lesson',
    'Missions: the Hash lab lesson completes Earn a proof of work; Show me opens the Chain lab repair, which completes Change the past',
    'Work comparison: actual one/two-zero counts survive target and mission changes, fit both themes/four widths, and Reset clears the recap',
    `Missions: progress and the chain survive a reload, Reset starts over; sending a coin completes Send your first coin (9 of ${MISSIONS.length}) and coaches the next step`];
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
        await asReturningVisitor(context);
        const page = await context.newPage();
        page.setDefaultTimeout(10000);
        page.on('pageerror', error => errors.push(error.message));
        await page.goto(baseURL);
        const stored = progressBefore(id, { step, data });
        const { completed } = stored;
        await page.evaluate(progress => {
          localStorage.setItem('proofofwork-missions', JSON.stringify(progress));
          localStorage.setItem('proofofwork-rail-collapsed', '0');
        }, stored);
        await page.reload();
        const wb = workbench(page);
        await page.getByRole('button', { name: 'Start demo', exact: true }).waitFor();
        assert.equal(await wb.tiles().count(), 1, 'Reload has a fresh genesis-only simulator');
        await page.locator('.app-shell.is-rail-expanded').waitFor();
        const readProgress = () => page.evaluate(() => JSON.parse(localStorage.getItem('proofofwork-missions')));
        assert.deepEqual(await readProgress(), progressBefore(id), `${id} clears discarded runtime prerequisites`);
        if (width < 1024) await page.getByRole('button', { name: /steps\. Open missions$/ }).click();
        const tasks = width < 1024 ? page.getByRole('dialog', { name: 'Missions' }) : page.getByRole('complementary', { name: 'Missions' });
        assert.ok((await tasks.locator('.mission-rail-step.is-current').innerText()).includes(textOf(MISSIONS[completed.length].steps[0].text, 'technical')));
        const rewards = await tasks.locator('.mission-rail-xp').innerText();
        assert.ok(rewards.includes(`${totalXp(stored)} XP`));
        const badges = earnedBadges(stored).length;
        assert.ok(rewards.includes(`${badges} ${badges === 1 ? 'badge' : 'badges'}`));
        assert.ok(rewards.includes(`${completed.length} of ${MISSIONS.length} done`));
        await tasks.getByRole('button', { name: 'Show me' }).click();
        await page.getByRole('button', { name: 'Start demo', exact: true }).click();
        await wb.mine(2).click({ timeout: 30000 });
        await wb.mine(3).waitFor({ timeout: 30000 });
        if (id === 'win-mining-race') {
          await page.getByRole('button', { name: /^Back / }).first().click();
        } else if (id === 'forge-a-block') {
          // Block #2's coinbase is the unspent one after the demo.
          await wb.select(2);
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
        const tilesBefore = await wb.tiles().count();
        await page.reload();
        // The chain is restored, but evidence for the active mission must come from this visit.
        await wb.tile(tilesBefore - 1).waitFor();
        assert.equal(await page.getByRole('button', { name: 'Start demo', exact: true }).count(), 0, 'The saved chain is restored');
        assert.deepEqual(await readProgress(), progressBefore(id), 'A second reload clears newly discarded prerequisites too');
      } finally { await context.close(); }
    }
  }
  assert.deepEqual(errors, []);
  return ['Mission reload: race, forge and halving restart their steps at desktop/phone widths while the saved chain is restored; rewards and visibility survive, new evidence advances, hide/show preserves in-page steps'];
}

// The forge mission on real ledger rules: an overclaim is a dead end that only Undo leaves and
// restarts the mission; lowering an unspent coinbase and redoing the work completes it.
export async function verifyForgeMission(browser, baseURL, output) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, reducedMotion: 'reduce' });
  const errors = [];
  try {
    await context.route('https://api.proofofwork.fyi/**', route => route.abort('connectionrefused'));
    await context.route('https://eu.i.posthog.com/**', route => route.abort('connectionrefused'));
    await asReturningVisitor(context);
    const page = await context.newPage();
    page.setDefaultTimeout(30000);
    page.on('pageerror', error => errors.push(error.message));
    await page.goto(baseURL);
    await page.evaluate(progress => {
      localStorage.setItem('proofofwork-missions', JSON.stringify(progress));
      localStorage.setItem('proofofwork-rail-collapsed', '0');
    }, progressBefore('forge-a-block'));
    await page.reload();
    const wb = workbench(page);
    const progress = () => page.evaluate(() => JSON.parse(localStorage.getItem('proofofwork-missions')));
    const tamper = async (index, amount) => {
      await wb.select(index);
      await page.getByRole('button', { name: 'Tamper with this block', exact: true }).click();
      const editor = page.getByRole('form', { name: `Change a transaction amount in block ${index}` });
      await editor.getByLabel('New amount').fill(amount);
      await editor.getByRole('button', { name: 'Change amount' }).click();
    };
    await page.getByRole('button', { name: 'Start demo', exact: true }).click();
    await wb.mine(2).click();
    await wb.mine(3).waitFor();
    await wb.mine(3).click();
    await wb.mine(4).waitFor();

    await tamper(2, '99');
    await page.getByRole('button', { name: 'Undo edit in block #2', exact: true }).click();
    await wb.chainPill().filter({ hasText: 'Chain valid' }).waitFor();
    assert.equal((await progress()).step, 0, 'Undo starts the mission over');

    await tamper(2, '1');
    await page.getByRole('button', { name: 'Re-mine block #2', exact: true }).click();
    await page.getByRole('button', { name: 'Re-mine block #3', exact: true }).click();
    await wb.chainPill().filter({ hasText: 'Chain valid' }).waitFor();
    await page.waitForFunction(id => JSON.parse(localStorage.getItem('proofofwork-missions')).completed.includes(id), 'forge-a-block');
    await page.screenshot({ path: join(output, 'mission-forge-done.png'), fullPage: true });
  } finally { await context.close(); }
  assert.deepEqual(errors, []);
  return ['Forge mission: an overclaimed coinbase is a dead end that Undo leaves; lowering an unspent coinbase and re-mining completes it'];
}
