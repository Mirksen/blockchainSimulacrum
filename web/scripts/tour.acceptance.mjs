import assert from 'node:assert/strict';
import { join } from 'node:path';
import { STORAGE_KEY } from '../src/lib/missions.js';
import { START_KEY } from '../src/lib/startChoice.js';
import { stopsFor, TOUR_KEY } from '../src/lib/tour.js';
import { menu, progressBefore } from './workbench.helpers.mjs';

// The arrival tour of the workbench (src/components/workbench/WorkbenchTour.jsx): a guided
// visitor who finished the course and both lab missions arrives at the workbench, walks the
// five stops (ring on the right region, card inside the viewport, no sideways scrolling) and
// ends with Done; the coach mark returns and a reload does not show the tour again. Skip tour
// marks it seen too; a free player never gets it by itself but can start it from the menu.
// One screenshot per stop at 1440 px dark, stops 1 and 3 at 390 px light. No mining; remote
// endpoints refused.
const RAIL = 'proofofwork-rail-collapsed';
const COACH = '[data-coach-target="workbench.new-transaction"].coach-mark.is-active';
const PLAIN = stopsFor('plain');
const TECHNICAL = stopsFor('technical');

export async function verifyTour(browser, baseURL, output) {
  const results = [];
  const contexts = [];
  const errors = [];
  // A visitor stored as `choice` with the missions open and every mission before the first
  // workbench mission completed. Seeded once, so a reload keeps what the visit stored.
  const visit = async ({ width = 1440, choice = 'new' } = {}) => {
    const context = await browser.newContext({ viewport: { width, height: width < 1024 ? 844 : 900 }, reducedMotion: 'reduce' });
    contexts.push(context);
    await context.route(/^https:\/\/(eu\.i\.posthog\.com|api\.proofofwork\.fyi)\//, route => route.abort('connectionrefused'));
    await context.addInitScript(seed => {
      if (localStorage.getItem(seed.START) !== null) return;
      localStorage.setItem(seed.START, seed.choice);
      // The usage notice was answered on the first page of the visit, long before the workbench:
      // answering it here would take the focus the tour card needs.
      localStorage.setItem('pow.analytics.enabled', 'false');
      localStorage.setItem(seed.RAIL, '0');
      localStorage.setItem(seed.PROGRESS, JSON.stringify(seed.progress));
    }, { START: START_KEY, RAIL, PROGRESS: STORAGE_KEY, choice, progress: progressBefore('send-first-coin') });
    const page = await context.newPage();
    page.setDefaultTimeout(10000);
    page.on('pageerror', error => errors.push(error.message));
    await page.goto(baseURL);
    await page.getByRole('main').waitFor();
    return page;
  };
  const card = page => page.getByRole('dialog').filter({ has: page.locator('.workbench-tour-count') });
  const press = (page, name) => card(page).getByRole('button', { name, exact: true }).click();
  const seen = page => page.evaluate(key => localStorage.getItem(key), TOUR_KEY);

  // One stop: its title and count, focus on the card, the ring around its region, the card
  // inside the viewport and nothing scrolling sideways.
  const expectStop = async (page, stops, number, label) => {
    const stop = stops[number - 1];
    const dialog = page.getByRole('dialog', { name: stop.title, exact: true });
    await dialog.waitFor();
    assert.equal(await dialog.locator('.workbench-tour-count').innerText(), `Stop ${number} of 5`, `${label}: count`);
    assert.equal(await dialog.getAttribute('aria-modal'), 'false', `${label}: non-modal`);
    assert.equal(await dialog.evaluate(node => document.activeElement === node), true, `${label}: focus on the card`);
    await page.waitForFunction(id => {
      const ring = document.querySelector('.workbench-tour-ring');
      const region = document.querySelector(`[data-tour="${id}"]`);
      if (!ring || !region || ring.dataset.tourRing !== id || ring.hidden) return false;
      const r = region.getBoundingClientRect();
      const g = ring.getBoundingClientRect();
      const viewW = document.documentElement.clientWidth;
      const near = (a, b) => Math.abs(a - b) <= 2;
      return near(g.left, Math.max(2, r.left - 4)) && near(g.top, Math.max(2, r.top - 4)) &&
        near(g.right, Math.min(viewW - 2, r.right + 4)) && near(g.bottom, Math.min(innerHeight - 2, r.bottom + 4));
    }, stop.id, { timeout: 5000 });
    const box = await dialog.boundingBox();
    const view = page.viewportSize();
    assert.ok(box && box.x >= 0 && box.y >= 0 && box.x + box.width <= view.width && box.y + box.height <= view.height,
      `${label}: card inside the ${view.width} × ${view.height} viewport: ${JSON.stringify(box)}`);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, `${label}: no sideways scrolling`);
    return { dialog, box };
  };

  try {
    // A guided visitor ("Hashes are new to me") walks all five stops in plain words.
    {
      const page = await visit();
      await page.getByRole('dialog', { name: PLAIN[0].title, exact: true }).waitFor();
      assert.equal(await page.locator(COACH).count(), 0, 'No coach mark while the tour runs');
      for (let number = 1; number <= 5; number++) {
        await expectStop(page, PLAIN, number, `Stop ${number} at 1440 px`);
        if (number === 3) {
          // The tour blocks nothing: Start demo stays enabled and is what lies under the pointer.
          const start = page.getByRole('button', { name: 'Start demo', exact: true });
          assert.equal(await start.isEnabled(), true, 'Start demo stays enabled during the tour');
          assert.equal(await start.evaluate(node => {
            const rect = node.getBoundingClientRect();
            return node.contains(document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2));
          }), true, 'Nothing covers Start demo during the tour');
        }
        await page.screenshot({ path: join(output, `tour-stop-${number}-dark-1440.png`) });
        await press(page, number < 5 ? 'Next' : 'Done');
      }
      await card(page).waitFor({ state: 'detached' });
      await page.locator(COACH).waitFor();
      assert.equal(await page.locator(COACH).evaluate(node => node.contains(document.activeElement)), true,
        'After the tour focus goes to the control the active step needs');
      assert.equal(await seen(page), '1');
      await page.reload();
      await page.locator(COACH).waitFor();
      assert.equal(await page.locator('[data-tour-stop]').count(), 0, 'The tour opens only once');
      await page.context().close();
    }
    results.push('Tour: a guided visitor arriving at the workbench walks five stops in plain words (count, focus, ring on each region, card inside the viewport, Start demo usable); Done brings the coach mark back with focus on New transaction; a reload shows no tour');

    // The phone: the card docks to the bottom edge; stops 1 and 3 in the light theme.
    for (const width of [390, 320]) {
      const page = await visit({ width, choice: 'hash' });
      await page.getByRole('dialog', { name: TECHNICAL[0].title, exact: true }).waitFor();
      if (width === 390) await menu(page, 'Light theme');
      for (let number = 1; number <= 5; number++) {
        const { box } = await expectStop(page, TECHNICAL, number, `Stop ${number} at ${width} px`);
        assert.ok(Math.abs(page.viewportSize().height - (box.y + box.height) - 8) <= 2 && Math.abs(box.x - 8) <= 2,
          `Stop ${number} at ${width} px docks to the bottom edge: ${JSON.stringify(box)}`);
        if (width === 390 && (number === 1 || number === 3)) {
          await page.screenshot({ path: join(output, `tour-stop-${number}-light-390.png`) });
        }
        await press(page, number < 5 ? 'Next' : 'Done');
      }
      await card(page).waitFor({ state: 'detached' });
      await page.context().close();
    }
    results.push('Tour: at 390 px (light) and 320 px the card docks to the bottom edge at every stop, in technical words for "I know what a hash is", without sideways scrolling');

    // Skip tour on a fresh visit marks it seen as well.
    {
      const page = await visit();
      await page.getByRole('dialog', { name: PLAIN[0].title, exact: true }).waitFor();
      await press(page, 'Skip tour');
      await card(page).waitFor({ state: 'detached' });
      await page.locator(COACH).waitFor();
      assert.equal(await seen(page), '1');
      await page.reload();
      await page.locator(COACH).waitFor();
      assert.equal(await page.locator('[data-tour-stop]').count(), 0, 'A skipped tour does not return');
      await page.context().close();
    }
    results.push('Tour: Skip tour ends it, brings the coach mark back and marks it seen');

    // A free player never gets it by itself, but can start it from the menu; Escape skips it.
    {
      const page = await visit({ choice: 'play' });
      await page.locator(COACH).waitFor();
      assert.equal(await page.locator('[data-tour-stop]').count(), 0, 'No tour for "Just let me play"');
      await menu(page, 'Tour of the simulator');
      await expectStop(page, TECHNICAL, 1, 'Stop 1 from the menu');
      await page.keyboard.press('Escape');
      await card(page).waitFor({ state: 'detached' });
      await page.locator(COACH).waitFor();
      assert.equal(await seen(page), '1');
      await page.context().close();
    }
    results.push('Tour: never by itself for "Just let me play"; Tour of the simulator in the menu starts it, Escape skips it');
    assert.deepEqual(errors, [], 'Tour without page errors');
  } finally {
    await Promise.all(contexts.map(context => context.close().catch(() => {})));
  }
  return results;
}
