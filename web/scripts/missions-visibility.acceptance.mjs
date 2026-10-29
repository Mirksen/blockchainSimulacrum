import assert from 'node:assert/strict';
import { join } from 'node:path';
import { menu, openTab } from './workbench.helpers.mjs';

const RAIL = 'proofofwork-rail-collapsed';
const SEEN = 'proofofwork-missions-intro-seen';
const PROGRESS = 'proofofwork-missions';
const invitation = page => page.getByRole('region', { name: 'Curious? Try a mission.' });
const access = page => page.getByRole('button', { name: page.viewportSize().width < 1024 ? 'Open missions' : 'Expand mission rail', exact: true });
const hide = page => page.getByRole('button', { name: page.viewportSize().width < 1024 ? 'Hide missions' : 'Collapse mission rail', exact: true });
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

// Also used for the disposable-copy mutation: seed a workbench mission whose
// coach target is present, so removing App's collapsed-coach gate must fail.
export async function verifyCollapsedCoaches(page, baseURL) {
  await page.goto(baseURL);
  const progress = { version: 1, completed: ['change-fingerprint', 'earn-proof-of-work'], step: 0, data: {} };
  await page.evaluate(({ RAIL, SEEN, PROGRESS, progress }) => {
    localStorage.setItem(RAIL, '1');
    localStorage.setItem(SEEN, '1');
    localStorage.setItem(PROGRESS, JSON.stringify(progress));
  }, { RAIL, SEEN, PROGRESS, progress });
  await page.reload();
  await page.locator('[data-coach-target="workbench.new-transaction"]').waitFor();
  await expectCollapsed(page);
  assert.deepEqual(await page.evaluate(key => JSON.parse(localStorage.getItem(key)), PROGRESS), progress);
}

export async function verifyMissionVisibility(browser, baseURL, output) {
  const results = [];
  const contexts = [];
  const errors = [];
  const visit = async (width = 1440, reducedMotion = 'reduce', storageBlocked = false) => {
    const context = await browser.newContext({ viewport: { width, height: width < 1024 ? 844 : 1000 }, reducedMotion });
    contexts.push(context);
    // All remote endpoints are synthetic/refused. These scenarios never write live data.
    await context.route('https://api.proofofwork.fyi/**', route => route.fulfill({
      status: 200, contentType: 'application/json', headers: { 'Access-Control-Allow-Origin': '*' }, body: '[]',
    }));
    await context.route('https://eu.i.posthog.com/**', route => route.abort('connectionrefused'));
    if (storageBlocked) await context.addInitScript(() => {
      Object.defineProperty(window, 'localStorage', { get() { throw new DOMException('Blocked', 'SecurityError'); } });
    });
    const page = await context.newPage();
    page.setDefaultTimeout(10000);
    page.on('pageerror', error => errors.push(error.message));
    await page.goto(baseURL);
    await page.getByRole('button', { name: 'Start demo', exact: true }).waitFor();
    return page;
  };
  try {
    for (const theme of ['dark', 'light']) {
      for (const width of [320, 390, 768, 1200, 1440]) {
        const page = await visit(width);
        assert.equal(await page.evaluate(() => document.activeElement === document.body), true, 'The invitation does not take focus');
        if (theme === 'light') await menu(page, 'Light theme');
        await expectCollapsed(page);
        await invitation(page).waitFor();
        assert.equal(await access(page).evaluate(element => getComputedStyle(element).animationName), 'none', 'Reduced motion disables invitation animation');
        assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, `Invitation fits ${width}px`);
        const introBottom = await invitation(page).evaluate(element => element.getBoundingClientRect().bottom);
        const demoTop = await page.getByRole('button', { name: 'Start demo', exact: true }).evaluate(element => element.getBoundingClientRect().top);
        assert.ok(demoTop >= introBottom, 'The invitation never overlays the simulation controls');
        await page.screenshot({ path: join(output, `missions-invitation-${theme}-${width}.png`), fullPage: width < 1024 });
        await page.reload(); // Ignoring the invitation is enough: it never reappears.
        assert.equal(await invitation(page).count(), 0);
        await expectCollapsed(page);
        await page.context().close();
      }
    }
    results.push('Optional missions: default hidden at five widths in both themes; ignored invitation stays away after reload, no focus theft or overlap');

    for (const width of [1440, 390]) {
      const page = await visit(width);
      await invitation(page).getByRole('button', { name: "Don't show again" }).click();
      await page.reload();
      assert.equal(await invitation(page).count(), 0);
      await expectCollapsed(page);
      await access(page).click();
      await page.locator('.app-shell.is-rail-expanded').waitFor();
      const tasks = width < 1024 ? page.getByRole('dialog', { name: 'Missions' }) : page.getByRole('complementary', { name: 'Missions' });
      await tasks.getByRole('button', { name: 'Show me' }).click();
      await page.waitForURL(/#\/hash-lab$/);
      await page.locator('[data-coach-target="hash-lab.message"].is-active').waitFor();
      await page.getByLabel('Message', { exact: true }).fill('Hello, block?');
      await page.getByRole('heading', { name: 'Same input. A stricter target.' }).waitFor();
      const progress = await page.evaluate(key => JSON.parse(localStorage.getItem(key)), PROGRESS);
      assert.deepEqual(progress.completed, ['change-fingerprint']);
      await hide(page).click();
      await expectCollapsed(page);
      await page.getByRole('button', { name: 'Back to simulator', exact: true }).waitFor();
      await page.reload();
      await expectCollapsed(page);
      assert.deepEqual(await page.evaluate(key => JSON.parse(localStorage.getItem(key)), PROGRESS), progress);
      // Every view stays available and keeps the neutral missions entry.
      for (const name of ['Chain lab', 'Mining pool', 'Workbench']) {
        await navigate(page, name);
        await expectCollapsed(page);
      }
      await access(page).click();
      if (width < 1024) await page.getByRole('button', { name: 'Close missions', exact: true }).click();
      await page.reload();
      await page.locator('.app-shell.is-rail-expanded').waitFor();
      assert.deepEqual(await page.evaluate(key => JSON.parse(localStorage.getItem(key)), PROGRESS), progress);
      await hide(page).click();
      await verifyCollapsedCoaches(page, baseURL);
      await page.context().close();
    }
    results.push('Optional missions: desktop and phone open/close, dismiss persistence, free labs, all tabs, saved expansion and preserved earned progress; no workbench coach while hidden');

    const animated = await visit(1440, 'no-preference');
    const animation = await access(animated).evaluate(element => {
      const style = getComputedStyle(element);
      return { name: style.animationName, count: style.animationIterationCount, duration: style.animationDuration };
    });
    assert.deepEqual(animation, { name: 'mission-invitation-glow', count: '1', duration: '1.6s' });
    await invitation(animated).getByRole('button', { name: 'Start missions' }).click();
    await animated.locator('.app-shell.is-rail-expanded').waitFor();
    await animated.reload();
    assert.equal(await invitation(animated).count(), 0);
    await animated.locator('.app-shell.is-rail-expanded').waitFor();
    await animated.context().close();

    const blocked = await visit(390, 'reduce', true);
    await invitation(blocked).getByRole('button', { name: "Don't show again" }).click();
    await access(blocked).click();
    await blocked.getByRole('button', { name: 'Close missions', exact: true }).click();
    await hide(blocked).click();
    await navigate(blocked, 'Hash lab');
    await blocked.getByRole('button', { name: 'Back to simulator', exact: true }).waitFor();
    await expectCollapsed(blocked);
    assert.equal(await invitation(blocked).count(), 0);
    await blocked.context().close();
    assert.deepEqual(errors, []);
    results.push('Optional missions: one 1.6-second highlight, reduced-motion respected, Start missions remembered, blocked storage leaves this visit fully usable');
    return results;
  } finally {
    for (const context of contexts) await context.close();
  }
}
