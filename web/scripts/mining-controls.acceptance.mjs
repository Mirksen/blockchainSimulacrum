import assert from 'node:assert/strict';
import { join } from 'node:path';
import { menu, settle, workbench } from './workbench.helpers.mjs';

// Observe the real output graph, without replacing synthesis or relaxing autoplay.
async function observeAudio(page) {
  await page.addInitScript(() => {
    const NativeContext = globalThis.AudioContext;
    const connect = AudioNode.prototype.connect;
    const start = OscillatorNode.prototype.start;
    const meters = [];
    const audio = globalThis.__miningAudio = { contexts: [], starts: 0, peak: 0 };
    globalThis.AudioContext = class extends NativeContext {
      constructor(...args) { super(...args); audio.contexts.push(this); }
    };
    AudioNode.prototype.connect = function (destination, ...args) {
      const result = connect.call(this, destination, ...args);
      if (destination === this.context.destination) {
        const meter = this.context.createAnalyser();
        meter.fftSize = 512;
        connect.call(this, meter);
        meters.push(meter);
      }
      return result;
    };
    OscillatorNode.prototype.start = function (...args) { audio.starts++; return start.apply(this, args); };
    setInterval(() => {
      for (const meter of meters) {
        const samples = new Float32Array(meter.fftSize);
        meter.getFloatTimeDomainData(samples);
        for (const value of samples) audio.peak = Math.max(audio.peak, Math.abs(value));
      }
    }, 8);
  });
}
const audioSnapshot = page => page.evaluate(() => ({
  contexts: globalThis.__miningAudio.contexts.length,
  states: globalThis.__miningAudio.contexts.map(context => context.state),
  starts: globalThis.__miningAudio.starts, peak: globalThis.__miningAudio.peak
}));

export async function verifyMiningControlsAndSound(browser, baseURL, output) {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 }, reducedMotion: 'no-preference' });
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.route('https://api.proofofwork.fyi/**', route => route.abort('connectionrefused'));
  await page.route('https://eu.i.posthog.com/**', route => route.abort('connectionrefused'));
  await observeAudio(page);
  // Hold only the worker's script fetch. Releasing it runs the unchanged real
  // hasher and proof verification; UI actions happen before any lucky result.
  const waitForRequest = async gate => {
    let timer;
    try {
      await Promise.race([gate.request, new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error('Search did not request its worker')), 10000);
      })]);
    } finally { clearTimeout(timer); }
  };
  let nextGate, activeGate;
  const holdNextWorker = () => {
    let release, requested;
    const unblock = new Promise(resolve => { release = resolve; });
    const request = new Promise(resolve => { requested = resolve; });
    nextGate = { release, requested, unblock };
    return { release, request };
  };
  await page.route(/\/assets\/powSearch\.worker-[^/]+\.js(?:\?.*)?$/, async route => {
    if (nextGate) {
      const gate = nextGate;
      nextGate = null;
      activeGate = gate;
      gate.requested();
      await gate.unblock;
      activeGate = null;
    }
    if (!page.isClosed()) await route.continue();
  });
  try {
    await page.goto(baseURL);
    const wb = workbench(page);
    await wb.tile(0).waitFor();
    assert.equal((await audioSnapshot(page)).contexts, 0, 'Loading the page creates no audio context');
    await page.getByRole('button', { name: 'More', exact: true }).click();
    const sound = () => page.getByRole('button', { name: /^Sound/ });
    assert.equal(await sound().getAttribute('aria-pressed'), 'true', 'Sound starts on');
    await page.keyboard.press('Escape');

    const repeat = () => page.getByRole('button', { name: 'Auto-mine', exact: true });
    const delayed = holdNextWorker();
    await repeat().click();
    await page.getByRole('button', { name: 'Pause', exact: true }).waitFor();
    await waitForRequest(delayed);
    await page.screenshot({ path: join(output, 'mining-repeat-active.png') });
    await repeat().click();
    assert.equal(await repeat().getAttribute('aria-pressed'), 'false');
    assert.equal(await page.getByRole('button', { name: 'Pause', exact: true }).isVisible(), true, 'Repeat off keeps the current search running');
    assert.equal(await wb.tiles().count(), 1);
    delayed.release();
    await wb.mine(2).waitFor({ timeout: 30000 });
    await page.waitForTimeout(2200);
    assert.equal(await wb.tiles().count(), 2, 'Only the current automatic block finishes, including from Genesis');
    assert.equal(page.workers().length, 0, 'No further search starts');
    const audible = await audioSnapshot(page);
    assert.equal(audible.contexts, 1);
    assert.deepEqual(audible.states, ['running']);
    assert.ok(audible.starts > 0 && audible.peak > 0.001, JSON.stringify(audible));
    assert.ok(audible.peak < 0.5, 'The cue retains output headroom');
    await page.screenshot({ path: join(output, 'automine-finish-current.png') });

    const mutedRun = holdNextWorker();
    await wb.mine(2).click();
    await waitForRequest(mutedRun);
    await page.getByRole('button', { name: 'More', exact: true }).click();
    await sound().click();
    assert.equal(await sound().getAttribute('aria-pressed'), 'false');
    await page.keyboard.press('Escape');
    mutedRun.release();
    await wb.mine(3).waitFor({ timeout: 30000 });
    await page.waitForTimeout(800);
    assert.equal((await audioSnapshot(page)).starts, audible.starts, 'Muting during a search silences its result');

    const enabledRun = holdNextWorker();
    await wb.mine(3).click();
    await waitForRequest(enabledRun);
    await page.getByRole('button', { name: 'More', exact: true }).click();
    await sound().click();
    assert.equal(await sound().getAttribute('aria-pressed'), 'true');
    await page.keyboard.press('Escape');
    enabledRun.release();
    await wb.mine(4).waitFor({ timeout: 30000 });
    await page.waitForTimeout(800);
    const enabled = await audioSnapshot(page);
    assert.equal(enabled.contexts, 1, 'Later results reuse the gesture-unlocked context');
    assert.ok(enabled.starts > audible.starts, 'Re-enabling during a search sounds its result');
    const transact = page.getByRole('button', { name: 'Auto-transact', exact: true });
    assert.equal(await transact.getAttribute('aria-pressed'), 'false');
    assert.match(await transact.getAttribute('title'), /empty mempool/);
    await transact.click();
    const pending = page.locator('.mempool-card-tx:not(.is-coinbase)');
    await pending.first().waitFor();
    const pendingCount = await pending.count();
    await transact.click();
    await page.waitForTimeout(1100);
    assert.equal(await pending.count(), pendingCount, 'Turning off Auto-transact keeps existing transfers');
    assert.equal(await repeat().getAttribute('aria-pressed'), 'false', 'Auto-transact does not enable mining');
    for (const theme of ['dark', 'light']) {
      if (await page.locator('html').getAttribute('data-theme') !== theme) await menu(page, theme === 'light' ? 'Light theme' : 'Dark theme');
      for (const width of [320, 390, 768, 1440]) {
        await page.setViewportSize({ width, height: 1000 });
        await settle(page);
        const bounds = await page.evaluate(() => ({ width: innerWidth, scroll: document.documentElement.scrollWidth }));
        assert.ok(bounds.scroll <= bounds.width, JSON.stringify(bounds));
        const card = await page.getByRole('region', { name: 'Mempool', exact: true }).boundingBox();
        for (const button of [transact, page.getByRole('button', { name: 'New transaction', exact: true })]) {
          const box = await button.boundingBox();
          assert.ok(box && card && box.x >= card.x && box.x + box.width <= card.x + card.width, JSON.stringify({ width, box, card }));
        }
        await page.screenshot({ path: join(output, `mining-controls-${theme}-${width}.png`), fullPage: true });
      }
    }
    assert.deepEqual(errors, []);
    return [`Mining controls: Repeat off finishes the active block and starts no next block; real browser audio is running, peak ${audible.peak.toFixed(4)}; mid-search mute/unmute applies and one context is reused`];
  } finally {
    nextGate?.release();
    activeGate?.release();
    await page.close();
  }
}
