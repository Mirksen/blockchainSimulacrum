import { describe, expect, it } from 'vitest';
import {
  MAX_DIFFICULTY, MIN_DIFFICULTY, adjustedDifficulty, averagePace, checkWindowStart, isCheckHeight, nextCheckAfter, paceBand
} from '../lib/difficulty';

describe('difficulty adjustment rule', () => {
  it('checks after every tenth block, never before #10', () => {
    expect([0, 5, 9, 10, 11, 20, 25, 30].map(isCheckHeight)).toEqual([false, false, false, true, false, true, false, true]);
    expect([0, 1, 9, 10, 11, 25, 30].map(nextCheckAfter)).toEqual([10, 10, 10, 20, 20, 30, 40]);
  });

  it('measures the last ten blocks, from block #1 at the earliest', () => {
    expect(checkWindowStart(10)).toBe(1);
    expect(checkWindowStart(30)).toBe(20);
    const blocks = [{ time: -9e6 }, ...Array.from({ length: 30 }, (_, i) => ({ time: (i + 1) * 4 }))];
    expect(averagePace(blocks, 1, 10)).toBe(4);
    expect(averagePace(blocks, 20, 20)).toBeNull();
  });

  it('keeps the difficulty inside 70–150 % of the target and moves it one zero outside', () => {
    expect(paceBand(10)).toEqual({ low: 7, high: 15 });
    expect(adjustedDifficulty(6, 6.9, 10)).toBe(7);
    expect(adjustedDifficulty(6, 7, 10)).toBe(6);
    expect(adjustedDifficulty(6, 13.8, 10)).toBe(6);
    expect(adjustedDifficulty(6, 15, 10)).toBe(6);
    expect(adjustedDifficulty(6, 15.1, 10)).toBe(5);
    expect(adjustedDifficulty(6, null, 10)).toBe(6);
  });

  it('stays within the selectable range', () => {
    expect(adjustedDifficulty(MAX_DIFFICULTY, 1, 10)).toBe(MAX_DIFFICULTY);
    expect(adjustedDifficulty(MIN_DIFFICULTY, 99, 10)).toBe(MIN_DIFFICULTY);
  });
});
