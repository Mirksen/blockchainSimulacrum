import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { createRequire } from 'node:module';
import { spawn } from 'node:child_process';
import { stripVTControlCharacters } from 'node:util';
import { fileURLToPath } from 'node:url';
import { asReturningVisitor } from './workbench.helpers.mjs';

const require = createRequire(import.meta.url);
const base = process.env.BASE_URL || 'http://127.0.0.1:4187';
const root = fileURLToPath(new URL('..', import.meta.url));
let server, browser;
try {
  if (!process.env.BASE_URL) {
    server = spawn(process.execPath, [fileURLToPath(new URL('../node_modules/vite/bin/vite.js', import.meta.url)), 'preview', '--host', '127.0.0.1', '--port', '4187', '--strictPort'], { cwd: root, stdio: ['ignore', 'pipe', 'pipe'] });
    let log = '';
    server.stdout.on('data', data => { log += data; });
    server.stderr.on('data', data => { log += data; });
    let ready = false;
    for (let i = 0; i < 100; i++) {
      if (server.exitCode !== null) throw new Error(`Preview exited: ${log}`);
      try { if (stripVTControlCharacters(log).includes(base) && (await fetch(base)).ok) { ready = true; break; } } catch { /* Startup only. */ }
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    assert.ok(ready, `Preview did not start: ${log}`);
  }
  browser = await chromium.launch({ channel: 'chrome', headless: true });
  const auditPage = async page => (await page.evaluate(async () => (await globalThis.axe.run(document, {
    runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'] }
  })).violations.map(v => ({ id: v.id, targets: v.nodes.map(node => node.target) }))));
  // A first visit: the start question, then the first Basics scene with its coach mark after
  // "I know what a hash is" (the live site is never answered with "Hashes are new to me").
  for (const [width, height] of [[360, 860], [1512, 860]]) {
    const context = await browser.newContext({ viewport: { width, height }, reducedMotion: 'reduce' });
    await context.route(/^https:\/\/(eu\.i\.posthog\.com|api\.proofofwork\.fyi)\//, route => route.abort('connectionrefused'));
    const page = await context.newPage();
    await page.addInitScript({ path: require.resolve('axe-core/axe.min.js') });
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.goto(`${base}/`);
    const question = page.getByRole('region', { name: 'Where do you want to start?', exact: true });
    const notice = page.getByRole('region', { name: 'This site counts usage', exact: true });
    await question.waitFor();
    assert.equal(await page.getByRole('main').getAttribute('aria-label'), 'Start');
    await page.getByRole('link', { name: 'Skip to content', exact: true }).focus();
    await page.keyboard.press('Enter');
    assert.equal(await page.evaluate(() => document.activeElement.id), 'workbench');
    for (const [label, ready] of [['Start question', question],
      ['Basics scene 1', page.locator('[data-coach-target="basics.copy-photo"].is-active')]]) {
      if (label !== 'Start question') {
        if (width > 600 && await notice.count()) await notice.getByRole('button', { name: 'Opt out', exact: true }).click();
        await question.getByRole('button', { name: /^I know what a hash is/ }).click();
      }
      await ready.waitFor();
      for (const theme of ['dark', 'light']) {
        await page.evaluate(theme => document.documentElement.setAttribute('data-theme', theme), theme);
        assert.deepEqual(await auditPage(page), [], `${label} ${theme} ${width}px`);
        assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `${label}: horizontal overflow`);
      }
    }
    assert.match(page.url(), /#\/basics$/);
    if (width <= 600 && await notice.count()) {
      const main = await page.getByRole('main').boundingBox();
      const card = await notice.boundingBox();
      assert.ok(card.y + card.height <= main.y, 'The mobile notice sits above the first Basics controls and hint');
      const optOut = await notice.getByRole('button', { name: 'Opt out', exact: true }).boundingBox();
      const ok = await notice.getByRole('button', { name: 'OK', exact: true }).boundingBox();
      assert.equal(optOut.y, ok.y, 'Both choices are available in the same row');
      assert.equal(optOut.width, ok.width, 'Both choices have the same width');
      assert.ok(optOut.height === ok.height && ok.height >= 44, 'Both choices have the same touch target height');
      assert.equal(await notice.getByRole('link', { name: 'Privacy policy', exact: true }).getAttribute('href'), '/privacy.html');
      await page.getByRole('button', { name: 'Send photo to Bob', exact: true }).click();
      assert.equal(await page.getByText('Bob got a copy. Alice still has hers.', { exact: true }).isVisible(), true);
      assert.equal(await notice.isVisible(), true, 'Basics works while the notice awaits an answer');
    }
    assert.deepEqual(errors, []);
    await context.close();
  }
  for (const [width, height] of [[360, 860], [1512, 860], [390, 320]]) {
    const context = await browser.newContext({ viewport: { width, height }, reducedMotion: 'reduce' });
    await context.route(/^https:\/\/(eu\.i\.posthog\.com|api\.proofofwork\.fyi)\//, route => route.abort('connectionrefused'));
    // The checks below expect the workbench: a returning visitor.
    await asReturningVisitor(context);
    const page = await context.newPage();
    // Browser instrumentation runs before navigation, including on production's
    // script-src 'self' pages. Keep the application's CSP enforced.
    await page.addInitScript({ path: require.resolve('axe-core/axe.min.js') });
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    const verifyNoticeFocus = async () => {
      if (!await page.getByRole('region', { name: 'This site counts usage', exact: true }).count()) return;
      await page.getByRole('button', { name: 'Reset text experiment', exact: true }).focus();
      for (const key of [null, 'Tab', 'Shift+Tab']) {
        if (key) await page.keyboard.press(key);
        await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
        assert.equal(await page.evaluate(() => {
          const a = document.activeElement.getBoundingClientRect(), b = document.querySelector('.usage-consent').getBoundingClientRect();
          return a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;
        }), false, 'Usage notice must not cover the focused lab action');
      }
      // The mobile notice scrolls with the page. Bring its choices back into
      // view after tabbing through the lab, then check the whole row fits.
      if (width <= 600) await page.getByRole('button', { name: 'Opt out', exact: true }).scrollIntoViewIfNeeded();
      for (const name of ['Opt out', 'OK']) {
        assert.ok(await page.getByRole('button', { name, exact: true }).evaluate(button => {
          const a = button.getBoundingClientRect(), b = button.closest('.usage-consent').getBoundingClientRect();
          return a.top >= b.top && a.bottom <= b.bottom && a.top >= 0 && a.bottom <= innerHeight;
        }), `${name} must stay visible on the notice`);
      }
    };
    const audit = async label => {
      assert.deepEqual(await auditPage(page), [], `${label} ${width}px`);
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `${label}: horizontal overflow`);
    };
    if (height === 320) {
      await page.goto(`${base}/#/hash-lab`);
      await page.getByRole('button', { name: 'Reset text experiment', exact: true }).waitFor();
      await verifyNoticeFocus();
      assert.deepEqual(errors, []);
      await context.close();
      continue;
    }
    for (const route of ['', '#/hash-lab', '#/chain-lab']) {
      await page.goto(`${base}/${route}`);
      await page.getByRole('main').waitFor();
      if (route) await page.getByRole('button', { name: 'Back to simulator', exact: true }).waitFor();
      const view = await page.getByRole('main').getAttribute('aria-label');
      await page.getByRole('link', { name: 'Skip to content', exact: true }).focus();
      await page.keyboard.press('Enter');
      assert.equal(await page.evaluate(() => document.activeElement.id), 'workbench');
      assert.equal(await page.getByRole('main').getAttribute('aria-label'), view);
      if (route === '#/hash-lab') await verifyNoticeFocus();
      for (const theme of ['dark', 'light']) {
        await page.evaluate(theme => document.documentElement.setAttribute('data-theme', theme), theme);
        await audit(`${route || 'workbench'} ${theme}`);
      }
      if (!route) {
        const newTransaction = page.getByRole('button', { name: 'New transaction', exact: true });
        await newTransaction.click();
        await page.getByRole('button', { name: 'Cancel', exact: true }).focus();
        await page.keyboard.press('Enter');
        assert.equal(await newTransaction.evaluate(element => element === document.activeElement), true);
        const miner = page.getByRole('button', { name: 'Hal: hashpower, attempts and name', exact: true });
        await miner.click();
        await page.getByRole('group', { name: 'Miner Hal', exact: true }).getByRole('button', { name: 'Done', exact: true }).click();
        assert.equal(await miner.evaluate(element => element === document.activeElement), true);
        if (width >= 1024) {
          const face = page.locator('.chain-band-tile-face').first();
          await page.keyboard.press('Tab');
          await face.focus();
          const explanation = page.getByRole('group', { name: 'Full hash of block 0', exact: true });
          assert.equal(await explanation.isVisible(), true);
          await page.keyboard.press('Escape');
          assert.equal(await explanation.isVisible(), false);
          assert.equal(await face.evaluate(element => element === document.activeElement), true);
        }
      }
    }
    await page.goto(`${base}/`);
    await page.getByRole('button', { name: width < 768 ? 'Menu' : 'More', exact: true }).click();
    await page.getByRole('button', { name: 'Reset', exact: true }).hover();
    await page.getByRole('tooltip').waitFor();
    await page.getByRole('button', { name: 'Settings', exact: true }).click();
    await page.getByRole('dialog', { name: 'Settings', exact: true }).waitFor();
    for (const theme of ['dark', 'light']) {
      await page.evaluate(theme => document.documentElement.setAttribute('data-theme', theme), theme);
      await audit(`Settings ${theme}`);
    }
    const shortcut = page.getByRole('checkbox', { name: 'Enable M to mine or re-mine a block', exact: true });
    await shortcut.uncheck();
    await page.keyboard.press('Escape');
    assert.equal(await page.evaluate(() => document.activeElement.getAttribute('aria-label')), width < 768 ? 'Menu' : 'More');
    await page.reload();
    assert.equal(await page.evaluate(() => localStorage.getItem('proofofwork-mining-shortcut')), '0');
    assert.deepEqual(errors, []);
    await context.close();
  }
  console.log('Quality: WCAG A/AA axe checks in both themes, 360px/desktop, start question and first Basics scene, skip link, dialog focus return and shortcut preference passed');
} finally { await browser?.close(); server?.kill(); }
