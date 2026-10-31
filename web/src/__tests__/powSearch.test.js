import { afterEach, describe, expect, it, vi } from 'vitest';
import SHA256 from 'crypto-js/sha256.js';
import CryptoJS from 'crypto-js/core.js';
import { createHasher, hashAt, runSearch, search } from '../lib/powSearch';
import { createTrial, findNonce } from '../lib/hashLab';
import { blockTrial, remineBlock, sampleChain } from '../lib/chainLab';

afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });
const noWait = async () => {};
const plain = (prefix, nonce, suffix = '') => SHA256(prefix + nonce + suffix).toString();
// Synthetic ~1.6 KB header: spans many 64-byte SHA-256 blocks, like a full candidate.
const LONG_PREFIX = 'synthetic-previous-hash' + 'é{"tx":"synthetic transfer"}'.repeat(56);
const NEVER = '0'.repeat(64);

describe('midstate hashing', () => {
  it('equals plain SHA-256 for 1,000 nonces with and without a suffix', () => {
    expect(LONG_PREFIX.length).toBeGreaterThan(1500);
    const bare = createHasher(LONG_PREFIX);
    const wrapped = createHasher(LONG_PREFIX, '}');
    for (let nonce = 0; nonce < 1000; nonce++) {
      const n = nonce * 7919 + 1;
      expect(bare(n)).toBe(plain(LONG_PREFIX, n));
      expect(wrapped(n)).toBe(plain(LONG_PREFIX, n, '}'));
    }
    expect(createHasher('', '')(0)).toBe(plain('', 0));
    expect(createHasher(LONG_PREFIX)(Number.MAX_SAFE_INTEGER)).toBe(plain(LONG_PREFIX, Number.MAX_SAFE_INTEGER));
    expect(hashAt({ prefix: 'abc', suffix: '}' }, 42)).toBe(plain('abc', 42, '}'));
    expect(hashAt({ prefix: 'abc' }, 42)).toBe(plain('abc', 42));
  });
});

describe('round-robin search', () => {
  it('preserves rare zero peaks through throttled frames and resets only after delivery', async () => {
    let attempt = 0;
    vi.spyOn(CryptoJS.algo.SHA256, 'finalize').mockImplementation(() => ({ toString: () => ++attempt === 1 ? `000a${'f'.repeat(60)}` : 'f'.repeat(64) }));
    const frames = [];
    await search({ entrants: [{ id: 'synthetic-miner', prefix: 'synthetic-header' }], target: NEVER,
      limit: 300, batch: 100, yieldControl: noWait, onProgress: progress => {
        frames.push(progress);
        return progress.attempts >= 200;
      } });
    expect(frames.map(frame => frame.entrants['synthetic-miner'].peakZeros)).toEqual([3, 3, 0]);
    expect(frames.every(frame => frame.entrants['synthetic-miner'].zeros === 0)).toBe(true);
    expect(frames[0].recent.every(item => item.hash.startsWith('f'))).toBe(true);
  });

  it('gives each entrant `weight` consecutive nonces per round', async () => {
    const seen = [];
    const result = await search({ entrants: [{ id: 'heavy', weight: 3, prefix: 'h' }, { id: 'light', prefix: 'l', startNonce: 50 }],
      target: NEVER, limit: 4001, batch: 100, yieldControl: noWait,
      onProgress: progress => seen.push(progress) });
    expect(result.status).toBe('exhausted');
    expect(result.attempts).toBe(4001);
    const { heavy, light } = result.entrants;
    expect(heavy.attempts + light.attempts).toBe(4001);
    // Within one round of an exact 3:1 split.
    expect(Math.abs(heavy.attempts - 3 * light.attempts)).toBeLessThanOrEqual(3);
    expect(heavy.nonce).toBe(heavy.attempts - 1);
    expect(light.nonce).toBe(50 + light.attempts - 1);
    for (const progress of seen) {
      expect(Math.abs(progress.entrants.heavy.attempts - 3 * progress.entrants.light.attempts)).toBeLessThanOrEqual(3);
    }
    expect(seen).toHaveLength(40);
    expect(seen[0].recent).toHaveLength(20);
    expect(seen[0].recent.at(-1)).toEqual({ id: 'light', nonce: 74, hash: plain('l', 74) });
  });

  it('finds the first match in round order with the right winner, nonce and hash', async () => {
    const entrants = [{ id: 'a', weight: 2, prefix: 'synthetic-a|', startNonce: 7 }, { id: 'b', prefix: 'synthetic-b|', suffix: '}' }];
    // Independent replay of the expected order: a, a, b, a, a, b, ...
    const next = { a: 7, b: 0 };
    let expected;
    for (let attempts = 1; !expected; attempts++) {
      const position = (attempts - 1) % 3;
      const entrant = position < 2 ? entrants[0] : entrants[1];
      const nonce = next[entrant.id]++;
      const hash = plain(entrant.prefix, nonce, entrant.suffix);
      if (hash.startsWith('00')) expected = { winner: entrant.id, nonce, hash, attempts };
    }
    const result = await search({ entrants, target: '00', yieldControl: noWait });
    expect(result).toMatchObject({ status: 'found', ...expected });
    expect(result.entrants[expected.winner]).toMatchObject({ nonce: expected.nonce, hash: expected.hash, zeros: expect.any(Number) });
    expect(result.entrants[expected.winner].zeros).toBeGreaterThanOrEqual(2);
    expect(await runSearch({ entrants, target: '00', yieldControl: noWait }, { mode: 'inline' })).toEqual(result);
  });

  it('yields before the first attempt, so an early stop does no work', async () => {
    const controller = new AbortController();
    const finalize = vi.spyOn(CryptoJS.algo.SHA256, 'finalize');
    const result = await search({ entrants: [{ id: 'only', prefix: 'x' }], target: '', signal: controller.signal,
      yieldControl: async () => controller.abort() });
    expect(result).toMatchObject({ status: 'stopped', attempts: 0, winner: null });
    expect(finalize).not.toHaveBeenCalled();
  });

  it('stops mid-batch on abort and makes no further attempts', async () => {
    const controller = new AbortController();
    const original = CryptoJS.algo.SHA256.finalize;
    let calls = 0;
    const finalize = vi.spyOn(CryptoJS.algo.SHA256, 'finalize').mockImplementation(function (...args) {
      if (++calls === 150) controller.abort();
      return original.apply(this, args);
    });
    const yields = vi.fn(noWait);
    const result = await search({ entrants: [{ id: 'a', weight: 3, prefix: 'a' }, { id: 'b', prefix: 'b' }],
      target: NEVER, signal: controller.signal, yieldControl: yields });
    expect(result.status).toBe('stopped');
    expect(result.attempts).toBe(150);
    expect(finalize).toHaveBeenCalledTimes(150);
    expect(yields).toHaveBeenCalledTimes(2); // before work and after the first batch only
  });

  it('reports exhaustion at its limit and never steps past the last safe nonce', async () => {
    const limited = await search({ entrants: [{ id: 'a', prefix: 'a' }], target: NEVER, limit: 250, yieldControl: noWait });
    expect(limited).toMatchObject({ status: 'exhausted', attempts: 250, winner: null });
    expect(limited.entrants.a.nonce).toBe(249);
    const edge = await search({ entrants: [{ id: 'a', prefix: 'a', startNonce: Number.MAX_SAFE_INTEGER - 1 }, { id: 'b', prefix: 'b', startNonce: Number.MAX_SAFE_INTEGER }],
      target: NEVER, yieldControl: noWait });
    expect(edge).toMatchObject({ status: 'exhausted', attempts: 3 });
    expect(edge.entrants.a).toMatchObject({ nonce: Number.MAX_SAFE_INTEGER, attempts: 2 });
    expect(edge.entrants.b).toMatchObject({ nonce: Number.MAX_SAFE_INTEGER, attempts: 1 });
  });

  it('rejects malformed searches', async () => {
    await expect(search({ entrants: [], target: '0' })).rejects.toThrow(RangeError);
    await expect(search({ entrants: [{ id: 'a', prefix: 'a' }], target: '0a' })).rejects.toThrow(RangeError);
    await expect(search({ entrants: [{ id: 'a', prefix: 'a', weight: 0 }], target: '0' })).rejects.toThrow(RangeError);
    await expect(search({ entrants: [{ id: 'a', prefix: 'a', startNonce: -1 }], target: '0' })).rejects.toThrow(RangeError);
    expect(() => runSearch({ entrants: [{ id: 'a', prefix: 'a' }], target: '0' }, { mode: 'thread' })).toThrow(RangeError);
  });
});

describe('worker adapter', () => {
  class FakeWorker {
    static last = null;
    constructor(url, options) { Object.assign(this, { url: String(url), options, sent: [], terminated: false }); FakeWorker.last = this; }
    postMessage(message) { this.sent.push(message); }
    terminate() { this.terminated = true; }
    emit(data) { this.onmessage({ data }); }
  }
  const options = { entrants: [{ id: 'a', prefix: 'a' }], target: '00' };

  it('auto mode stays inline under test even when Worker exists', async () => {
    vi.stubGlobal('Worker', FakeWorker);
    FakeWorker.last = null;
    const result = await runSearch({ ...options, yieldControl: noWait });
    expect(result.status).toBe('found');
    expect(FakeWorker.last).toBeNull();
  });

  it('posts only data, relays progress and resolves with the worker result', async () => {
    vi.stubGlobal('Worker', FakeWorker);
    const progress = vi.fn();
    const pending = runSearch({ ...options, onProgress: progress }, { mode: 'worker' });
    const worker = FakeWorker.last;
    expect(worker.options).toEqual({ type: 'module' });
    expect(worker.url).toMatch(/powSearch\.worker\.js/);
    expect(worker.sent).toEqual([{ entrants: options.entrants, target: '00', limit: undefined, batch: undefined }]);
    expect(() => structuredClone(worker.sent[0])).not.toThrow();
    const update = { attempts: 100, entrants: { a: { nonce: 99, hash: 'f', attempts: 100, zeros: 0 } }, recent: [] };
    worker.emit({ type: 'progress', progress: update });
    expect(progress).toHaveBeenCalledWith(update);
    const result = { status: 'found', winner: 'a', nonce: 120, hash: '00ab', attempts: 121, entrants: {} };
    worker.emit({ type: 'result', result });
    expect(await pending).toEqual(result);
    expect(worker.terminated).toBe(true);
  });

  it('abort terminates the worker and resolves stopped', async () => {
    vi.stubGlobal('Worker', FakeWorker);
    const controller = new AbortController();
    const pending = runSearch({ ...options, signal: controller.signal }, { mode: 'worker' });
    const worker = FakeWorker.last;
    worker.emit({ type: 'progress', progress: { attempts: 300, entrants: { a: { nonce: 299, hash: 'f', attempts: 300, zeros: 0 } }, recent: [] } });
    controller.abort();
    expect(worker.terminated).toBe(true);
    expect(await pending).toMatchObject({ status: 'stopped', winner: null, attempts: 300 });
    worker.emit({ type: 'result', result: { status: 'found' } });
  });

  it.each(['round-robin', 'weighted-random'])('the real worker module runs %s and paces its messages', async scheduling => {
    const posted = [];
    vi.stubGlobal('self', { postMessage: message => posted.push(message) });
    vi.resetModules();
    await import('../lib/powSearch.worker.js');
    await self.onmessage({ data: { entrants: [{ id: 'a', prefix: 'synthetic-a|', startNonce: 7 }, { id: 'b', prefix: 'synthetic-b|', suffix: '}' }], target: '00', scheduling, seed: 123456789 } });
    const final = posted.at(-1);
    expect(final.type).toBe('result');
    expect(final.result).toEqual(await search({ entrants: [{ id: 'a', prefix: 'synthetic-a|', startNonce: 7 }, { id: 'b', prefix: 'synthetic-b|', suffix: '}' }],
      target: '00', scheduling, seed: 123456789, yieldControl: noWait }));
    expect(posted.filter(message => message.type === 'progress').length).toBeLessThanOrEqual(Math.ceil(final.result.attempts / 100));
  });
});

describe('bounded lab adapters', () => {
  it('findNonce results equal createTrial for the found and last nonces', async () => {
    for (const message of ['Synthetic block', 'café 🧪', '"nonce":1}']) {
      const result = await findNonce({ message, startNonce: 3, difficulty: 2, yieldControl: noWait });
      expect(result.status).toBe('found');
      expect(result.trial).toEqual(createTrial(message, result.trial.nonce, 2));
      expect(result.attempts).toBe(result.trial.nonce - 3 + 1);
    }
    const controller = new AbortController();
    const stopped = await findNonce({ message: 'Synthetic block', startNonce: 0, difficulty: 3, signal: controller.signal,
      yieldControl: noWait, onProgress: ({ trial }) => { expect(trial).toEqual(createTrial('Synthetic block', trial.nonce, 3)); controller.abort(); } });
    expect(stopped.trial).toEqual(createTrial('Synthetic block', 99, 3));
  });

  it('remineBlock results equal blockTrial for the found nonce', async () => {
    const blocks = sampleChain().map((block, index) => index === 1 ? { ...block, data: 'Synthetic edited record.' } : block);
    for (const index of [0, 1, 2]) {
      const result = await remineBlock(blocks, index, { yieldControl: noWait });
      expect(result.status).toBe('found');
      expect(result.block.hash).toBe(blockTrial(result.block).hash);
      expect(result.attempts).toBe(result.block.nonce + 1);
      expect(Object.keys(result.block)).toEqual(Object.keys(blocks[index]));
    }
  });
});

describe('per-attempt weighted allocation for easy targets', () => {
  it('keeps nonce cursors and reproduces a seeded allocation without first-entrant batches', async () => {
    const options = { entrants: [{ id: 'first', weight: 25, prefix: 'synthetic-first|' },
      { id: 'second', weight: 75, prefix: 'synthetic-second|', startNonce: 50 }],
    scheduling: 'weighted-random', seed: 123456789, target: NEVER, limit: 4000, yieldControl: noWait };
    const result = await search(options);
    expect(await search(options)).toEqual(result);
    expect(result.entrants.first.attempts).toBeGreaterThan(850);
    expect(result.entrants.first.attempts).toBeLessThan(1150);
    expect(result.entrants.first.nonce).toBe(result.entrants.first.attempts - 1);
    expect(result.entrants.second.nonce).toBe(result.entrants.second.attempts + 49);
  });

  it.each([1, 10, 50, 90, 99])('does not turn %i%% into a first-position batch advantage', async power => {
    // Independent synthetic headers/nonces, fixed scheduling seeds. Broad bounds
    // test the mechanism, not whether one twelve-block experiment matches a ratio.
    let wins = 0;
    const trials = 400;
    for (let index = 0; index < trials; index++) {
      const result = await search({ entrants: [{ id: 'first', weight: power, prefix: `synthetic-a-${index}|`, startNonce: index * 100 },
        { id: 'second', weight: 100 - power, prefix: `synthetic-b-${index}|`, startNonce: index * 100 }],
      scheduling: 'weighted-random', seed: index * 7919 + 17, target: '0', limit: 1000, yieldControl: noWait });
      expect(result.status).toBe('found');
      wins += Number(result.winner === 'first');
    }
    expect(Math.abs(wins / trials - power / 100)).toBeLessThan(0.08);
  });

  it('forwards scheduling to a worker and produces the same seeded proof', async () => {
    class AllocationWorker {
      constructor() { this.terminate = () => {}; }
      postMessage(options) { void search({ ...options, yieldControl: noWait })
        .then(result => this.onmessage({ data: { type: 'result', result } })); }
    }
    vi.stubGlobal('Worker', AllocationWorker);
    const options = { entrants: [{ id: 'a', weight: 1, prefix: 'synthetic-a|' }, { id: 'b', weight: 99, prefix: 'synthetic-b|' }],
      scheduling: 'weighted-random', seed: 15, target: '0' };
    expect(await runSearch(options, { mode: 'worker' })).toEqual(await search({ ...options, yieldControl: noWait }));
    await expect(search({ ...options, scheduling: 'unknown' })).rejects.toThrow(RangeError);
    for (const seed of [-1, 2 ** 32, 1.5]) await expect(search({ ...options, seed })).rejects.toThrow(RangeError);
  });
});
