import assert from 'node:assert/strict';
import { join } from 'node:path';
import { asReturningVisitor, menu, openTab, progressBefore } from './workbench.helpers.mjs';

const RAIL = 'proofofwork-rail-collapsed';
const SEEN = 'proofofwork-missions-intro-seen';
const PROGRESS = 'proofofwork-missions';
const START = 'proofofwork-start';
const HASH_SKIPS = ['see-a-fingerprint', 'change-one-letter'];
const TITLES = { new: 'Hashes are new to me', hash: 'I know what a hash is', play: 'Just let me play' };
// The live site is only read: "Hashes are new to me" is chosen against a local preview only.
const isLocal = baseURL => ['localhost', '127.0.0.1', '[::1]'].includes(new URL(baseURL).hostname);
const question = page => page.getByRole('region', { name: 'Where do you want to start?' });
const choice = (page, id) => question(page).getByRole('button', { name: new RegExp(`^${TITLES[id]}`) });
const access = page => page.getByRole('button', { name: page.viewportSize().width < 1024 ? 'Open missions' : 'Expand mission rail', exact: true });
const hide = page => page.getByRole('button', { name: page.viewportSize().width < 1024 ? 'Hide missions' : 'Collapse mission rail', exact: true });
const stored = (page, key) => page.evaluate(name => localStorage.getItem(name), key);
const storedProgress = page => page.evaluate(name => JSON.parse(localStorage.getItem(name)), PROGRESS);
const navigate = async (page, name) => {
  if (page.viewportSize().width < 768) {
    const toggle = page.getByRole('button', { name: 'Menu', exact: true });
    if (await toggle.getAttribute('aria-expanded') !== 'true') await toggle.click();
  }
  await openTab(page, name);
};

async function expectCollapsed(page) {
  await page.locator('.app-shell.is-rail-collapsed').waitFor();
  await access(page).waitFor();
  assert.equal((await access(page).innerText()).trim(), 'Missions');
  assert.equal(await page.locator('.wb-rail .mission-rail-list, .wb-rail .mission-rail-icons, .wb-rail .mission-rail-xp-mini').count(), 0,
    'Hidden missions have no desktop task list, icons or XP');
  assert.equal(await page.locator('.wb-mbar .mission-rail-bar-prog').count(), 0, 'Hidden mobile missions show no task progress');
  assert.equal(await page.locator('.coach-mark.is-active').count(), 0, 'Collapsed missions must not coach free play');
}

// The mission list of the open missions: the rail on desktop, the sheet on a phone (closed again by `done`).
async function missionList(page) {
  if (page.viewportSize().width >= 1024) return { tasks: page.getByRole('complementary', { name: 'Missions' }), done: async () => {} };
  await page.getByRole('button', { name: /steps\. Open missions$/ }).click();
  const tasks = page.getByRole('dialog', { name: 'Missions' });
  await tasks.waitFor();
  return { tasks, done: () => page.getByRole('button', { name: 'Close missions', exact: true }).click() };
}

// The course opened on scene 1 with the rail open and its first coach mark; `skipped` scenes are named as such.
async function expectCourseStart(page, skipped) {
  await page.waitForURL(/#\/basics$/);
  await page.getByRole('heading', { level: 2, name: 'The copy problem', exact: true }).waitFor();
  await page.locator('.app-shell.is-rail-expanded').waitFor();
  await page.locator('[data-coach-target="basics.copy-photo"].is-active').waitFor();
  assert.equal(await question(page).count(), 0);
  assert.equal(await page.getByTestId('leaderboard-ticker').count(), 0, 'No ticker in the course');
  const { tasks, done } = await missionList(page);
  for (const number of [2, 3]) {
    await tasks.getByText(`Mission ${number} · ${skipped ? 'skipped' : 'locked'}`, { exact: true }).waitFor();
  }
  await done();
}

// Also used for the disposable-copy mutation: seed a workbench mission whose
// coach target is present, so removing App's collapsed-coach gate must fail.
export async function verifyCollapsedCoaches(page, baseURL) {
  await asReturningVisitor(page);
  await page.goto(baseURL);
  const progress = progressBefore('send-first-coin');
  await page.evaluate(({ RAIL, PROGRESS, progress }) => {
    localStorage.setItem(RAIL, '1');
    localStorage.setItem(PROGRESS, JSON.stringify(progress));
  }, { RAIL, PROGRESS, progress });
  await page.reload();
  await page.locator('[data-coach-target="workbench.new-transaction"]').waitFor();
  await expectCollapsed(page);
  assert.deepEqual(await storedProgress(page), progress);
}

export async function verifyMissionVisibility(browser, baseURL, output) {
  const results = [];
  const contexts = [];
  const errors = [];
  const local = isLocal(baseURL);
  // A first visit with empty storage (or blocked storage), at `path` of the site.
  const visit = async ({ width = 1440, storageBlocked = false, path = '/' } = {}) => {
    const context = await browser.newContext({ viewport: { width, height: width < 1024 ? 844 : 1000 }, reducedMotion: 'reduce' });
    contexts.push(context);
    // All remote endpoints are synthetic/refused. These scenarios never write live data.
    await context.route('https://api.proofofwork.fyi/**', route => route.abort('connectionrefused'));
    await context.route('https://eu.i.posthog.com/**', route => route.abort('connectionrefused'));
    if (storageBlocked) await context.addInitScript(() => {
      Object.defineProperty(window, 'localStorage', { get() { throw new DOMException('Blocked', 'SecurityError'); } });
    });
    const page = await context.newPage();
    page.setDefaultTimeout(10000);
    page.on('pageerror', error => errors.push(error.message));
    await page.goto(new URL(path, baseURL).href);
    await page.getByRole('main').waitFor();
    // Answer the independent first-visit notice through its real control before
    // testing missions. CI enables usage sharing; the notice can cover low controls.
    const notice = page.locator('.usage-consent');
    if (await notice.count()) await notice.getByRole('button', { name: 'Opt out', exact: true }).click();
    return page;
  };
  try {
    // A first visit asks where to start: at five widths in both themes, without focus theft,
    // overflow, ticker or simulator; leaving the page on the question asks again next time.
    for (const theme of ['dark', 'light']) {
      for (const width of [320, 390, 768, 1200, 1440]) {
        const page = await visit({ width });
        await question(page).waitFor();
        assert.equal(await page.evaluate(() => document.activeElement === document.body), true, 'The question does not take focus');
        if (theme === 'light') await menu(page, 'Light theme');
        await expectCollapsed(page);
        assert.equal(await page.getByRole('main').getAttribute('aria-label'), 'Start');
        assert.equal(new URL(page.url()).hash, '', 'The question keeps the address');
        assert.equal(await page.getByTestId('leaderboard-ticker').count(), 0, 'No ticker on the question');
        assert.equal(await page.getByRole('button', { name: 'Start demo', exact: true }).count(), 0, 'The question replaces the simulator');
        for (const id of ['new', 'hash', 'play']) {
          const box = await choice(page, id).boundingBox();
          assert.ok(box && box.x >= 0 && box.x + box.width <= width, `${TITLES[id]} fits ${width}px: ${JSON.stringify(box)}`);
        }
        assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, `Question fits ${width}px`);
        await page.screenshot({ path: join(output, `start-question-${theme}-${width}.png`), fullPage: width < 1024 });
        await page.reload(); // Nothing was answered: the question returns and nothing is stored.
        await question(page).waitFor();
        assert.deepEqual([await stored(page, START), await stored(page, SEEN)], [null, null]);
        await expectCollapsed(page);
        await page.context().close();
      }
    }
    results.push('Start question: first visits at five widths in both themes, collapsed rail, no ticker, focus theft or overflow; unanswered it returns after a reload');

    // Each answer: stored, its skips applied, and the learner lands on the course or the workbench.
    const courseChoices = local ? ['hash', 'new'] : ['hash'];
    for (const id of courseChoices) {
      const page = await visit();
      await choice(page, id).click();
      assert.equal(await stored(page, START), id);
      assert.equal(await stored(page, RAIL), '0', 'A course answer opens the missions');
      await expectCourseStart(page, id === 'hash');
      assert.deepEqual((await storedProgress(page)).skipped, id === 'hash' ? HASH_SKIPS : []);
      // The tone of the texts follows the answer: plain words for newcomers.
      const lede = id === 'new' ? 'You can send a photo and still keep it. Great for photos, a disaster for money.'
        : 'Data is copied, never moved. A digital coin is data.';
      await page.getByText(lede, { exact: true }).waitFor();
      await page.reload();
      await expectCourseStart(page, id === 'hash');
      if (id === 'hash') {
        // Starting point reopens the question with the current answer marked; a new answer applies.
        await menu(page, 'Starting point');
        await page.waitForURL(/#\/start$/);
        await question(page).waitFor();
        assert.equal(await choice(page, 'hash').getAttribute('aria-current'), 'true');
        assert.equal(await question(page).getByText('current', { exact: true }).count(), 1, 'Only the current answer is marked');
        assert.equal(await page.getByTestId('leaderboard-ticker').count(), 0);
        await choice(page, 'play').click();
        await page.waitForURL(/#\/$/);
        await page.getByRole('button', { name: 'Start demo', exact: true }).waitFor();
        assert.equal(await stored(page, START), 'play');
        assert.deepEqual((await storedProgress(page)).skipped, HASH_SKIPS, 'Skipped scenes stay skipped');
      }
      await page.context().close();
    }
    results.push(`Start question: ${local ? '"Hashes are new to me" and ' : ''}"I know what a hash is" store the answer, open the missions and the first Basics scene with its coach mark and tone${local ? '' : ' (the beginner answer is checked against a local preview only)'}; the second skips scenes 2 and 3; Starting point reopens the question with the answer marked`);

    // "Just let me play": the workbench in free play, also after a reload, then the missions on demand.
    for (const width of [1440, 390]) {
      const page = await visit({ width });
      await choice(page, 'play').click();
      await page.waitForURL(/#\/$/);
      await page.getByRole('button', { name: 'Start demo', exact: true }).waitFor();
      assert.deepEqual([await stored(page, START), await stored(page, SEEN)], ['play', '1']);
      assert.deepEqual(await storedProgress(page), progressBefore('copy-problem'), 'Free play starts with fresh progress');
      await page.reload();
      await page.getByRole('button', { name: 'Start demo', exact: true }).waitFor();
      assert.equal(await question(page).count(), 0);
      await expectCollapsed(page);
      // With fresh progress the missions open on the first Basics scene.
      await access(page).click();
      await page.locator('.app-shell.is-rail-expanded').waitFor();
      const tasks = width < 1024 ? page.getByRole('dialog', { name: 'Missions' }) : page.getByRole('complementary', { name: 'Missions' });
      await tasks.getByRole('button', { name: 'Show me' }).click();
      await page.waitForURL(/#\/basics$/);
      await page.locator('[data-coach-target="basics.copy-photo"].is-active').waitFor();
      for (const name of ['Send photo to Bob', 'Send coin to Bob', 'Send same coin to Carol']) await page.getByRole('button', { name, exact: true }).click();
      await page.getByRole('switch', { name: 'Shared list' }).click();
      for (const name of ['Send coin to Bob', 'Send same coin to Carol']) await page.getByRole('button', { name, exact: true }).click();
      await page.getByRole('heading', { name: 'What you learned', exact: true }).waitFor();
      assert.equal(await page.getByRole('heading', { level: 2, name: 'The copy problem', exact: true }).count(), 1, 'A done scene stays until Continue');
      const progress = await storedProgress(page);
      assert.deepEqual(progress.completed, ['copy-problem']);
      await hide(page).click();
      await expectCollapsed(page);
      await page.getByRole('button', { name: 'Back to simulator', exact: true }).waitFor();
      await page.reload();
      await expectCollapsed(page);
      assert.deepEqual(await storedProgress(page), progress);
      // Every view stays available and keeps the neutral missions entry.
      for (const name of ['Hash lab', 'Chain lab', 'Leaderboard', 'Basics', 'Workbench']) {
        await navigate(page, name);
        await expectCollapsed(page);
      }
      await access(page).click();
      if (width < 1024) await page.getByRole('button', { name: 'Close missions', exact: true }).click();
      await page.waitForURL(/#\/basics$/);
      await page.reload();
      await page.locator('.app-shell.is-rail-expanded').waitFor();
      assert.deepEqual(await storedProgress(page), progress);
      await hide(page).click();
      await verifyCollapsedCoaches(page, baseURL);
      await page.context().close();
    }
    results.push('Start question: "Just let me play" opens the workbench in free play, also after a reload; desktop and phone open/close the missions on the first Basics scene, keep free labs and all tabs, saved expansion and earned progress; no workbench coach while hidden');

    // Deep links are never redirected, and they do not end the first visit.
    const linked = await visit({ path: '/#/hash-lab' });
    await linked.getByRole('heading', { name: 'Mine by hand', exact: true }).waitFor();
    assert.equal(await question(linked).count(), 0);
    assert.match(linked.url(), /#\/hash-lab$/);
    await linked.goto('about:blank');
    await linked.goto(new URL('/#/pool/fixture-miner', baseURL).href);
    await linked.locator('section.pool-panel').waitFor();
    assert.equal(await question(linked).count(), 0);
    assert.match(linked.url(), /#\/pool\/fixture-miner$/);
    await linked.goto('about:blank');
    await linked.goto(baseURL);
    await question(linked).waitFor();
    assert.deepEqual([await stored(linked, START), await stored(linked, SEEN)], [null, null]);
    // Earlier visitors are not asked: the earlier invitation's flag, or completed or skipped missions.
    const reloadsTo = async (key, value, expectQuestion) => {
      await linked.evaluate(({ key, value }) => {
        localStorage.clear();
        if (key) localStorage.setItem(key, value);
      }, { key, value });
      await linked.reload();
      if (expectQuestion) await question(linked).waitFor();
      else await linked.getByRole('button', { name: 'Start demo', exact: true }).waitFor();
      assert.equal(await question(linked).count(), expectQuestion ? 1 : 0, `${key} ${value}`);
    };
    await reloadsTo(SEEN, '1', false);
    await reloadsTo(PROGRESS, JSON.stringify({ ...progressBefore('copy-problem'), completed: ['copy-problem'] }), false);
    await reloadsTo(PROGRESS, JSON.stringify({ ...progressBefore('copy-problem'), skipped: ['see-a-fingerprint'] }), false);
    await reloadsTo(null, null, true);
    await linked.context().close();
    results.push('Start question: deep links to the Hash lab and a miner profile open as linked and keep the question for later; the earlier invitation flag or earned or skipped missions skip it');

    // Blocked storage: every answer still works for this visit, and nothing can be remembered.
    const blocked = await visit({ width: 390, storageBlocked: true });
    await choice(blocked, 'play').click();
    await blocked.getByRole('button', { name: 'Start demo', exact: true }).waitFor();
    await access(blocked).click();
    await blocked.getByRole('button', { name: 'Close missions', exact: true }).click();
    await hide(blocked).click();
    await navigate(blocked, 'Hash lab');
    await blocked.getByRole('button', { name: 'Back to simulator', exact: true }).waitFor();
    await expectCollapsed(blocked);
    assert.equal(await question(blocked).count(), 0);
    for (const id of courseChoices) {
      await menu(blocked, 'Starting point');
      await question(blocked).waitFor();
      await choice(blocked, id).click();
      await expectCourseStart(blocked, true);
    }
    await blocked.goto('about:blank');
    await blocked.goto(baseURL);
    await question(blocked).waitFor();
    await blocked.context().close();
    assert.deepEqual(errors, []);
    results.push('Start question: blocked storage lets "Just let me play" and the course answers work for the visit; the next visit asks again');
    return results;
  } finally {
    for (const context of contexts) await context.close();
  }
}
