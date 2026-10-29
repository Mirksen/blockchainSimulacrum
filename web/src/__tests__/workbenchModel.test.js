import { describe, expect, it } from 'vitest';
import { keyFiguresOf, rateOf, repairOf } from '../components/workbench/workbenchModel';

const status = list => list.map((s, index) => ({ index, status: s }));

describe('keyFiguresOf', () => {
  it('averages the times between mined blocks and names the next halving height', () => {
    // The genesis time is a fixed launch moment: the gap to block #1 does not count.
    const blocks = [{ timestamp: -9e9 }, { timestamp: 0 }, { timestamp: 2000 }, { timestamp: 6000 }];
    expect(keyFiguresOf({ blocks, difficulty: 2, blockReward: 50, halvingInterval: 2, targetSeconds: 10 })).toEqual({
      avgSeconds: 3, targetSeconds: 10, difficulty: 2, reward: 50, nextHalving: 4
    });
  });

  it('has no average before the first mined block', () => {
    const figures = keyFiguresOf({ blocks: [{ timestamp: 0 }], difficulty: 1, blockReward: 50, halvingInterval: 10, targetSeconds: 10 });
    expect(figures.avgSeconds).toBeNull();
    expect(figures.nextHalving).toBe(10);
  });
});

describe('repairOf', () => {
  it('is null for an intact chain', () => {
    expect(repairOf(status(['valid', 'valid']))).toBeNull();
  });

  it('re-mines the first broken block and every later one', () => {
    expect(repairOf(status(['valid', 'hash-mismatch', 'built-on-broken', 'built-on-broken']))).toEqual({
      next: 1, order: [1, 2, 3], undoOnly: false
    });
  });

  it('offers only undo when a forged signature would survive re-mining', () => {
    expect(repairOf(status(['valid', 'valid', 'signature-invalid', 'built-on-broken']))).toEqual({
      next: 2, order: [2], undoOnly: true
    });
  });
});

describe('rateOf', () => {
  it('turns attempts and elapsed time into hashes per second', () => {
    expect(rateOf({ iterations: 500, elapsedMs: 2000 })).toBe(250);
  });

  it('is undefined without a usable report', () => {
    expect(rateOf(undefined)).toBeUndefined();
    expect(rateOf({ iterations: 0, elapsedMs: 100 })).toBeUndefined();
    expect(rateOf({ iterations: 10, elapsedMs: 0 })).toBeUndefined();
  });
});
