// @vitest-environment jsdom
import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import CryptoJS from 'crypto-js/core.js';
import { ec as EC } from 'elliptic';
import { useWorkbenchSession } from '../hooks/useWorkbenchSession';
import { telemetry } from '../lib/telemetry';
vi.mock('../lib/telemetry', async (importOriginal) => {
  const actual = await importOriginal();
  return { ...actual, telemetry: { track: vi.fn(), reportError: vi.fn() } };
});

const config = { participants: ['Miner One', 'Wallet Two'], miners: ['Miner One'], miningDifficulty: 1, halvingEvent: 2 };
// Every hash ends in the SHA-256 finalize. An 80-byte header and the second round over its
// digest are forced to a synthetic digest; transaction hashes stay real, so txids and
// addresses differ.
let finalize;
const realFinalize = CryptoJS.algo.SHA256.finalize;
const forceHash = hex => {
  finalize.mockImplementation(function (message) {
    const data = message ?? this._data;
    const size = this._nDataBytes + (message?.sigBytes ?? 0);
    const forced = size === 80 || (size === 32 && data.toString() === hex);
    return forced ? CryptoJS.enc.Hex.parse(hex) : realFinalize.call(this, message);
  });
};
beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(new Date('2026-01-02T12:00:00Z')); finalize = vi.spyOn(CryptoJS.algo.SHA256, 'finalize'); forceHash('0'.repeat(64)); });
afterEach(() => { cleanup(); vi.useRealTimers(); vi.clearAllMocks(); vi.restoreAllMocks(); telemetry.track.mockReset(); telemetry.reportError.mockReset(); });
const snap = result => result.current.snapshot;
const actionsOf = result => result.current.session.actions;
const accepted = outcome => outcome.events.find(event => event.type === 'block-accepted');
async function mine(result) {
  let outcome;
  await act(async () => { const pending = actionsOf(result).mine(); await vi.runAllTimersAsync(); outcome = await pending; });
  expect(outcome.ok).toBe(true);
  return outcome;
}
describe('simulation lifecycle', () => {
  it('does not generate fresh wallets on rerender', () => {
    const generation = vi.spyOn(EC.prototype, 'genKeyPair');
    const {result, rerender} = renderHook(() => useWorkbenchSession(config));
    const keys = snap(result).participants.map(p => p.publicKey);
    generation.mockClear();
    rerender();
    expect(snap(result).participants.map(p => p.publicKey)).toEqual(keys);
    expect(generation).not.toHaveBeenCalled();
  });
  it('does not apply a halving when mining is stopped', async () => {
    const { result } = renderHook(() => useWorkbenchSession(config));
    await mine(result);
    const reward = snap(result).blockReward;
    forceHash('f'.repeat(64));
    let outcome;
    await act(async () => { const pending = actionsOf(result).mine(); actionsOf(result).pause(); await vi.runAllTimersAsync(); outcome = await pending; });
    expect(outcome.reason).toBe('aborted');
    expect(snap(result).blockReward).toBe(reward);
    expect(snap(result).blocks).toHaveLength(2);
  });
  it('rejects a second start before React has rerendered', async () => {
    const { result } = renderHook(() => useWorkbenchSession(config));
    let second;
    await act(async () => { const first = actionsOf(result).mine(); second = await actionsOf(result).mine(); await vi.runAllTimersAsync(); await first; });
    expect(second.ok).toBe(false);
    expect(snap(result).blocks).toHaveLength(2);
  });
  it('reset invalidates an old run and clears mining state', async () => {
    forceHash('f'.repeat(64));
    const { result } = renderHook(() => useWorkbenchSession(config));
    let pending;
    act(() => { pending = actionsOf(result).mine(); actionsOf(result).reset(); });
    await act(async () => { await vi.runAllTimersAsync(); await pending; });
    expect(snap(result).blocks).toHaveLength(1);
    expect(snap(result).run.kind).toBe('idle');
    expect(snap(result).raceWinner).toBeNull();
    expect(snap(result).progress.perMiner).toEqual({});
  });
  it('applies a changed halving interval to subsequent blocks', async () => {
    const { result } = renderHook(() => useWorkbenchSession(config));
    await mine(result);
    act(() => { actionsOf(result).setHalvingInterval(4); });
    await mine(result);
    expect(snap(result).blockReward).toBe(3.125);
  });
  it('a stopped run cannot commit after a new run starts', async () => {
    const { result } = renderHook(() => useWorkbenchSession(config));
    let oldRun, newRun;
    act(() => {
      oldRun = actionsOf(result).mine();
      actionsOf(result).pause();
      newRun = actionsOf(result).mine();
    });
    await act(async () => {
      await vi.runAllTimersAsync();
      expect((await oldRun).reason).toBe('aborted');
      expect((await newRun).ok).toBe(true);
    });
    expect(snap(result).blocks).toHaveLength(2);
    expect(snap(result).run.kind).toBe('idle');
  });
  it('rejects transactions and setting changes during an active run', async () => {
    const { result } = renderHook(() => useWorkbenchSession(config));
    let pending;
    act(() => {
      pending = actionsOf(result).mine();
      expect(actionsOf(result).createTransaction('Miner One', 'Wallet Two', 1, '', 1).ok).toBe(false);
      actionsOf(result).setDifficulty(5);
      actionsOf(result).setHalvingInterval(9);
    });
    await act(async () => { await vi.runAllTimersAsync(); await pending; });
    expect(snap(result).difficulty).toBe(1);
    expect(snap(result).halvingInterval).toBe(2);
  });
  it('changes a miner\'s share during a race: the running search takes it from its next turn', async () => {
    forceHash('f'.repeat(64));
    const { result } = renderHook(() => useWorkbenchSession({ ...config, participants: ['Miner One', 'Miner Two', 'Wallet Two'], miners: ['Miner One', 'Miner Two'] }));
    let pending;
    act(() => { pending = actionsOf(result).mine(); });
    act(() => { actionsOf(result).setMinerShare('Miner One', 80); actionsOf(result).setSlowMotion(false); });
    await act(async () => { for (let i = 0; i < 30; i++) await vi.advanceTimersToNextTimerAsync(); });
    const one = snap(result).progress.perMiner['Miner One'];
    const two = snap(result).progress.perMiner['Miner Two'];
    expect(one.iterations / (one.iterations + two.iterations)).toBeGreaterThan(0.75);
    expect(one.iterations / (one.iterations + two.iterations)).toBeLessThan(0.85);
    expect(one.stream.at(-1)).toMatchObject({ nonce: one.nonce, hash: 'f'.repeat(64), zeros: 0 });
    expect(one.zeroCounts[0]).toBe(one.iterations);
    expect(one.header).toMatch(/^[0-9a-f]{152}$/);
    expect(snap(result).participants.filter(p => p.isMiner).map(p => p.hashpower)).toEqual([80, 20]);
    act(() => { actionsOf(result).pause(); });
    await act(async () => { await vi.runAllTimersAsync(); await pending; });
  });
  it('ends slow motion with the race it was switched on for: found or paused', async () => {
    const { result } = renderHook(() => useWorkbenchSession(config));
    act(() => { actionsOf(result).setSlowMotion(true); });
    expect(snap(result).settings.slowMotion).toBe(true);
    await mine(result);
    expect(snap(result).settings.slowMotion).toBe(false);
    forceHash('f'.repeat(64));
    let pending;
    act(() => { pending = actionsOf(result).mine(); actionsOf(result).setSlowMotion(true); });
    await act(async () => { await vi.advanceTimersToNextTimerAsync(); });
    expect(snap(result).settings.slowMotion).toBe(true);
    act(() => { actionsOf(result).pause(); });
    await act(async () => { await vi.runAllTimersAsync(); await pending; });
    expect(snap(result).settings.slowMotion).toBe(false);
  });
  it('counts each miner\'s blocks against its share over the races of this session', async () => {
    const { result } = renderHook(() => useWorkbenchSession({ ...config, participants: ['Miner One', 'Miner Two', 'Wallet Two'], miners: ['Miner One', 'Miner Two'] }));
    act(() => { actionsOf(result).setMinerShare('Miner Two', 25); });
    const { winner } = accepted(await mine(result));
    const keyOf = name => snap(result).participants.find(p => p.name === name).publicKey;
    expect(snap(result).luck.races).toBe(1);
    expect(snap(result).luck.perMiner[keyOf('Miner One')]).toEqual({ won: winner === 'Miner One' ? 1 : 0, expected: 0.75 });
    expect(snap(result).luck.perMiner[keyOf('Miner Two')]).toEqual({ won: winner === 'Miner Two' ? 1 : 0, expected: 0.25 });
    act(() => { actionsOf(result).reset(); });
    expect(snap(result).luck).toEqual({ races: 0, perMiner: {} });
  });
  it('demo setup distributes only the funds earned and resets cleanly', async () => {
    const { result } = renderHook(() => useWorkbenchSession(config));
    let outcome;
    await act(async () => { const pending = actionsOf(result).startDemo(); await vi.runAllTimersAsync(); outcome = await pending; });
    expect(outcome.ok).toBe(true);
    // The demo mines block #1 only; its distribution waits in the mempool.
    expect(snap(result).blocks).toHaveLength(2);
    expect(snap(result).balances.find(p => p.name === 'Wallet Two').balance).toBe(0);
    expect(snap(result).memPool.map(tx => snap(result).describeTx(tx)))
      .toEqual([expect.objectContaining({ from: 'Miner One', to: 'Wallet Two', amount: 0.6, memo: 'Demo distribution' })]);
    await mine(result);
    expect(snap(result).balances.find(p => p.name === 'Wallet Two').balance).toBe(0.6);
    expect(snap(result).chainValid).toBe(true);
    act(() => { actionsOf(result).reset(); });
    expect(snap(result).balances.every(p => p.balance === 0)).toBe(true);
  });
  it('a reset can start the new chain at another difficulty and ignores invalid ones', async () => {
    const { result } = renderHook(() => useWorkbenchSession({ ...config, miningDifficulty: 3 }));
    await act(async () => { const pending = actionsOf(result).startDemo(); await vi.runAllTimersAsync(); await pending; });
    expect(snap(result).blocks).toHaveLength(2);
    act(() => { actionsOf(result).reset({ difficulty: 1 }); });
    expect(snap(result).blocks).toHaveLength(1);
    expect(snap(result).difficulty).toBe(1);
    expect(telemetry.track).toHaveBeenCalledWith('difficulty_changed', { previous: 3, value: 1 });
    telemetry.track.mockClear();
    for (const invalid of [0, 11, 1.5, '2']) act(() => { actionsOf(result).reset({ difficulty: invalid }); });
    expect(snap(result).difficulty).toBe(1);
    expect(telemetry.track).not.toHaveBeenCalledWith('difficulty_changed', expect.anything());
  });
  it('the demo leaves exactly block #1 mined and returns its winner and block', async () => {
    const { result } = renderHook(() => useWorkbenchSession({ ...config, participants: ['Miner One', 'Wallet Two', 'Wallet Three'] }));
    let outcome;
    await act(async () => { const pending = actionsOf(result).startDemo(); await vi.runAllTimersAsync(); outcome = await pending; });
    expect(outcome.ok).toBe(true);
    expect(accepted(outcome)).toMatchObject({ winner: 'Miner One', index: 1, demo: true });
    expect(accepted(outcome).block).toBe(snap(result).blocks[1]);
    expect(snap(result).blocks).toHaveLength(2);
    expect(snap(result).run.kind).toBe('idle');
    const waiting = snap(result).memPool.map(tx => snap(result).describeTx(tx));
    expect(waiting).toHaveLength(2);
    expect(waiting.map(tx => [tx.from, tx.to, tx.memo])).toEqual([
      ['Miner One', 'Wallet Two', 'Demo distribution'], ['Miner One', 'Wallet Three', 'Demo distribution']
    ]);
    // One more block mines exactly #2 and carries the distribution.
    const pendingIds = snap(result).memPool.map(tx => tx.createHash());
    const second = accepted(await mine(result));
    expect(snap(result).blocks).toHaveLength(3);
    expect(second.block).toBe(snap(result).blocks[2]);
    expect(second.block.transactions.slice(1).map(tx => tx.createHash())).toEqual(pendingIds);
    expect(snap(result).memPool).toHaveLength(0);
  });
});

describe('operation telemetry boundaries', () => {
  const events = name => telemetry.track.mock.calls.filter(call => call[0] === name);
  it('emits exactly one start/completion per accepted mine, never per progress render', async () => {
    const {result,rerender}=renderHook(()=>useWorkbenchSession(config));
    await mine(result);rerender();rerender();
    expect(events('mining_started')).toHaveLength(1);
    expect(events('mining_completed')).toHaveLength(1);
    expect(events('mining_completed')[0][1]).toEqual({difficulty:1,elapsed_ms:0,attempt_count:1,miner_count:1,transaction_count:0,block_height:1});
  });
  it('records cancellation once when reset also cancels an existing attempt', async () => {
    forceHash('f'.repeat(64));
    const {result}=renderHook(()=>useWorkbenchSession(config));let pending;
    act(()=>{pending=actionsOf(result).mine();actionsOf(result).pause();actionsOf(result).reset();});
    await act(async()=>{await vi.runAllTimersAsync();await pending;});
    expect(events('mining_cancelled')).toHaveLength(1);
    expect(events('chain_reset')).toHaveLength(1);
    expect(events('mining_completed')).toHaveLength(0);
  });
  it('counts demo operations once under StrictMode', async () => {
    const {result,rerender}=renderHook(()=>useWorkbenchSession(config),{reactStrictMode:true});
    await act(async()=>{const pending=actionsOf(result).startDemo();await vi.runAllTimersAsync();await pending;});
    rerender();
    expect(events('demo_started')).toHaveLength(1);expect(events('demo_completed')).toHaveLength(1);
    expect(events('demo_completed')[0][1]).toEqual({difficulty:1,block_count:1});
    expect(events('mining_started')).toHaveLength(1);expect(events('mining_completed')).toHaveLength(1);
    expect(events('transaction_created')).toHaveLength(1);
  });
  it('a reset between a mined demo block and its continuation cannot report demo completion', async () => {
    const {result}=renderHook(()=>useWorkbenchSession(config));
    telemetry.track.mockImplementation(event=>{if(event==='mining_completed')actionsOf(result).reset();});
    let outcome;
    await act(async()=>{const pending=actionsOf(result).startDemo();await vi.runAllTimersAsync();outcome=await pending;});
    expect(outcome.reason).toBe('aborted');expect(outcome.ok).toBe(false);
    expect(events('demo_completed')).toHaveLength(0);expect(events('demo_cancelled')).toHaveLength(1);
  });
  it('never places wallet keys, entered labels or references in operation events', async () => {
    const {result}=renderHook(()=>useWorkbenchSession(config));await mine(result);
    act(()=>{
      actionsOf(result).createTransaction('Miner One','Wallet Two',0.1,'synthetic-private-memo',1);
      actionsOf(result).createTransaction('Miner One','Wallet Two',NaN,'synthetic-private-memo',1);
    });
    expect(events('transaction_created')).toHaveLength(1);
    expect(events('transaction_rejected')[0][1]).toEqual({source:'manual',reason:'invalid_amount'});
    const text=JSON.stringify(telemetry.track.mock.calls);
    expect(text).not.toContain('synthetic-private-memo');expect(text).not.toContain('Miner One');
    for(const participant of snap(result).participants){expect(text).not.toContain(participant.privateKey);expect(text).not.toContain(participant.publicKey);}
  });
  it('records actual setting changes and never repeated renders or unchanged values', () => {
    const {result,rerender}=renderHook(()=>useWorkbenchSession(config));
    act(()=>{actionsOf(result).setDifficulty(2);actionsOf(result).setDifficulty(2);actionsOf(result).setHalvingInterval(4);actionsOf(result).setHalvingInterval(4);});
    rerender();expect(events('difficulty_changed')).toHaveLength(1);expect(events('settings_changed')).toHaveLength(1);
  });
});
