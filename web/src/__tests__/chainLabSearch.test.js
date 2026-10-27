import { afterEach, describe, expect, it, vi } from 'vitest';
import SHA256 from 'crypto-js/sha256.js';
import { remineBlock, ROOT_HASH } from '../lib/chainLab';

// Synthetic hash outcomes exercise search limits; real hashing is checked separately.
vi.mock('crypto-js/sha256.js', () => ({ default: vi.fn() }));
afterEach(() => { vi.mocked(SHA256).mockReset(); });
const blocks = [{ number: 1, data: 'Synthetic search input', previousHash: ROOT_HASH, nonce: 0, hash: ROOT_HASH }];
const noWait = async () => {};

describe('bounded chain-lab search', () => {
  it('stops at exactly 50,000 unsuccessful candidates without a partial commit', async () => {
    vi.mocked(SHA256).mockReturnValue({ toString: () => 'f'.repeat(64) });
    const progress = vi.fn();
    const result = await remineBlock(blocks, 0, { onProgress: progress, yieldControl: noWait });
    expect(result).toEqual({ status: 'exhausted', attempts: 50_000 });
    expect(SHA256).toHaveBeenCalledTimes(50_000);
    expect(progress).toHaveBeenLastCalledWith(50_000);
    expect(blocks[0].hash).toBe(ROOT_HASH);
  });
  it('cancels between batches after actual work and returns no candidate block', async () => {
    vi.mocked(SHA256).mockReturnValue({ toString: () => 'f'.repeat(64) });
    const controller = new AbortController();
    const result = await remineBlock(blocks, 0, { signal: controller.signal, yieldControl: noWait,
      onProgress: () => controller.abort() });
    expect(result).toEqual({ status: 'stopped', attempts: 100 });
    expect(SHA256).toHaveBeenCalledTimes(100);
  });
});
