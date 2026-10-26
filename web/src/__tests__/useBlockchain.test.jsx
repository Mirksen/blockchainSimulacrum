// @vitest-environment jsdom
import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import SHA256 from 'crypto-js/sha256';
import { ec as EC } from 'elliptic';
import { useBlockchain } from '../hooks/useBlockchain';

vi.mock('crypto-js/sha256', async (importOriginal) => {
  const actual = await importOriginal();
  return { default: vi.fn(actual.default) };
});
const config = { participants: ['Miner One', 'Wallet Two'], miners: ['Miner One'], miningDifficulty: 1, halvingEvent: 2 };
beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(new Date('2026-01-02T12:00:00Z')); vi.mocked(SHA256).mockImplementation(() => ({ toString: () => '0'.repeat(64) })); });
afterEach(() => { cleanup(); vi.useRealTimers(); vi.clearAllMocks(); vi.restoreAllMocks(); });
async function mine(result) {
  let outcome;
  await act(async () => { const pending = result.current.mineBlock(); await vi.runAllTimersAsync(); outcome = await pending; });
  expect(outcome.success).toBe(true);
  return outcome;
}
describe('simulation lifecycle', () => {
  it('does not generate fresh wallets on rerender', () => {
    const generation = vi.spyOn(EC.prototype, 'genKeyPair');
    const {result, rerender} = renderHook(() => useBlockchain(config));
    const keys = result.current.participants.map(p => p.publicKey);
    generation.mockClear();
    rerender();
    expect(result.current.participants.map(p => p.publicKey)).toEqual(keys);
    expect(generation).not.toHaveBeenCalled();
  });
  it('does not apply a halving when mining is stopped', async () => {
    const { result } = renderHook(() => useBlockchain(config));
    await mine(result);
    const reward = result.current.blockchain.blockReward;
    SHA256.mockImplementation(() => ({ toString: () => 'f'.repeat(64) }));
    let outcome;
    await act(async () => { const pending = result.current.mineBlock(); result.current.cancelMining(); await vi.runAllTimersAsync(); outcome = await pending; });
    expect(outcome.aborted).toBe(true);
    expect(result.current.blockchain.blockReward).toBe(reward);
    expect(result.current.blocks).toHaveLength(2);
  });
  it('rejects a second start before React has rerendered', async () => {
    const { result } = renderHook(() => useBlockchain(config));
    let second;
    await act(async () => { const first = result.current.mineBlock(); second = await result.current.mineBlock(); await vi.runAllTimersAsync(); await first; });
    expect(second.success).toBe(false);
    expect(result.current.blocks).toHaveLength(2);
  });
  it('reset invalidates an old run and clears mining state', async () => {
    SHA256.mockImplementation(() => ({ toString: () => 'f'.repeat(64) }));
    const { result } = renderHook(() => useBlockchain(config));
    let pending;
    act(() => { pending = result.current.mineBlock(); result.current.resetBlockchain(); });
    await act(async () => { await vi.runAllTimersAsync(); await pending; });
    expect(result.current.blocks).toHaveLength(1);
    expect(result.current.isMining).toBe(false);
    expect(result.current.raceWinner).toBeNull();
    expect(result.current.minerProgress).toEqual({});
  });
  it('applies a changed halving interval to subsequent blocks', async () => {
    const { result } = renderHook(() => useBlockchain(config));
    await mine(result);
    act(() => result.current.setHalvingInterval(4));
    await mine(result);
    expect(result.current.blockchain.blockReward).toBe(3.125);
  });
  it('a stopped run cannot commit after a new run starts', async () => {
    const { result } = renderHook(() => useBlockchain(config));
    let oldRun, newRun;
    act(() => {
      oldRun = result.current.mineBlock();
      result.current.cancelMining();
      newRun = result.current.mineBlock();
    });
    await act(async () => {
      await vi.runAllTimersAsync();
      expect((await oldRun).aborted).toBe(true);
      expect((await newRun).success).toBe(true);
    });
    expect(result.current.blocks).toHaveLength(2);
    expect(result.current.isMining).toBe(false);
  });
  it('rejects transactions and setting changes during an active run', async () => {
    const { result } = renderHook(() => useBlockchain(config));
    let pending;
    act(() => {
      pending = result.current.mineBlock();
      expect(result.current.createTransaction('Miner One', 'Wallet Two', 1, 0).success).toBe(false);
      result.current.setDifficulty(5);
      result.current.setHalvingInterval(9);
    });
    await act(async () => { await vi.runAllTimersAsync(); await pending; });
    expect(result.current.difficulty).toBe(1);
    expect(result.current.halvingInterval).toBe(2);
  });
  it('demo setup distributes only the funds earned and resets cleanly', async () => {
    const { result } = renderHook(() => useBlockchain(config));
    let outcome;
    await act(async () => { const pending = result.current.setupInitialDistribution(); await vi.runAllTimersAsync(); outcome = await pending; });
    expect(outcome.success).toBe(true);
    expect(result.current.balances.find(p => p.name === 'Wallet Two').balance).toBe(0.6);
    expect(result.current.chainValid).toBe(true);
    act(() => result.current.resetBlockchain());
    expect(result.current.balances.every(p => p.balance === 0)).toBe(true);
  });
});
