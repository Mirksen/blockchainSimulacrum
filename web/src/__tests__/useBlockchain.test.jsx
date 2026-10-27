// @vitest-environment jsdom
import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import SHA256 from 'crypto-js/sha256';
import CryptoJS from 'crypto-js/core.js';
import { ec as EC } from 'elliptic';
import { useBlockchain } from '../hooks/useBlockchain';
import { telemetry } from '../lib/telemetry';
vi.mock('../lib/telemetry', async (importOriginal) => {
  const actual = await importOriginal();
  return { ...actual, telemetry: { track: vi.fn(), reportError: vi.fn() } };
});

vi.mock('crypto-js/sha256', async (importOriginal) => {
  const actual = await importOriginal();
  return { default: vi.fn(actual.default) };
});
const config = { participants: ['Miner One', 'Wallet Two'], miners: ['Miner One'], miningDifficulty: 1, halvingEvent: 2 };
// Nonce searches hash through the SHA-256 midstate (finalize), block checks
// through the SHA256 helper; both are forced to the same synthetic digest.
let finalize;
const forceHash = hex => {
  vi.mocked(SHA256).mockImplementation(() => ({ toString: () => hex }));
  finalize.mockImplementation(() => ({ toString: () => hex }));
};
beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(new Date('2026-01-02T12:00:00Z')); finalize = vi.spyOn(CryptoJS.algo.SHA256, 'finalize'); forceHash('0'.repeat(64)); });
afterEach(() => { cleanup(); vi.useRealTimers(); vi.clearAllMocks(); vi.restoreAllMocks(); telemetry.track.mockReset(); telemetry.reportError.mockReset(); });
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
    forceHash('f'.repeat(64));
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
    forceHash('f'.repeat(64));
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

describe('operation telemetry boundaries', () => {
  const events = name => telemetry.track.mock.calls.filter(call => call[0] === name);
  it('emits exactly one start/completion per accepted mine, never per progress render', async () => {
    const {result,rerender}=renderHook(()=>useBlockchain(config));
    await mine(result);rerender();rerender();
    expect(events('mining_started')).toHaveLength(1);
    expect(events('mining_completed')).toHaveLength(1);
    expect(events('mining_completed')[0][1]).toEqual({difficulty:1,elapsed_ms:0,attempt_count:1,miner_count:1,transaction_count:0,block_height:1});
  });
  it('records cancellation once when reset also cancels an existing attempt', async () => {
    forceHash('f'.repeat(64));
    const {result}=renderHook(()=>useBlockchain(config));let pending;
    act(()=>{pending=result.current.mineBlock();result.current.cancelMining();result.current.resetBlockchain();});
    await act(async()=>{await vi.runAllTimersAsync();await pending;});
    expect(events('mining_cancelled')).toHaveLength(1);
    expect(events('chain_reset')).toHaveLength(1);
    expect(events('mining_completed')).toHaveLength(0);
  });
  it('counts demo operations once under StrictMode', async () => {
    const {result,rerender}=renderHook(()=>useBlockchain(config),{reactStrictMode:true});
    await act(async()=>{const pending=result.current.setupInitialDistribution();await vi.runAllTimersAsync();await pending;});
    rerender();
    expect(events('demo_started')).toHaveLength(1);expect(events('demo_completed')).toHaveLength(1);
    expect(events('mining_started')).toHaveLength(2);expect(events('mining_completed')).toHaveLength(2);
    expect(events('transaction_created')).toHaveLength(1);
  });
  it('a reset between a mined demo block and its continuation cannot report demo completion', async () => {
    const {result}=renderHook(()=>useBlockchain(config));
    telemetry.track.mockImplementation(event=>{if(event==='mining_completed')result.current.resetBlockchain();});
    let outcome;
    await act(async()=>{const pending=result.current.setupInitialDistribution();await vi.runAllTimersAsync();outcome=await pending;});
    expect(outcome.aborted).toBe(true);expect(outcome.success).toBe(false);
    expect(events('demo_completed')).toHaveLength(0);expect(events('demo_cancelled')).toHaveLength(1);
  });
  it('never places wallet keys, entered labels or references in operation events', async () => {
    const {result}=renderHook(()=>useBlockchain(config));await mine(result);
    act(()=>{
      result.current.createTransaction('Miner One','Wallet Two',0.1,0,'synthetic-private-memo');
      result.current.createTransaction('Miner One','Wallet Two',NaN,0,'synthetic-private-memo');
    });
    expect(events('transaction_created')).toHaveLength(1);
    expect(events('transaction_rejected')[0][1]).toEqual({source:'manual',reason:'invalid_amount'});
    const text=JSON.stringify(telemetry.track.mock.calls);
    expect(text).not.toContain('synthetic-private-memo');expect(text).not.toContain('Miner One');
    for(const participant of result.current.participants){expect(text).not.toContain(participant.privateKey);expect(text).not.toContain(participant.publicKey);}
  });
  it('records actual setting changes and never repeated renders or unchanged values', () => {
    const {result,rerender}=renderHook(()=>useBlockchain(config));
    act(()=>{result.current.setDifficulty(2);result.current.setDifficulty(2);result.current.setHalvingInterval(4);result.current.setHalvingInterval(4);});
    rerender();expect(events('difficulty_changed')).toHaveLength(1);expect(events('settings_changed')).toHaveLength(1);
  });
});
