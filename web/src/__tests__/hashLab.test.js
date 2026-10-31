import { Buffer } from 'node:buffer';
import { createHash } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import CryptoJS from 'crypto-js/core.js';
import { changedPositions, createTrial, findNonce, INITIAL_MESSAGE, meetsTarget, parseNonce, SEARCH_LIMIT } from '../lib/hashLab';

// 50,000 real midstate attempts take seconds on an idle machine, far more through a
// spy; keep headroom for loaded CI runners instead of the 5 s default.
const LIMIT_TEST_TIMEOUT_MS = 60_000;
// This message has no three-zero match in its first 25,000 candidates.
const SLOW_MESSAGE = 'Stop experiment 264';

const sha256d = bytes => createHash('sha256').update(createHash('sha256').update(bytes).digest()).digest();
// Independent reference: the 80 header bytes, built without the code under test.
function header(message, nonce, bits) {
  const bytes = Buffer.alloc(80);
  bytes.writeUInt32LE(1, 0);
  sha256d(Buffer.from(message, 'utf8')).copy(bytes, 36);
  bytes.writeUInt32LE(1231006505, 68);
  bytes.writeUInt32LE(bits, 72);
  bytes.writeUInt32LE(nonce, 76);
  return bytes;
}
const display = bytes => Buffer.from(sha256d(bytes)).reverse().toString('hex');
const TWO_ZEROS = 0x2000ffff;
const instantYield = () => Promise.resolve();

describe('hash-lab inputs and fingerprints', () => {
  it('hashes the exact displayed 80-byte header, with the message as merkle root', () => {
    for (const message of ['', 'Hello, block.', 'café 🧪', '"nonce":123']) {
      const trial = createTrial(message, 7, 2);
      expect(trial.header).toBe(header(message, 7, TWO_ZEROS).toString('hex'));
      expect(trial.hash).toBe(display(header(message, 7, TWO_ZEROS)));
    }
    expect(createTrial('Hello, block.', 0, 2).hash).toBe('1a0d7b15184c53f422b0b436486d66286eddeb4cbce03a1a4a8c0329fbdda6ec');
    expect(createTrial('x1', 23, 2).hash).not.toBe(createTrial('x12', 3, 2).hash);
  });
  it('hashes the chosen target, because bits are part of the header', () => {
    expect(createTrial('Hello, block.', 0, 1).hash).not.toBe(createTrial('Hello, block.', 0, 2).hash);
  });
  it('restores a fingerprint and changes it with either field', () => {
    const original = createTrial('Synthetic block', 2, 1);
    expect(createTrial('Synthetic Block', 2, 1).hash).not.toBe(original.hash);
    expect(createTrial('Synthetic block', 3, 1).hash).not.toBe(original.hash);
    expect(createTrial('Synthetic block', '002', 1)).toEqual(original);
  });
  it('rejects empty, negative, fractional and beyond-32-bit nonces', () => {
    for (const value of ['', '-1', '1.5', '1e2', ' ', null, false, NaN, Infinity, -1, 1.5, 4294967296, '4294967296']) {
      expect(() => parseNonce(value)).toThrow(RangeError);
    }
    expect(parseNonce('0')).toBe(0);
    expect(parseNonce('4294967295')).toBe(0xffffffff);
  });
  it('compares hex characters without inventing a first comparison', () => {
    expect(changedPositions('abcdef', null)).toEqual([false, false, false, false, false, false]);
    expect(changedPositions('ab1de2', 'abcdef')).toEqual([false, false, true, false, false, true]);
    expect(changedPositions('abcdef', 'abcdef').filter(Boolean)).toHaveLength(0);
  });
  it('requires the selected count of leading hexadecimal zeros', () => {
    const hash = start => start.padEnd(64, '0');
    expect(meetsTarget(hash('0abc'), 1)).toBe(true);
    expect(meetsTarget(hash('0abc'), 2)).toBe(false);
    expect(meetsTarget(hash('000abc'), 3)).toBe(true);
    expect(meetsTarget(hash('a000'), 1)).toBe(false);
    for (const difficulty of [0, 4, 1.5, '2']) expect(() => meetsTarget(hash(''), difficulty)).toThrow(RangeError);
  });
});

describe('bounded nonce search', () => {
  it('returns the real first match and exact inclusive attempt count', async () => {
    const result = await findNonce({ message: 'Hello, block.', startNonce: 0, difficulty: 2, yieldControl: instantYield });
    expect(result.status).toBe('found');
    expect(result.attempts).toBe(187 + 1);
    expect(result.trial.nonce).toBe(187);
    expect(result.trial.hash).toBe(display(header('Hello, block.', 187, TWO_ZEROS)));
    expect(result.trial.hash.startsWith('00')).toBe(true);
    for (let nonce = 0; nonce < 187; nonce++) expect(display(header('Hello, block.', nonce, TWO_ZEROS)).startsWith('00')).toBe(false);
    const repeat = await findNonce({ message: 'Hello, block.', startNonce: 187, difficulty: 2, yieldControl: instantYield });
    expect(repeat.attempts).toBe(1);
    expect(repeat.trial).toEqual(result.trial);
  });
  it('needs more attempts for each stricter target on the default message', async () => {
    const attempts = [];
    for (const difficulty of [1, 2, 3]) {
      const result = await findNonce({ message: INITIAL_MESSAGE, startNonce: 0, difficulty, yieldControl: instantYield });
      expect(result.status).toBe('found');
      attempts.push(result.attempts);
    }
    expect(attempts).toEqual([12, 188, 6122]);
  }, LIMIT_TEST_TIMEOUT_MS);
  it('does no work when stopped before the initial yield settles', async () => {
    const controller = new AbortController();
    const pending = findNonce({ message: 'Hello, block.', startNonce: 0, difficulty: 3, signal: controller.signal, yieldControl: instantYield });
    controller.abort();
    expect(await pending).toEqual({ status: 'stopped', attempts: 0, trial: null });
  });
  it('settles at a yielded batch on cancellation', async () => {
    const controller = new AbortController();
    const progress = [];
    const result = await findNonce({ message: SLOW_MESSAGE, startNonce: 0, difficulty: 3, signal: controller.signal,
      onProgress: value => { progress.push(value); controller.abort(); }, yieldControl: instantYield });
    expect(result.status).toBe('stopped');
    expect(result.attempts).toBe(100);
    expect(result.trial.nonce).toBe(99);
    expect(progress).toHaveLength(1);
  });
  it('stops at its work limit even when every candidate misses', async () => {
    // The search hashes through the SHA-256 midstate; force every digest to miss.
    const finalize = vi.spyOn(CryptoJS.algo.SHA256, 'finalize').mockReturnValue(CryptoJS.enc.Hex.parse('f'.repeat(64)));
    try {
      const controller = new AbortController();
      const result = await findNonce({ message: 'No-match fixture', startNonce: 10, difficulty: 3, signal: controller.signal, yieldControl: instantYield,
        onProgress: progress => { if (progress.attempts > 50_000) controller.abort(); } });
      expect(SEARCH_LIMIT).toBe(50_000);
      expect(result.status).toBe('exhausted');
      expect(result.attempts).toBe(50_000);
      expect(result.trial.nonce).toBe(50_009);
    } finally { finalize.mockRestore(); }
  }, LIMIT_TEST_TIMEOUT_MS);
  it('ends at the last 32-bit nonce', async () => {
    const result = await findNonce({ message: 'Synthetic block', startNonce: 0xffffffff, difficulty: 3, yieldControl: instantYield });
    expect(result.status).toBe('exhausted');
    expect(result.attempts).toBe(1);
    expect(result.trial.nonce).toBe(0xffffffff);
  });
});
