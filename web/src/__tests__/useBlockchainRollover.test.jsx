// @vitest-environment jsdom
import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useBlockchain } from '../hooks/useBlockchain';
import { runSearch } from '../lib/powSearch';
import { telemetry } from '../lib/telemetry';

vi.mock('../lib/telemetry', async importOriginal => ({ ...await importOriginal(), telemetry: { track: vi.fn(), reportError: vi.fn() } }));
// The first search of a run claims the whole nonce space; later ones really search.
vi.mock('../lib/powSearch', async importOriginal => {
  const actual = await importOriginal();
  return { ...actual, runSearch: vi.fn() };
});
const WASTED = 4_294_967_296;
const realSearch = async () => (await vi.importActual('../lib/powSearch')).search;
beforeEach(async () => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-01-02T12:00:00Z'));
  const search = await realSearch();
  runSearch.mockReset();
  runSearch.mockResolvedValueOnce({ status: 'exhausted', winner: null, nonce: null, hash: null, attempts: WASTED, entrants: {} });
  runSearch.mockImplementation(options => search({ ...options, yieldControl: () => undefined }));
});
afterEach(() => { cleanup(); vi.useRealTimers(); vi.clearAllMocks(); });

const config = { participants: ['Miner1', 'Wallet2'], miners: ['Miner1'], miningDifficulty: 1 };
async function run(start) {
  let outcome;
  await act(async () => { const pending = start(); await vi.runAllTimersAsync(); outcome = await pending; });
  return outcome;
}

describe('nonce space exhausted', () => {
  it('mines on with the next extraNonce and keeps counting attempts', async () => {
    const { result } = renderHook(() => useBlockchain(config));
    const outcome = await run(() => result.current.mineBlock());
    expect(outcome.success).toBe(true);
    expect(runSearch).toHaveBeenCalledTimes(2);
    const [[first], [second]] = runSearch.mock.calls;
    expect(second.entrants[0].header).not.toBe(first.entrants[0].header);
    const block = result.current.blocks[1];
    expect(block.transactions[0].extraNonce).toBe(1);
    expect(block.isValid()).toBe(true);
    expect(result.current.chainValid).toBe(true);
    expect(result.current.miningProgress.iterations).toBeGreaterThan(WASTED);
    const completed = telemetry.track.mock.calls.find(([event]) => event === 'mining_completed');
    expect(completed[1].attempt_count).toBeGreaterThan(WASTED);
  });

  it('re-mines on with a later time and the same transactions', async () => {
    const { result } = renderHook(() => useBlockchain(config));
    const search = await realSearch();
    runSearch.mockReset();
    runSearch.mockImplementation(options => search({ ...options, yieldControl: () => undefined }));
    await run(() => result.current.mineBlock());
    const block = result.current.blocks[1];
    const { time } = block;
    const txid = block.transactions[0].createHash();
    runSearch.mockResolvedValueOnce({ status: 'exhausted', winner: null, nonce: null, hash: null, attempts: WASTED, entrants: {} });
    const outcome = await run(() => result.current.remineBlock(1));
    expect(outcome.success).toBe(true);
    expect(block.time).toBe(time + 1);
    expect(block.transactions[0].createHash()).toBe(txid);
    expect(block.isValid()).toBe(true);
  });
});
