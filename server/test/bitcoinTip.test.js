import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { createTipTracker, isRound, TIP_API, TIP_POLL_MS } from '../src/bitcoinTip.js';
import { ROUND_A, ROUND_B, ROUND_C } from './helpers.js';

const API = 'https://tip.example.test/api';

/**
 * A fake block explorer: answers /blocks/tip/height and /blocks/tip/hash from `chain.tip`,
 * or fails as `chain.fail` says. No network.
 */
function fakeExplorer(tip = ROUND_A) {
  const chain = { tip, fail: null, calls: [] };
  const fetchImpl = async (url, options) => {
    chain.calls.push({ url, options });
    if (chain.fail === 'throw') throw new Error('synthetic network failure');
    if (chain.fail === 'status') return { ok: false, status: 503, text: async () => 'busy' };
    const body = url === `${API}/blocks/tip/height`
      ? `${chain.tip.height}\n`
      : url === `${API}/blocks/tip/hash`
        ? `${chain.tip.hash}\n`
        : null;
    if (body === null) return { ok: false, status: 404, text: async () => 'not found' };
    return { ok: true, status: 200, text: async () => body };
  };
  return { chain, fetchImpl };
}

function tracker(tip) {
  const lines = [];
  const explorer = fakeExplorer(tip);
  const t = createTipTracker({ fetchImpl: explorer.fetchImpl, api: API, log: (line) => lines.push(line) });
  return { t, chain: explorer.chain, lines };
}

const flush = () => new Promise((resolve) => setImmediate(resolve));

describe('isRound', () => {
  test('accepts a safe non-negative height and a 64-character lowercase hex hash', () => {
    assert.equal(isRound(ROUND_A), true);
    assert.equal(isRound({ height: 0, hash: 'f'.repeat(64) }), true);
  });

  test('refuses anything else', () => {
    for (const bad of [
      null,
      undefined,
      {},
      { height: -1, hash: ROUND_A.hash },
      { height: 1.5, hash: ROUND_A.hash },
      { height: '900001', hash: ROUND_A.hash },
      { height: Number.MAX_SAFE_INTEGER + 1, hash: ROUND_A.hash },
      { height: Number.NaN, hash: ROUND_A.hash },
      { height: 1, hash: ROUND_A.hash.toUpperCase() },
      { height: 1, hash: ROUND_A.hash.slice(1) },
      { height: 1, hash: `${ROUND_A.hash}0` },
      { height: 1, hash: 42 },
    ]) {
      assert.equal(isRound(bad), false, JSON.stringify(bad));
    }
  });
});

describe('createTipTracker', () => {
  test('defaults to mempool.space once a minute', () => {
    assert.equal(TIP_API, 'https://mempool.space/api');
    assert.equal(TIP_POLL_MS, 60_000);
  });

  test('knows no round and accepts nothing before the first poll', () => {
    const { t } = tracker();
    assert.equal(t.round(), null);
    assert.equal(t.accepts(ROUND_A), false);
  });

  test('a new tip becomes the round; the height and hash endpoints are read with a timeout', async () => {
    const { t, chain, lines } = tracker(ROUND_A);
    await t.poll();
    assert.deepEqual(t.round(), ROUND_A);
    assert.equal(t.accepts(ROUND_A), true);
    assert.equal(t.accepts({ ...ROUND_A }), true, 'compared by value');
    assert.deepEqual(chain.calls.map((c) => c.url), [`${API}/blocks/tip/height`, `${API}/blocks/tip/hash`]);
    for (const call of chain.calls) assert.ok(call.options.signal instanceof AbortSignal);
    assert.deepEqual(lines, []);
  });

  test('the previous tip is still accepted; two tips back is refused', async () => {
    const { t, chain } = tracker(ROUND_A);
    await t.poll();
    chain.tip = ROUND_B;
    await t.poll();
    assert.deepEqual(t.round(), ROUND_B);
    assert.equal(t.accepts(ROUND_B), true);
    assert.equal(t.accepts(ROUND_A), true, 'previous round');

    chain.tip = ROUND_C;
    await t.poll();
    assert.deepEqual(t.round(), ROUND_C);
    assert.equal(t.accepts(ROUND_C), true);
    assert.equal(t.accepts(ROUND_B), true);
    assert.equal(t.accepts(ROUND_A), false, 'two tips back');
  });

  test('a round must match height and hash and be well formed', async () => {
    const { t } = tracker(ROUND_A);
    await t.poll();
    assert.equal(t.accepts({ height: ROUND_A.height + 1, hash: ROUND_A.hash }), false);
    assert.equal(t.accepts({ height: ROUND_A.height, hash: ROUND_B.hash }), false);
    assert.equal(t.accepts({ height: ROUND_A.height, hash: ROUND_A.hash.toUpperCase() }), false);
    assert.equal(t.accepts(null), false);
  });

  test('a reorganisation at the same height replaces the current tip and keeps the previous one', async () => {
    const { t, chain } = tracker(ROUND_A);
    await t.poll();
    chain.tip = ROUND_B;
    await t.poll();
    const rival = { height: ROUND_B.height, hash: `${'0'.repeat(20)}${'e'.repeat(44)}` };
    chain.tip = rival;
    await t.poll();
    assert.deepEqual(t.round(), rival);
    assert.equal(t.accepts(rival), true);
    assert.equal(t.accepts(ROUND_B), false, 'the replaced block is gone');
    assert.equal(t.accepts(ROUND_A), true, 'the previous round is kept');
  });

  test('the same tip again or an older tip changes nothing', async () => {
    const { t, chain } = tracker(ROUND_A);
    await t.poll();
    chain.tip = ROUND_B;
    await t.poll();
    await t.poll();
    chain.tip = ROUND_A;
    await t.poll();
    assert.deepEqual(t.round(), ROUND_B);
    assert.equal(t.accepts(ROUND_A), true);
    assert.equal(t.accepts(ROUND_B), true);
  });

  test('a fetch error or an error status is logged and keeps the state', async () => {
    const { t, chain, lines } = tracker(ROUND_A);
    await t.poll();
    chain.tip = ROUND_B;
    await t.poll();

    chain.fail = 'throw';
    chain.tip = ROUND_C;
    await t.poll();
    chain.fail = 'status';
    await t.poll();
    assert.deepEqual(lines, [
      'bitcoin tip unavailable: synthetic network failure',
      'bitcoin tip unavailable: /blocks/tip/height answered 503',
    ]);
    assert.deepEqual(t.round(), ROUND_B);
    assert.equal(t.accepts(ROUND_A), true);
    assert.equal(t.accepts(ROUND_C), false);

    chain.fail = null;
    await t.poll();
    assert.deepEqual(t.round(), ROUND_C, 'recovers on the next good answer');
  });

  test('a fetch error before the first tip leaves no round', async () => {
    const { t, chain, lines } = tracker(ROUND_A);
    chain.fail = 'throw';
    await t.poll();
    assert.equal(t.round(), null);
    assert.equal(lines.length, 1);
  });

  test('an empty height before the first tip is not read as height 0', async () => {
    const { t, chain, lines } = tracker({ height: '', hash: ROUND_A.hash });
    await t.poll();
    assert.equal(t.round(), null);
    assert.deepEqual(lines, ['bitcoin tip unavailable: unreadable tip']);
    chain.tip = ROUND_A;
    await t.poll();
    assert.deepEqual(t.round(), ROUND_A);
  });

  test('an unreadable answer is logged and keeps the state', async () => {
    const { t, chain, lines } = tracker(ROUND_A);
    await t.poll();
    for (const bad of [
      { height: 'not-a-height', hash: ROUND_B.hash },
      { height: ROUND_B.height, hash: 'not-a-hash' },
      { height: ROUND_B.height, hash: ROUND_B.hash.toUpperCase() },
      { height: -5, hash: ROUND_B.hash },
      { height: 1.5, hash: ROUND_B.hash },
      { height: '', hash: ROUND_B.hash },
    ]) {
      chain.tip = bad;
      lines.length = 0;
      await t.poll();
      assert.deepEqual(lines, ['bitcoin tip unavailable: unreadable tip'], JSON.stringify(bad));
      assert.deepEqual(t.round(), ROUND_A, JSON.stringify(bad));
    }
  });

  test('start polls at once and then every pollMs; stop ends polling', async (t) => {
    t.mock.timers.enable({ apis: ['setInterval'] });
    const explorer = fakeExplorer(ROUND_A);
    const tip = createTipTracker({ fetchImpl: explorer.fetchImpl, api: API, pollMs: 5000 });
    tip.start();
    await flush();
    assert.deepEqual(tip.round(), ROUND_A);
    assert.equal(explorer.chain.calls.length, 2);

    explorer.chain.tip = ROUND_B;
    t.mock.timers.tick(5000);
    await flush();
    assert.deepEqual(tip.round(), ROUND_B);
    assert.equal(explorer.chain.calls.length, 4);

    tip.stop();
    explorer.chain.tip = ROUND_C;
    t.mock.timers.tick(20_000);
    await flush();
    assert.deepEqual(tip.round(), ROUND_B);
    assert.equal(explorer.chain.calls.length, 4);
  });
});
