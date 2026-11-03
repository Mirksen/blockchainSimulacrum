import { describe, expect, it } from 'vitest';
import { ownRow, recordCopy, recordOf } from '../lib/records';

// Synthetic all-time rows; only name, rank and bestZeros matter here.
const rows = [
  { name: 'test-top', rank: 1, bestZeros: 9 },
  { name: 'test-mid', rank: 2, bestZeros: 7 },
  { name: 'test-low', bestZeros: 5 },
];

describe('ownRow', () => {
  it('finds the rank and zeros of a name, the position when a row has no rank', () => {
    expect(ownRow(rows, 'test-mid')).toEqual({ rank: 2, zeros: 7 });
    expect(ownRow(rows, 'test-low')).toEqual({ rank: 3, zeros: 5 });
  });
  it('is null for a missing name, no rows or no name', () => {
    expect(ownRow(rows, 'test-absent')).toBeNull();
    expect(ownRow(null, 'test-mid')).toBeNull();
    expect(ownRow(rows, '')).toBeNull();
  });
});

describe('recordOf', () => {
  it('celebrates the first time on the board, or rank 1 straight away', () => {
    expect(recordOf(null, { rank: 12, zeros: 4 })).toEqual({ kind: 'entered', rank: 12, zeros: 4 });
    expect(recordOf(null, { rank: 1, zeros: 9 })).toEqual({ kind: 'top', rank: 1, zeros: 9 });
  });
  it('celebrates a better rank with the places gained, rank 1 as the top', () => {
    expect(recordOf({ rank: 9, zeros: 5 }, { rank: 4, zeros: 6 })).toEqual({ kind: 'climbed', rank: 4, zeros: 6, places: 5 });
    expect(recordOf({ rank: 2, zeros: 7 }, { rank: 1, zeros: 8 })).toEqual({ kind: 'top', rank: 1, zeros: 8, places: 1 });
  });
  it('celebrates more zeros than ever at the same rank', () => {
    expect(recordOf({ rank: 3, zeros: 5 }, { rank: 3, zeros: 6 })).toEqual({ kind: 'zeros', rank: 3, zeros: 6, previousZeros: 5 });
  });
  it('stays quiet when nothing improved, the rank fell or the name left the board', () => {
    expect(recordOf({ rank: 3, zeros: 5 }, { rank: 3, zeros: 5 })).toBeNull();
    expect(recordOf({ rank: 3, zeros: 5 }, { rank: 4, zeros: 5 })).toBeNull();
    expect(recordOf({ rank: 3, zeros: 5 }, null)).toBeNull();
    expect(recordOf(null, null)).toBeNull();
  });
});

describe('recordCopy', () => {
  it('names what was reached', () => {
    expect(recordCopy({ kind: 'top', rank: 1, zeros: 9 }).title).toBe('Rank #1 of all time!');
    expect(recordCopy({ kind: 'entered', rank: 12, zeros: 1 }).text).toBe('Rank #12 of all time with 1 leading zero. Every block can take you higher.');
    expect(recordCopy({ kind: 'climbed', rank: 4, zeros: 6, places: 1 })).toEqual({ title: 'New rank: #4', text: 'Up 1 place on the all-time board. Keep mining.' });
    expect(recordCopy({ kind: 'zeros', rank: 3, zeros: 6, previousZeros: 4 })).toEqual({ title: 'New best: 6 zeros', text: 'Your best hash yet, 2 more than before. Rank #3.' });
  });
});
