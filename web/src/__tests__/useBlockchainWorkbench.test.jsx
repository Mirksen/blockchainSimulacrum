// @vitest-environment jsdom
import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useBlockchain } from '../hooks/useBlockchain';
import { telemetry } from '../lib/telemetry';
vi.mock('../lib/telemetry', async (importOriginal) => {
  const actual = await importOriginal();
  return { ...actual, telemetry: { track: vi.fn(), reportError: vi.fn() } };
});

// Real hashing at one leading zero: a block needs about 16 attempts.
const config = { participants: ['Miner1', 'Miner2', 'Wallet3'], miners: ['Miner1', 'Miner2'], miningDifficulty: 1, halvingEvent: 2 };
beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(new Date('2026-01-02T12:00:00Z')); vi.spyOn(Math, 'random').mockReturnValue(0.5); });
afterEach(() => { cleanup(); vi.useRealTimers(); vi.restoreAllMocks(); telemetry.track.mockReset(); telemetry.reportError.mockReset(); });

async function settle(result, start) {
  let outcome;
  await act(async () => { const pending = start(result.current); await vi.runAllTimersAsync(); outcome = await pending; });
  return outcome;
}
const mine = result => settle(result, current => current.mineBlock());
const remine = (result, index) => settle(result, current => current.remineBlock(index));
async function minedHook(blocks = 4) {
  const hook = renderHook(() => useBlockchain(config));
  for (let i = 0; i < blocks; i++) expect((await mine(hook.result)).success).toBe(true);
  return hook;
}
const statuses = result => result.current.blockStatus.map(check => check.status);
const events = name => telemetry.track.mock.calls.filter(call => call[0] === name);

describe('createWallet', () => {
  it('adds a non-miner wallet with balance 0 to the snapshot', () => {
    const { result } = renderHook(() => useBlockchain(config));
    let outcome;
    act(() => { outcome = result.current.createWallet('Dana7'); });
    expect(outcome).toMatchObject({ success: true, error: null });
    expect(result.current.balances.at(-1)).toMatchObject({ name: 'Dana7', balance: 0, isMiner: false });
    expect(result.current.participants.map(p => p.name)).toContain('Dana7');
  });

  it('rejects duplicate (case-insensitive) and malformed names without publishing a change', () => {
    const { result } = renderHook(() => useBlockchain(config));
    const before = result.current.participants;
    let duplicate, malformed;
    act(() => { duplicate = result.current.createWallet('wallet3'); malformed = result.current.createWallet('x'); });
    expect(duplicate).toEqual({ success: false, error: 'A wallet named wallet3 already exists.' });
    expect(malformed.success).toBe(false);
    expect(result.current.participants).toBe(before);
  });
});

describe('block status and tamper bookkeeping', () => {
  it('publishes block checks and edits, and undo restores validity', async () => {
    const { result } = await minedHook();
    expect(statuses(result)).toEqual(['valid', 'valid', 'valid', 'valid', 'valid']);
    expect(result.current.tamperedEdits).toEqual([]);
    const original = result.current.blocks[2].transactions[0].amount; // Halved coinbase: 1.5625
    expect(original).toBe(1.5625);
    act(() => { result.current.tamperBlock(2, 0, 999); result.current.tamperBlock(2, 0, 500); });
    expect(result.current.chainValid).toBe(false);
    expect(statuses(result)).toEqual(['valid', 'valid', 'hash-mismatch', 'built-on-broken', 'built-on-broken']);
    expect(result.current.blockStatus[3].linkIntact).toBe(true);
    expect(result.current.tamperedEdits).toEqual([{ blockIndex: 2, txIndex: 0, from: original, to: 500 }]);
    let undone;
    act(() => { undone = result.current.undoTamper(2); });
    expect(undone).toEqual({ success: true, restored: 1 });
    expect(result.current.chainValid).toBe(true);
    expect(statuses(result).every(status => status === 'valid')).toBe(true);
    expect(result.current.tamperedEdits).toEqual([]);
  });

  it('refuses to mine a new block while the chain is invalid', async () => {
    const { result } = await minedHook(2);
    act(() => result.current.tamperBlock(1, 0, 999));
    telemetry.track.mockClear();
    const outcome = await mine(result);
    expect(outcome).toMatchObject({ success: false, code: 'chain_invalid' });
    expect(outcome.error).toMatch(/chain is invalid/);
    expect(result.current.blocks).toHaveLength(3);
    expect(events('mining_started')).toHaveLength(0);
    expect(events('mining_failed')[0][1].reason).toBe('invalid_state');
    act(() => result.current.undoTamper(1));
    expect((await mine(result)).success).toBe(true);
  });
});

describe('remineBlock', () => {
  it('refuses out of order and names the block to repair first', async () => {
    const { result } = await minedHook();
    act(() => result.current.tamperBlock(2, 0, 999));
    const outcome = await remine(result, 3);
    expect(outcome).toEqual({ success: false, code: 'repair_first', repairFirst: 2, error: 'Re-mine block #2 first.' });
    expect((await remine(result, 0)).code).toBe('invalid_block');
    expect(statuses(result)).toEqual(['valid', 'valid', 'hash-mismatch', 'built-on-broken', 'built-on-broken']);
  });

  it('runs the miner race block by block until the chain is valid again', async () => {
    const { result } = await minedHook();
    act(() => result.current.tamperBlock(2, 0, 999));
    const transactions = result.current.blocks[2].transactions;
    telemetry.track.mockClear();
    const first = await remine(result, 2);
    expect(first).toMatchObject({ success: true, index: 2, epoch: 1, backedWon: null });
    expect(config.miners).toContain(first.winner);
    expect(first.block).toBe(result.current.blocks[2]);
    expect(first.block.transactions).toBe(transactions);
    expect(first.block.previousHash).toBe(result.current.blocks[1].hash);
    expect(result.current.raceWinner).toBe(first.winner);
    expect(result.current.miningProgress.iterations).toBeGreaterThan(0);
    expect(Object.keys(result.current.minerProgress)).toEqual(['Miner1', 'Miner2']);
    expect(result.current.isMining).toBe(false);
    expect(statuses(result)).toEqual(['valid', 'valid', 'valid', 'link-broken', 'built-on-broken']);
    expect((await remine(result, 4)).repairFirst).toBe(3);
    expect((await remine(result, 3)).success).toBe(true);
    expect(statuses(result)).toEqual(['valid', 'valid', 'valid', 'valid', 'link-broken']);
    expect((await mine(result)).code).toBe('chain_invalid');
    expect((await remine(result, 4)).success).toBe(true);
    expect(result.current.chainValid).toBe(true);
    expect(result.current.blocks).toHaveLength(5);
    // Re-mining is not a new block: no mining operation events.
    expect(events('mining_started')).toHaveLength(0);
    expect(events('mining_completed')).toHaveLength(0);
    expect((await mine(result)).success).toBe(true);
  });

  it('can be stopped and then leaves the block unchanged', async () => {
    const { result } = await minedHook(2);
    act(() => result.current.tamperBlock(1, 0, 999));
    const before = result.current.blocks[1].hash;
    let pending;
    act(() => { pending = result.current.remineBlock(1); });
    expect(result.current.isMining).toBe(true);
    act(() => result.current.cancelMining());
    let outcome;
    await act(async () => { await vi.runAllTimersAsync(); outcome = await pending; });
    expect(outcome).toEqual({ success: false, aborted: true });
    expect(result.current.blocks[1].hash).toBe(before);
    expect(statuses(result)[1]).toBe('hash-mismatch');
    expect(result.current.isMining).toBe(false);
    expect(events('mining_cancelled')).toHaveLength(0);
  });

  it('shares the lock with mining in both directions', async () => {
    const { result } = await minedHook(2);
    // A new block is running: re-mining is refused.
    let mining, blocked;
    act(() => { mining = result.current.mineBlock(); blocked = result.current.remineBlock(1); });
    await act(async () => { await vi.runAllTimersAsync(); expect((await mining).success).toBe(true); });
    expect(await blocked).toMatchObject({ success: false, code: 'busy' });
    // A re-mine is running: a second re-mine, mining and undo are refused.
    act(() => result.current.tamperBlock(1, 0, 999));
    let remining, second, undo;
    act(() => {
      remining = result.current.remineBlock(1);
      second = result.current.remineBlock(1);
      mining = result.current.mineBlock();
      undo = result.current.undoTamper(1);
    });
    await act(async () => { await vi.runAllTimersAsync(); expect((await remining).success).toBe(true); });
    expect(await second).toMatchObject({ success: false, code: 'busy' });
    expect(await mining).toMatchObject({ success: false, code: 'busy' });
    expect(undo).toMatchObject({ success: false, restored: 0 });
  });
});

describe('backing a miner', () => {
  it('reports whether the backed miner won and accepts only miners', async () => {
    const { result } = renderHook(() => useBlockchain(config));
    expect(result.current.backedMiner).toBeNull();
    let rejected;
    act(() => { rejected = result.current.backMiner('Wallet3'); });
    expect(rejected).toEqual({ success: false, error: 'Only a miner can be backed.' });
    expect(result.current.backedMiner).toBeNull();
    act(() => result.current.toggleMiner('Miner2')); // Only Miner1 races, so the winner is known.
    act(() => result.current.backMiner('Miner1'));
    expect(result.current.backedMiner).toBe('Miner1');
    expect(await mine(result)).toMatchObject({ success: true, winner: 'Miner1', backedWon: true });
    act(() => result.current.backMiner('Miner2'));
    expect(await mine(result)).toMatchObject({ success: true, backedWon: false });
    act(() => result.current.backMiner(null));
    expect(await mine(result)).toMatchObject({ success: true, backedWon: null });
  });

  it('counts the backing in place when the race started', async () => {
    const { result } = renderHook(() => useBlockchain(config));
    act(() => { result.current.toggleMiner('Miner2'); result.current.backMiner('Miner1'); });
    let pending, outcome;
    act(() => { pending = result.current.mineBlock(); result.current.backMiner('Miner2'); });
    await act(async () => { await vi.runAllTimersAsync(); outcome = await pending; });
    expect(outcome.backedWon).toBe(true);
    expect(result.current.backedMiner).toBe('Miner2');
  });

  it('reset clears the backing, edits and the last difficulty change', async () => {
    const { result } = await minedHook(1);
    act(() => { result.current.backMiner('Miner1'); result.current.tamperBlock(1, 0, 9); result.current.setDifficulty(2); });
    act(() => result.current.resetBlockchain());
    expect(result.current.backedMiner).toBeNull();
    expect(result.current.tamperedEdits).toEqual([]);
    expect(result.current.lastDifficultyChange).toBeNull();
    expect(result.current.blockStatus).toHaveLength(1);
  });
});

describe('automatic sample transfers', () => {
  it('selects a funded sender even when random picks would repeatedly hit an unfunded wallet', async () => {
    const { result } = renderHook(() => useBlockchain(config));
    act(() => result.current.toggleMiner('Miner2'));
    expect((await mine(result)).success).toBe(true);
    vi.mocked(Math.random).mockReturnValue(0.999);
    let generated;
    act(() => { generated = result.current.generateRandomTransactions(); });
    expect(generated).toEqual({ success: true, count: 10 });
    expect(result.current.memPool).toHaveLength(10);
    expect(result.current.memPool.every(tx => tx.amount >= 0.05 && tx.amount <= 0.1)).toBe(true);
    expect(result.current.chainValid).toBe(true);
  });
});

describe('halving and difficulty events', () => {
  it('accepts difficulties through ten, rejects invalid values, and stops a running search before mining again', async () => {
    const { result } = renderHook(() => useBlockchain(config));
    for (let difficulty = 1; difficulty <= 10; difficulty++) {
      act(() => result.current.setDifficulty(difficulty));
      expect(result.current.difficulty).toBe(difficulty);
    }
    for (const invalid of [0, 11, -1, 1.5, NaN, Infinity, 'x']) {
      act(() => result.current.setDifficulty(invalid));
      expect(result.current.difficulty).toBe(10);
    }
    let pending;
    act(() => { pending = result.current.mineBlock(); });
    await act(async () => { await vi.advanceTimersByTimeAsync(1); });
    expect(result.current.isMining).toBe(true);
    expect(result.current.miningProgress.iterations).toBeGreaterThan(0);
    act(() => result.current.setDifficulty(1));
    expect(result.current.difficulty).toBe(10);
    act(() => result.current.cancelMining());
    await act(async () => {
      await vi.runAllTimersAsync();
      expect(await pending).toEqual({ success: false, aborted: true });
    });
    expect(result.current.isMining).toBe(false);
    expect(result.current.blocks).toHaveLength(1);
    expect(events('mining_cancelled')).toHaveLength(1);
    expect(events('mining_completed')).toHaveLength(0);
    act(() => result.current.setDifficulty(1));
    expect((await mine(result)).success).toBe(true);
    expect(result.current.blocks).toHaveLength(2);
    expect(result.current.chainValid).toBe(true);
  });
  it('reports the halving epoch of each mined block', async () => {
    const { result } = renderHook(() => useBlockchain(config));
    const epochs = [];
    for (let i = 0; i < 4; i++) epochs.push((await mine(result)).epoch);
    expect(epochs).toEqual([0, 1, 1, 2]);
  });

  it('records the direction of each actual difficulty change', async () => {
    const { result } = await minedHook(1);
    expect(result.current.lastDifficultyChange).toBeNull();
    act(() => result.current.setDifficulty(3));
    expect(result.current.lastDifficultyChange).toEqual({ from: 1, to: 3, direction: 'up', height: 1, source: null });
    act(() => result.current.setDifficulty('2', { source: 'adjustment' }));
    expect(result.current.lastDifficultyChange).toEqual({ from: 3, to: 2, direction: 'down', height: 1, source: 'adjustment' });
    act(() => { result.current.setDifficulty(2); result.current.setDifficulty(11); result.current.setDifficulty('x'); });
    expect(result.current.lastDifficultyChange).toMatchObject({ from: 3, to: 2 });
  });
});
