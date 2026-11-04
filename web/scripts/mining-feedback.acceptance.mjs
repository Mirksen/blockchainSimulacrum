import assert from 'node:assert/strict';
import { join } from 'node:path';
import { menu, settle, workbench } from './workbench.helpers.mjs';

// Real UI, real proofs, isolated browser storage; synthetic names and no pool writes.
export async function verifyMiningFeedback(browser, baseURL, output) {
  const page = await browser.newPage({ viewport: { width: 1512, height: 860 }, reducedMotion: 'no-preference' });
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.route('https://api.proofofwork.fyi/**', route => route.abort('connectionrefused'));
  await page.route('https://eu.i.posthog.com/**', route => route.abort('connectionrefused'));
  // Fixed header times make the tenth-block adjustment deterministic. Timers keep running.
  await page.clock.setFixedTime(new Date('2026-01-02T12:00:00Z'));
  await page.addInitScript(() => {
    localStorage.setItem('proofofwork-missions-intro-seen', '1');
    globalThis.feedbackAnimations = [];
    document.addEventListener('animationstart', event => globalThis.feedbackAnimations.push(event.animationName));
  });
  try {
    await page.goto(baseURL);
    const wb = workbench(page);
    await wb.tile(0).waitFor();
    assert.equal(await page.locator('.is-found').count(), 0);
    await menu(page, 'Settings');
    const settings = page.getByRole('dialog', { name: 'Settings', exact: true });
    await settings.getByLabel('Mining difficulty', { exact: true }).fill('1');
    await settings.getByLabel('Halving interval', { exact: true }).fill('5');
    await settings.getByRole('button', { name: 'Done' }).click();
    await menu(page, 'Sound');
    await page.getByRole('button', { name: 'Start demo', exact: true }).click();
    await wb.mine(2).waitFor();
    for (let index = 2; index <= 10; index++) {
      await wb.mine(index).click();
      await wb.mine(index + 1).waitFor();
    }
    const notes = page.getByRole('complementary', { name: 'What changed' });
    await notes.locator('.kf-note.is-up.is-live').waitFor();
    await notes.locator('.kf-note.is-halving.is-live').waitFor();
    const notice = await page.locator('.wb-announce').boundingBox();
    assert.ok(notice.y < 150, 'Found-block notice appears at the top');
    const layout = await page.evaluate(() => {
      const footer = document.querySelector('.wb-notes').getBoundingClientRect();
      const grid = document.querySelector('.wb-grid').getBoundingClientRect();
      return { footerTop: footer.top, footerBottom: footer.bottom, gridBottom: grid.bottom, height: innerHeight };
    });
    assert.ok(layout.footerTop >= layout.gridBottom - 1, 'Explanations follow the cards');
    assert.ok(layout.footerBottom <= layout.height + 1, 'Footer remains visible in the fixed desktop layout');
    // The fixed footer must never make the bottom cards unreachable.
    const cards = page.locator('.wb-grid');
    assert.equal(await cards.evaluate(el => getComputedStyle(el).overflowY), 'auto');
    await cards.evaluate(el => { el.scrollTop = el.scrollHeight; });
    const reachable = await page.evaluate(() => {
      const grid = document.querySelector('.wb-grid').getBoundingClientRect();
      return ['.wb-wallets', '.wb-mempool'].every(selector => {
        const box = document.querySelector(selector).getBoundingClientRect();
        return box.bottom <= grid.bottom + 1 && box.top < grid.bottom;
      });
    });
    assert.ok(reachable, 'Bottom cards are reachable above the explanations');
    await page.screenshot({ path: join(output, 'mining-feedback-desktop.png') });
    await cards.evaluate(el => { el.scrollTop = 0; });
    const animations = await page.evaluate(() => globalThis.feedbackAnimations);
    for (const name of ['wb-block-arrive', 'kf-rule-spark', 'kf-half-left', 'kf-extra-zero']) {
      assert.ok(animations.includes(name), `Observed ${name}`);
    }
    for (const width of [320, 390, 768, 1200]) {
      await page.setViewportSize({ width, height: 860 });
      await settle(page);
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `No overflow at ${width}px`);
      if (width === 390) await page.screenshot({ path: join(output, 'mining-feedback-phone.png'), fullPage: true });
    }
    await page.setViewportSize({ width: 390, height: 844 });
    await settle(page);
    await page.getByRole('button', { name: 'Show the blocks as a list' }).click();
    assert.equal(await page.locator('.is-found').count(), 0, 'Switching representations replays no block');
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await wb.mine(11).click();
    await wb.mine(12).waitFor();
    assert.equal(await page.locator('.chain-timeline-row.is-found').evaluate(el => getComputedStyle(el).animationName), 'none');
    assert.equal(await page.locator('.wb-announce').count(), 1, 'Reduced motion retains the notice');
    await page.emulateMedia({ reducedMotion: 'no-preference' });
    await page.evaluate(() => { globalThis.feedbackAnimations = []; });
    await wb.mine(12).click();
    await wb.mine(13).waitFor();
    await page.waitForFunction(() => globalThis.feedbackAnimations.includes('wb-block-arrive'));
    await page.screenshot({ path: join(output, 'mining-feedback-list.png'), fullPage: true });
    await page.reload();
    await wb.mine(13).waitFor();
    assert.equal(await page.locator('.is-found, .kf-note.is-live, .wb-announce').count(), 0, 'Restored history never celebrates');
    await wb.mine(13).click();
    await wb.mine(14).waitFor();
    assert.equal(await page.locator('.chain-timeline-row.is-found').count(), 1, 'Restored chains celebrate their next live block');
    assert.deepEqual(errors, []);
    return ['Mining feedback: top notice, footer explanations, simultaneous difficulty and halving, real arrival and glyph animations, phone row/list, reduced motion, restore without replay'];
  } finally { await page.close(); }
}
