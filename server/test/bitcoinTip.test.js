import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { createTipTracker, isRound, TIP_API, TIP_POLL_MS, WINDOW_BLOCKS } from '../src/bitcoinTip.js';
import { blockProblem, headerHash, MIN_WORK_BITS, targetOf } from '../src/bitcoinHeader.js';

const API = 'https://tip.example.test/api';
const TOP = 900200;
const BASE = TOP - 400;
// Regtest difficulty: about every second nonce meets it, so a synthetic chain is cheap.
const EASY_BITS = 0x207fffff;
const MAINNET = JSON.parse(readFileSync(new URL('./fixtures/mainnet-blocks-973686-973700.json', import.meta.url), 'utf8'));
const someHash = (text) => createHash('sha256').update(text).digest('hex');

/** A block on `prev` whose header really hashes to its id below EASY_BITS. */
function mineBlock(height, prev, salt = 'a') {
  const block = {
    height, version: 0x20000000, previousblockhash: prev, merkle_root: someHash(`${height}${salt}`),
    timestamp: 1_700_000_000 + height, bits: EASY_BITS, nonce: 0,
  };
  for (; ; block.nonce += 1) {
    block.id = headerHash(block);
    if (BigInt(`0x${block.id}`) <= targetOf(EASY_BITS)) return block;
  }
}

/**
 * A fake block explorer with mempool.space's /v1/blocks[/:start] pages: up to 15
 * blocks, newest first, with real headers on easy bits. `chain.top` is the tip,
 * `chain.salt` per height forks the chain from there on (a reorganisation),
 * `chain.fail` breaks the answer. No network.
 */
function fakeExplorer() {
  const chain = { top: TOP, salt: {}, fail: null, calls: [] };
  let cache = { key: null, blocks: null };
  chain.blocks = () => {
    const key = JSON.stringify([chain.top, chain.salt]);
    if (cache.key !== key) {
      const blocks = new Map();
      let prev = someHash('below the synthetic chain');
      for (let height = BASE; height <= chain.top; height += 1) {
        const block = mineBlock(height, prev, chain.salt[height]);
        blocks.set(height, block);
        prev = block.id;
      }
      cache = { key, blocks };
    }
    return cache.blocks;
  };
  chain.hashAt = (height) => chain.blocks().get(height).id;
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
    for (let height = start; height > start - 15 && height >= BASE; height -= 1) blocks.push({ ...chain.blocks().get(height) });
    // A header field changed after mining: the id no longer is its hash.
    if (chain.fail === 'tampered') blocks[0].nonce += 1;
    // A valid block that is not the parent of the one above it.
    if (chain.fail === 'unlinked') blocks[1] = mineBlock(blocks[1].height, blocks[1].previousblockhash, 'other');
    return { ok: true, status: 200, json: async () => blocks };
  };
  return { chain, fetchImpl };
}

function tracker(options = {}) {
  const lines = [];
  const explorer = fakeExplorer();
  const t = createTipTracker({ fetchImpl: explorer.fetchImpl, api: API, minWorkBits: 0, log: (line) => lines.push(line), ...options });
  return { t, chain: explorer.chain, lines };
}

describe('bitcoin block headers', () => {
  test('real mainnet blocks hash to their ids and meet a target of at least 72 zero bits', () => {
    assert.equal(MIN_WORK_BITS, 72);
    for (const block of MAINNET) {
      assert.equal(headerHash(block), block.id, `block ${block.height}`);
      assert.equal(blockProblem(block), null, `block ${block.height}`);
    }
  });

  test('targetOf decodes compact bits', () => {
    assert.equal(targetOf(0x1d00ffff), 0xffffn << 208n, "the genesis block's target");
    assert.equal(targetOf(0x03123456), 0x123456n);
    assert.equal(targetOf(0x02123456), 0x1234n);
    assert.equal(targetOf(0x04923456), null, 'negative');
    assert.equal(targetOf(0x22123456), null, 'beyond 256 bits');
    assert.equal(targetOf(-1), null);
  });

  test('a changed header field, a wrong id or a hash above its target is refused', () => {
    const block = MAINNET[0];
    assert.equal(blockProblem({ ...block, nonce: block.nonce + 1 }), 'id is not the header hash');
    assert.equal(blockProblem({ ...block, merkle_root: someHash('another transaction set') }), 'id is not the header hash');
    assert.equal(blockProblem({ ...block, id: someHash('another id') }), 'id is not the header hash');
    // Claim a harder target than the hash meets, keeping the header consistent.
    let hard = { ...block, bits: 0x1600ffff };
    hard = { ...hard, id: headerHash(hard) };
    assert.equal(blockProblem(hard), 'hash above its target');
  });

  test('a block on an easy target is refused unless the work floor is lowered', () => {
    const easy = mineBlock(1, someHash('parent'));
    assert.equal(blockProblem(easy), 'too little work');
    assert.equal(blockProblem(easy, { minWorkBits: 0 }), null);
  });

  test('malformed fields are refused before hashing', () => {
    const block = MAINNET[0];
    for (const [field, value] of [['height', -1], ['id', 'ab'], ['previousblockhash', block.previousblockhash.toUpperCase()],
      ['merkle_root', 42], ['version', 2 ** 32], ['timestamp', 1.5], ['bits', '386007187'], ['nonce', -1]]) {
      assert.match(blockProblem({ ...block, [field]: value }), new RegExp(`^bad ${field}$`), field);
    }
    assert.equal(blockProblem(null), 'not a block');
  });

  test('the tracker accepts a real mainnet page with the default work floor', async () => {
    const fetchImpl = async () => ({ ok: true, status: 200, json: async () => MAINNET });
    const lines = [];
    const t = createTipTracker({ fetchImpl, api: API, windowBlocks: 15, log: (line) => lines.push(line) });
    await t.poll();
    assert.deepEqual(lines, []);
    assert.deepEqual(t.round(), { height: 973700, hash: MAINNET[0].id });
    assert.equal(t.accepts({ height: 973686, hash: MAINNET[14].id }), true);
  });

  test('the default work floor makes the tracker refuse a synthetic chain', async () => {
    const { t, lines } = tracker({ minWorkBits: undefined });
    await t.poll();
    assert.equal(t.round(), null);
    assert.match(lines[0], /too little work/);
  });
});

describe('isRound', () => {
  test('accepts a safe non-negative height and a 64-character lowercase hex hash', () => {
    assert.equal(isRound({ height: 0, hash: someHash('1') }), true);
  });
  test('refuses anything else', () => {
    const hash = someHash('1');
    for (const bad of [null, {}, { height: -1, hash }, { height: 1.5, hash }, { height: '1', hash },
      { height: 1, hash: hash.toUpperCase() }, { height: 1, hash: 'ab' }]) {
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
    assert.equal(t.accepts({ height: TOP, hash: someHash('any') }), false);
  });

  test('the first poll reads the tip and fills the whole window page by page', async () => {
    const { t, chain } = tracker();
    await t.poll();
    assert.deepEqual(t.round(), { height: TOP, hash: chain.hashAt(TOP) });
    assert.equal(t.windowStart(), TOP - 143);
    assert.equal(t.accepts({ height: TOP - 143, hash: chain.hashAt(TOP - 143) }), true, 'the oldest block of the window');
    assert.equal(t.accepts({ height: TOP - 144, hash: chain.hashAt(TOP - 144) }), false, 'one block older');
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
    assert.deepEqual(t.round(), { height: TOP + 1, hash: chain.hashAt(TOP + 1) });
    assert.equal(t.accepts({ height: TOP - 143, hash: chain.hashAt(TOP - 143) }), false, 'fell out of the window');
    assert.equal(t.accepts({ height: TOP - 142, hash: chain.hashAt(TOP - 142) }), true);
  });

  test('a block must match height and hash', async () => {
    const { t, chain } = tracker();
    await t.poll();
    assert.equal(t.accepts({ height: TOP, hash: chain.hashAt(TOP - 1) }), false);
    assert.equal(t.accepts({ height: TOP + 1, hash: chain.hashAt(TOP) }), false, 'not mined yet');
    assert.equal(t.accepts({ height: '900200', hash: chain.hashAt(TOP) }), false);
  });

  test('a reorganisation replaces the hashes of the newest blocks', async () => {
    const { t, chain } = tracker();
    await t.poll();
    const old = chain.hashAt(TOP);
    chain.salt[TOP - 1] = 'b';
    chain.calls.length = 0;
    await t.poll();
    assert.equal(chain.calls.length, 1, 'the newest page covers the fork');
    assert.deepEqual(t.round(), { height: TOP, hash: chain.hashAt(TOP) });
    assert.equal(t.accepts({ height: TOP, hash: old }), false);
    assert.equal(t.accepts({ height: TOP - 1, hash: chain.hashAt(TOP - 1) }), true);
  });

  test('a reorganisation deeper than one page drops the stale blocks and refetches them', async () => {
    const { t, chain, lines } = tracker();
    await t.poll();
    const stale = chain.hashAt(TOP - 20);
    chain.salt[TOP - 20] = 'b';
    await t.poll();
    assert.deepEqual(lines, []);
    assert.equal(t.accepts({ height: TOP - 20, hash: stale }), false, 'the stale block');
    assert.equal(t.accepts({ height: TOP - 20, hash: chain.hashAt(TOP - 20) }), true, 'its replacement');
    assert.equal(t.accepts({ height: TOP - 143, hash: chain.hashAt(TOP - 143) }), true, 'the unchanged oldest block');
  });

  test('a short window keeps only that many blocks', async () => {
    const { t, chain } = tracker({ windowBlocks: 6 });
    await t.poll();
    assert.equal(t.windowStart(), TOP - 5);
    assert.equal(t.accepts({ height: TOP - 6, hash: chain.hashAt(TOP - 6) }), false);
  });

  for (const [fail, reason] of [['throw', /network/], ['status', /503/], ['garbage', /bad height/], ['empty', /unreadable/],
    ['tampered', /id is not the header hash/], ['unlinked', /does not link/]]) {
    test(`a failing answer (${fail}) is logged and keeps the state`, async () => {
      const { t, chain, lines } = tracker();
      await t.poll();
      const tip = { height: TOP, hash: chain.hashAt(TOP) };
      chain.fail = fail;
      chain.top += 1;
      await t.poll();
      assert.equal(lines.length, 1, lines.join('\n'));
      assert.match(lines[0], /^bitcoin tip unavailable: /);
      assert.match(lines[0], reason);
      assert.deepEqual(t.round(), tip);
      assert.equal(t.accepts({ height: TOP + 1, hash: chain.hashAt(TOP + 1) }), false);
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
