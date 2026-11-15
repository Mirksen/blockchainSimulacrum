import { describe, expect, it } from 'vitest';
import { chainEventsOf, keyFiguresOf, repairOf } from '../components/workbench/workbenchModel';

const status = list => list.map((s, index) => ({ index, status: s }));

// Synthetic chain at height 25: blocks #1–#20 every 6 s (fast), then #21–#25 at 13.8 s
// on average; the reward halves every 4 blocks from 3.125, so #24 paid 0.048828125. The
// check at #20 raised the difficulty from 5 to 6 and is recorded on that block.
const chain = (height = 25) => [{ time: -9e6, difficulty: 0 },
  ...Array.from({ length: height }, (_, i) => {
    const index = i + 1;
    const time = index <= 20 ? index * 6 : 120 + [14, 27, 41, 55, 69][index - 21];
    return { time, difficulty: index <= 2 ? 4 : index <= 20 ? 5 : 6, subsidy: index < 24 ? 9765625 : 4882812, halved: index === 24,
      retarget: index === 20 && height > 20 ? { from: 5, to: 6 } : null };
  })];
// The chain's answer about the next block (Blockchain#nextBlock) at the newest `height`.
const next = (height, halving, check, subsidy = 0) => ({ height: height + 1, subsidy, difficulty: 0, bits: 0, halving, check });

describe('keyFiguresOf', () => {
  it('measures only the blocks the next difficulty check sees and forecasts its result', () => {
    expect(keyFiguresOf({ blocks: chain(), difficulty: 6, blockReward: 0.048828125, halvingInterval: 4, targetSeconds: 10,
      nextBlock: next(25, { at: 28, in: 3, subsidy: 2441406 }, { at: 30, in: 5 }, 4882812) })).toEqual({
      targetSeconds: 10, difficulty: 6, reward: 0.048828125, nextHalving: 28, halvingInterval: 4,
      pace: { seconds: 13.8, blocks: 5, from: 20, low: 7, high: 15 },
      check: { at: 30, in: 5, next: 6 },
      halving: { at: 28, in: 3, reward: 0.02441406 }
    });
  });

  it('forecasts a rise when the window is faster than 70 % of the target', () => {
    const figures = keyFiguresOf({ blocks: chain(15), difficulty: 5, blockReward: 0.09765625, halvingInterval: 4, targetSeconds: 10,
      nextBlock: next(15, { at: 16, in: 1, subsidy: 4882812 }, { at: 20, in: 5 }) });
    expect(figures.pace).toMatchObject({ seconds: 6, blocks: 5, from: 10 });
    expect(figures.check).toEqual({ at: 20, in: 5, next: 6 });
  });

  it('has no pace right after a check and before the first interval', () => {
    const after = keyFiguresOf({ blocks: chain(20), difficulty: 6, blockReward: 0.09765625, halvingInterval: 4, targetSeconds: 10,
      nextBlock: next(20, { at: 24, in: 4, subsidy: 4882812 }, { at: 30, in: 10 }) });
    expect(after.pace).toMatchObject({ seconds: null, blocks: 0, from: 20 });
    expect(after.check).toEqual({ at: 30, in: 10, next: 6 });
    const fresh = keyFiguresOf({ blocks: [{ time: 0 }], difficulty: 4, blockReward: 3.125, halvingInterval: 4, targetSeconds: 10,
      nextBlock: next(0, { at: 4, in: 4, subsidy: 156250000 }, { at: 10, in: 10 }) });
    expect(fresh.pace.seconds).toBeNull();
    expect(fresh.check.at).toBe(10);
    expect(fresh.halving).toEqual({ at: 4, in: 4, reward: 1.5625 });
    expect(fresh.nextHalving).toBe(4);
  });
});

describe('chainEventsOf', () => {
  it('marks difficulty changes by check or by hand and halvings, at the first block they apply to', () => {
    expect(chainEventsOf({ blocks: chain(), difficulty: 6 })).toEqual({
      3: [{ index: 3, kind: 'difficulty', from: 4, to: 5, source: 'set' }],
      21: [{ index: 21, kind: 'difficulty', from: 5, to: 6, source: 'check', checked: 20, window: { first: 11, last: 20, seconds: 6 } }],
      24: [{ index: 24, kind: 'halving', from: 0.09765625, to: 0.04882812 }]
    });
  });

  it('names a change made after the newest block on the candidate', () => {
    const blocks = chain(20);
    blocks[20].retarget = { from: 5, to: 6 };
    const events = chainEventsOf({ blocks, difficulty: 6 });
    expect(events[21]).toEqual([{ index: 21, kind: 'difficulty', from: 5, to: 6, source: 'check', checked: 20, window: { first: 11, last: 20, seconds: 6 } }]);
    expect(chainEventsOf({ blocks: chain(20), difficulty: 5 })[21]).toBeUndefined();
  });

  it('reads a check from the block that records it, not from the target block time now', () => {
    // The same raise without a recorded retarget was set by hand, even though the pace would explain it.
    expect(chainEventsOf({ blocks: chain(20), difficulty: 6 })[21]).toEqual([{ index: 21, kind: 'difficulty', from: 5, to: 6, source: 'set' }]);
    const blocks = chain();
    expect(chainEventsOf({ blocks, difficulty: 6 })[21][0].source).toBe('check');
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

  it('offers only undo as soon as a ledger rule breaks, on the edited block, not the block that fails', () => {
    const blockStatus = [{ index: 0, status: 'valid' }, { index: 1, status: 'hash-mismatch' },
      { index: 2, status: 'built-on-broken', issue: { reason: 'missing-input', txIndex: 1 } }];
    expect(repairOf(blockStatus, [{ blockIndex: 1, txIndex: 0, from: 3.125, to: 3 }])).toEqual({
      next: 1, order: [1], undoOnly: true, stuck: 2, reason: 'missing-input'
    });
  });

  it('offers only undo when a forged signature would survive re-mining', () => {
    expect(repairOf(status(['valid', 'valid', 'signature-invalid', 'built-on-broken']))).toEqual({
      next: 2, order: [2], undoOnly: true
    });
  });
});
