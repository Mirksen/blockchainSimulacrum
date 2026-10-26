import { createHash } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import SHA256 from 'crypto-js/sha256.js';
import { changedPositions, createTrial, findNonce, meetsTarget, parseNonce, SEARCH_LIMIT } from '../lib/hashLab';

vi.mock('crypto-js/sha256.js', async importOriginal => {
  const actual = await importOriginal();
  return { default: vi.fn(actual.default) };
});
const digest = input => createHash('sha256').update(input, 'utf8').digest('hex');
const instantYield = () => Promise.resolve();

describe('hash-lab inputs and fingerprints', () => {
  it('hashes the exact displayed UTF-8 JSON, including boundaries and escapes', () => {
    for (const message of ['', 'Hello, block!', 'café 🧪', '"nonce":123']) {
      const trial = createTrial(message, 0);
      expect(trial.preimage).toBe(JSON.stringify({ message, nonce: 0 }));
      expect(trial.hash).toBe(digest(trial.preimage));
    }
    expect(createTrial('Hello, block!', 0).hash).toBe('c7045b5e21b4edb436fb86d51830d621c23095d920e36976325d652c4f0207d9');
    expect(createTrial('x1', 23).hash).not.toBe(createTrial('x12', 3).hash);
  });
  it('restores a fingerprint and changes it with either field', () => {
    const original = createTrial('Synthetic block', 2);
    expect(createTrial('Synthetic Block', 2).hash).not.toBe(original.hash);
    expect(createTrial('Synthetic block', 3).hash).not.toBe(original.hash);
    expect(createTrial('Synthetic block', '002')).toEqual(original);
  });
  it('rejects empty, negative, fractional and unsafe nonces', () => {
    for (const value of ['', '-1', '1.5', '1e2', ' ', null, false, NaN, Infinity, -1, 1.5, 9007199254740992, '9007199254740992']) {
      expect(() => parseNonce(value)).toThrow(RangeError);
    }
    expect(parseNonce('0')).toBe(0);
    expect(parseNonce('9007199254740991')).toBe(Number.MAX_SAFE_INTEGER);
  });
  it('compares hex characters without inventing a first comparison', () => {
    expect(changedPositions('abcdef', null)).toEqual([false, false, false, false, false, false]);
    expect(changedPositions('ab1de2', 'abcdef')).toEqual([false, false, true, false, false, true]);
    expect(changedPositions('abcdef', 'abcdef').filter(Boolean)).toHaveLength(0);
  });
  it('requires the selected count of leading hexadecimal zeros', () => {
    expect(meetsTarget('0abc', 1)).toBe(true);
    expect(meetsTarget('0abc', 2)).toBe(false);
    expect(meetsTarget('000abc', 3)).toBe(true);
    expect(meetsTarget('a000', 1)).toBe(false);
    for (const difficulty of [0, 4, 1.5, '2']) expect(() => meetsTarget('', difficulty)).toThrow(RangeError);
  });
});

describe('bounded nonce search', () => {
  it('returns the real first match and exact inclusive attempt count', async () => {
    const result = await findNonce({ message: 'Hello, block!', startNonce: 0, difficulty: 2, yieldControl: instantYield });
    expect(result.status).toBe('found');
    expect(result.attempts).toBe(72);
    expect(result.trial.nonce).toBe(71);
    expect(result.trial.hash).toBe(digest('{"message":"Hello, block!","nonce":71}'));
    expect(result.trial.hash.startsWith('00')).toBe(true);
    for (let nonce = 0; nonce < 71; nonce++) expect(digest(JSON.stringify({ message: 'Hello, block!', nonce })).startsWith('00')).toBe(false);
    const repeat = await findNonce({ message: 'Hello, block!', startNonce: 71, difficulty: 2, yieldControl: instantYield });
    expect(repeat.attempts).toBe(1);
    expect(repeat.trial).toEqual(result.trial);
  });
  it('does no work when stopped before the initial yield settles', async () => {
    const controller = new AbortController();
    const pending = findNonce({ message: 'Hello, block!', startNonce: 0, difficulty: 3, signal: controller.signal, yieldControl: instantYield });
    controller.abort();
    expect(await pending).toEqual({ status: 'stopped', attempts: 0, trial: null });
  });
  it('settles at a yielded batch on cancellation', async () => {
    const controller = new AbortController();
    const progress = [];
    const result = await findNonce({ message: 'Hello, block!', startNonce: 0, difficulty: 3, signal: controller.signal,
      onProgress: value => { progress.push(value); controller.abort(); }, yieldControl: instantYield });
    expect(result.status).toBe('stopped');
    expect(result.attempts).toBe(100);
    expect(result.trial.nonce).toBe(99);
    expect(progress).toHaveLength(1);
  });
  it('stops at its work limit even when every candidate misses', async () => {
    const original = SHA256.getMockImplementation();
    SHA256.mockImplementation(() => ({ toString: () => 'f'.repeat(64) }));
    try {
      const controller = new AbortController();
      const result = await findNonce({ message: 'No-match fixture', startNonce: 10, difficulty: 3, signal: controller.signal, yieldControl: instantYield,
        onProgress: progress => { if (progress.attempts > 50_000) controller.abort(); } });
      expect(SEARCH_LIMIT).toBe(50_000);
      expect(result.status).toBe('exhausted');
      expect(result.attempts).toBe(50_000);
      expect(result.trial.nonce).toBe(50_009);
    } finally { SHA256.mockImplementation(original); }
  });
  it('does not round beyond the last safe integer nonce', async () => {
    const result = await findNonce({ message: 'Synthetic block', startNonce: Number.MAX_SAFE_INTEGER, difficulty: 3, yieldControl: instantYield });
    expect(result.status).toBe('exhausted');
    expect(result.attempts).toBe(1);
    expect(result.trial.nonce).toBe(Number.MAX_SAFE_INTEGER);
  });
});
