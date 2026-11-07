import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { createRequire } from 'node:module';
import { spawn } from 'node:child_process';
import { stripVTControlCharacters } from 'node:util';
import { fileURLToPath } from 'node:url';

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
  for (const width of [360, 1512]) {
    const context = await browser.newContext({ viewport: { width, height: 860 }, reducedMotion: 'reduce' });
    await context.route(/^https:\/\/(eu\.i\.posthog\.com|api\.proofofwork\.fyi)\//, route => route.abort('connectionrefused'));
    const page = await context.newPage();
    // Browser instrumentation runs before navigation, including on production's
    // script-src 'self' pages. Keep the application's CSP enforced.
    await page.addInitScript({ path: require.resolve('axe-core/axe.min.js') });
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    const audit = async label => {
      const violations = await page.evaluate(async () => (await globalThis.axe.run(document, {
        runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'] }
      })).violations.map(v => ({ id: v.id, targets: v.nodes.map(node => node.target) })));
      assert.deepEqual(violations, [], `${label} ${width}px`);
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `${label}: horizontal overflow`);
    };
    for (const route of ['', '#/hash-lab', '#/chain-lab']) {
      await page.goto(`${base}/${route}`);
      await page.getByRole('main').waitFor();
      if (route) await page.getByRole('button', { name: 'Back to simulator', exact: true }).waitFor();
      const view = await page.getByRole('main').getAttribute('aria-label');
      await page.getByRole('link', { name: 'Skip to content', exact: true }).focus();
      await page.keyboard.press('Enter');
      assert.equal(await page.evaluate(() => document.activeElement.id), 'workbench');
      assert.equal(await page.getByRole('main').getAttribute('aria-label'), view);
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
  console.log('Quality: WCAG A/AA axe checks in both themes, 360px/desktop, skip link, dialog focus return and shortcut preference passed');
} finally { await browser?.close(); server?.kill(); }
