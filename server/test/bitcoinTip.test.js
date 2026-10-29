import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { createTipTracker, isRound, TIP_API, TIP_POLL_MS, WINDOW_BLOCKS } from '../src/bitcoinTip.js';

const API = 'https://tip.example.test/api';
const TOP = 900200;
const hashOf = (height, salt = 'a') => `${'0'.repeat(20)}${salt}${height.toString(16).padStart(43, '0')}`;

/**
 * A fake block explorer with mempool.space's /v1/blocks[/:start] pages: up to 15
 * blocks, newest first. `chain.top` is the tip, `chain.salt` per height can mark a
 * reorganisation, `chain.fail` breaks the answer. No network.
 */
function fakeExplorer() {
  const chain = { top: TOP, salt: {}, fail: null, calls: [] };
  const fetchImpl = async (url, options) => {
    chain.calls.push({ url, options });
    if (chain.fail === 'throw') throw new Error('synthetic network failure');
    if (chain.fail === 'status') return { ok: false, status: 503, json: async () => ({}) };
    if (chain.fail === 'garbage') return { ok: true, status: 200, json: async () => [{ height: 'x', id: 'nope' }] };
    if (chain.fail === 'empty') return { ok: true, status: 200, json: async () => [] };
    const match = /\/v1\/blocks(?:\/(\d+))?$/.exec(url);
    if (!match) return { ok: false, status: 404, json: async () => ({}) };
    const start = match[1] === undefined ? chain.top : Math.min(Number(match[1]), chain.top);
    const blocks = [];
    for (let height = start; height > start - 15 && height >= 0; height -= 1) {
      blocks.push({ height, id: hashOf(height, chain.salt[height]), timestamp: height });
    }
    return { ok: true, status: 200, json: async () => blocks };
  };
  return { chain, fetchImpl };
}

function tracker(options = {}) {
  const lines = [];
  const explorer = fakeExplorer();
  const t = createTipTracker({ fetchImpl: explorer.fetchImpl, api: API, log: (line) => lines.push(line), ...options });
  return { t, chain: explorer.chain, lines };
}

describe('isRound', () => {
  test('accepts a safe non-negative height and a 64-character lowercase hex hash', () => {
    assert.equal(isRound({ height: 0, hash: hashOf(1) }), true);
  });
  test('refuses anything else', () => {
    for (const bad of [null, {}, { height: -1, hash: hashOf(1) }, { height: 1.5, hash: hashOf(1) }, { height: '1', hash: hashOf(1) },
      { height: 1, hash: hashOf(1).toUpperCase() }, { height: 1, hash: 'ab' }]) {
      assert.equal(isRound(bad), false, JSON.stringify(bad));
    }
  });
});

describe('createTipTracker', () => {
  test('defaults to mempool.space once a minute with a window of 144 blocks', () => {
    assert.equal(TIP_API, 'https://mempool.space/api');
    assert.equal(TIP_POLL_MS, 60_000);
    assert.equal(WINDOW_BLOCKS, 144);
  });

  test('knows no round and accepts nothing before the first poll', () => {
    const { t } = tracker();
    assert.equal(t.round(), null);
    assert.equal(t.windowStart(), null);
    assert.equal(t.accepts({ height: TOP, hash: hashOf(TOP) }), false);
  });

  test('the first poll reads the tip and fills the whole window page by page', async () => {
    const { t, chain } = tracker();
    await t.poll();
    assert.deepEqual(t.round(), { height: TOP, hash: hashOf(TOP) });
    assert.equal(t.windowStart(), TOP - 143);
    assert.equal(t.accepts({ height: TOP - 143, hash: hashOf(TOP - 143) }), true, 'the oldest block of the window');
    assert.equal(t.accepts({ height: TOP - 144, hash: hashOf(TOP - 144) }), false, 'one block older');
    assert.equal(chain.calls.length, Math.ceil(144 / 15), 'ten pages of 15 blocks');
    assert.ok(chain.calls.every((call) => call.options?.signal), 'every request has a timeout signal');
  });

  test('a new block moves the window and needs one request', async () => {
    const { t, chain } = tracker();
    await t.poll();
    chain.top += 1;
    chain.calls.length = 0;
    await t.poll();
    assert.equal(chain.calls.length, 1);
    assert.deepEqual(t.round(), { height: TOP + 1, hash: hashOf(TOP + 1) });
    assert.equal(t.accepts({ height: TOP - 143, hash: hashOf(TOP - 143) }), false, 'fell out of the window');
    assert.equal(t.accepts({ height: TOP - 142, hash: hashOf(TOP - 142) }), true);
  });

  test('a block must match height and hash', async () => {
    const { t } = tracker();
    await t.poll();
    assert.equal(t.accepts({ height: TOP, hash: hashOf(TOP - 1) }), false);
    assert.equal(t.accepts({ height: TOP + 1, hash: hashOf(TOP + 1) }), false, 'not mined yet');
    assert.equal(t.accepts({ height: '900200', hash: hashOf(TOP) }), false);
  });

  test('a reorganisation replaces the hashes of the newest blocks', async () => {
    const { t, chain } = tracker();
    await t.poll();
    chain.salt[TOP] = 'b';
    chain.salt[TOP - 1] = 'b';
    await t.poll();
    assert.deepEqual(t.round(), { height: TOP, hash: hashOf(TOP, 'b') });
    assert.equal(t.accepts({ height: TOP, hash: hashOf(TOP) }), false);
    assert.equal(t.accepts({ height: TOP - 1, hash: hashOf(TOP - 1, 'b') }), true);
  });

  test('a short window keeps only that many blocks', async () => {
    const { t } = tracker({ windowBlocks: 6 });
    await t.poll();
    assert.equal(t.windowStart(), TOP - 5);
    assert.equal(t.accepts({ height: TOP - 6, hash: hashOf(TOP - 6) }), false);
  });

  for (const fail of ['throw', 'status', 'garbage', 'empty']) {
    test(`a failing answer (${fail}) is logged and keeps the state`, async () => {
      const { t, chain, lines } = tracker();
      await t.poll();
      chain.fail = fail;
      chain.top += 1;
      await t.poll();
      assert.equal(lines.length, 1, lines.join('\n'));
      assert.match(lines[0], /^bitcoin tip unavailable: /);
      assert.deepEqual(t.round(), { height: TOP, hash: hashOf(TOP) });
    });
  }

  test('a failure before the first tip leaves no round', async () => {
    const { t, chain } = tracker();
    chain.fail = 'throw';
    await t.poll();
    assert.equal(t.round(), null);
  });

  test('start polls at once and then every pollMs; stop ends polling', async (t) => {
    t.mock.timers.enable({ apis: ['setInterval'] });
    const { t: tip, chain } = tracker({ pollMs: 1000 });
    tip.start();
    await new Promise((resolve) => setImmediate(resolve));
    const first = chain.calls.length;
    assert.ok(first >= 1);
    chain.top += 1;
    t.mock.timers.tick(1000);
    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(chain.calls.length, first + 1);
    tip.stop();
    t.mock.timers.tick(5000);
    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(chain.calls.length, first + 1);
  });
});
