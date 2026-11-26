// @vitest-environment jsdom
import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useWorkbenchSession } from '../hooks/useWorkbenchSession';
import { AUTO_TRANSACT_MS } from '../lib/workbenchSession';
import { telemetry } from '../lib/telemetry';
vi.mock('../lib/telemetry', async (importOriginal) => {
  const actual = await importOriginal();
  return { ...actual, telemetry: { track: vi.fn(), reportError: vi.fn() } };
});

// Real hashing at one leading zero: a block needs about 16 attempts.
const config = { participants: ['Miner1', 'Miner2', 'Wallet3'], miners: ['Miner1', 'Miner2'], miningDifficulty: 1, halvingEvent: 2 };
beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(new Date('2026-01-02T12:00:00Z')); vi.spyOn(Math, 'random').mockReturnValue(0.5); });
afterEach(() => { cleanup(); vi.useRealTimers(); vi.restoreAllMocks(); telemetry.track.mockReset(); telemetry.reportError.mockReset(); });

const snap = result => result.current.snapshot;
const actionsOf = result => result.current.session.actions;
const accepted = outcome => outcome.events.find(event => event.type === 'block-accepted');
const remined = outcome => outcome.events.find(event => event.type === 'block-remined');
async function settle(result, start) {
  let outcome;
  await act(async () => { const pending = start(actionsOf(result)); await vi.runAllTimersAsync(); outcome = await pending; });
  return outcome;
}
const mine = result => settle(result, actions => actions.mine());
const remine = (result, index) => settle(result, actions => actions.remine(index));
async function minedHook(blocks = 4) {
  const hook = renderHook(() => useWorkbenchSession(config));
  for (let i = 0; i < blocks; i++) expect((await mine(hook.result)).ok).toBe(true);
  return hook;
}
// The typed events the session publishes, in order.
function recorded(result) {
  const events = [];
  result.current.session.subscribe(published => events.push(...published));
  return events;
}
const statuses = result => snap(result).blockStatus.map(check => check.status);
const events = name => telemetry.track.mock.calls.filter(call => call[0] === name);

describe('createWallet', () => {
  it('adds a non-miner wallet with balance 0 to the snapshot', () => {
    const { result } = renderHook(() => useWorkbenchSession(config));
    let outcome;
    act(() => { outcome = actionsOf(result).createWallet('Dana7'); });
    expect(outcome).toMatchObject({ ok: true, error: null });
    expect(snap(result).balances.at(-1)).toMatchObject({ name: 'Dana7', balance: 0, isMiner: false });
    expect(snap(result).participants.map(p => p.name)).toContain('Dana7');
  });

  it('rejects duplicate (case-insensitive) and malformed names without publishing a change', () => {
    const { result } = renderHook(() => useWorkbenchSession(config));
    const before = snap(result).participants;
    let duplicate, malformed;
    act(() => { duplicate = actionsOf(result).createWallet('wallet3'); malformed = actionsOf(result).createWallet('x'); });
    expect(duplicate).toMatchObject({ ok: false, error: 'A wallet named wallet3 already exists.' });
    expect(malformed.ok).toBe(false);
    expect(snap(result).participants).toBe(before);
  });
});

describe('block status and tamper bookkeeping', () => {
  it('publishes block checks and edits, and undo restores validity', async () => {
    const { result } = await minedHook();
    expect(statuses(result)).toEqual(['valid', 'valid', 'valid', 'valid', 'valid']);
    expect(snap(result).tamperedEdits).toEqual([]);
    const original = snap(result).blocks[2].transactions[0].outputs[0].value / 1e8; // Halved coinbase: 1.5625
    expect(original).toBe(1.5625);
    act(() => { actionsOf(result).tamper(2, 0, 1); actionsOf(result).tamper(2, 0, 0.5); });
    expect(snap(result).chainValid).toBe(false);
    expect(statuses(result)).toEqual(['valid', 'valid', 'hash-mismatch', 'built-on-broken', 'built-on-broken']);
    expect(snap(result).blockStatus[3].linkIntact).toBe(true);
    expect(snap(result).tamperedEdits).toEqual([{ blockIndex: 2, txIndex: 0, from: original, to: 0.5 }]);
    let undone;
    act(() => { undone = actionsOf(result).undo(2); });
    expect(undone).toMatchObject({ ok: true, restored: 1 });
    expect(snap(result).chainValid).toBe(true);
    expect(statuses(result).every(status => status === 'valid')).toBe(true);
    expect(snap(result).tamperedEdits).toEqual([]);
  });

  it('refuses to mine a new block while the chain is invalid', async () => {
    const { result } = await minedHook(2);
    act(() => { actionsOf(result).tamper(1, 0, 1); });
    telemetry.track.mockClear();
    const outcome = await settle(result, actions => actions.mine());
    expect(outcome).toMatchObject({ ok: false, reason: 'chain_invalid' });
    expect(outcome.error).toMatch(/chain is invalid/);
    expect(snap(result).error).toBe(outcome.error);
    expect(snap(result).blocks).toHaveLength(3);
    expect(events('mining_started')).toHaveLength(0);
    expect(events('mining_failed')[0][1].reason).toBe('invalid_state');
    act(() => { actionsOf(result).undo(1); });
    expect((await mine(result)).ok).toBe(true);
  });
});

describe('remine', () => {
  it('refuses out of order and names the block to repair first', async () => {
    const { result } = await minedHook();
    act(() => { actionsOf(result).tamper(2, 0, 1); });
    const outcome = await remine(result, 3);
    expect(outcome).toMatchObject({ ok: false, reason: 'repair_first', repairFirst: 2, error: 'Re-mine block #2 first.' });
    expect((await remine(result, 0)).reason).toBe('invalid_block');
    expect(statuses(result)).toEqual(['valid', 'valid', 'hash-mismatch', 'built-on-broken', 'built-on-broken']);
  });

  it('runs the miner race block by block until the chain is valid again', async () => {
    const { result } = await minedHook();
    act(() => { actionsOf(result).tamper(2, 0, 1); });
    const transactions = snap(result).blocks[2].transactions;
    telemetry.track.mockClear();
    const first = await remine(result, 2);
    expect(first.ok).toBe(true);
    expect(remined(first)).toMatchObject({ blockIndex: 2, epoch: 1, backedWon: null });
    expect(config.miners).toContain(remined(first).winner);
    const block = remined(first).block;
    expect(block).toBe(snap(result).blocks[2]);
    expect(block.transactions.every((tx, index) => tx === transactions[index])).toBe(true);
    expect(block.previousHash).toBe(snap(result).blocks[1].hash);
    expect(snap(result).raceWinner).toBe(remined(first).winner);
    expect(snap(result).progress.total.iterations).toBeGreaterThan(0);
    expect(Object.keys(snap(result).progress.perMiner)).toEqual(['Miner1', 'Miner2']);
    expect(snap(result).run.kind).toBe('idle');
    expect(statuses(result)).toEqual(['valid', 'valid', 'valid', 'link-broken', 'built-on-broken']);
    expect((await remine(result, 4)).repairFirst).toBe(3);
    expect((await remine(result, 3)).ok).toBe(true);
    expect(statuses(result)).toEqual(['valid', 'valid', 'valid', 'valid', 'link-broken']);
    expect((await settle(result, actions => actions.mine())).reason).toBe('chain_invalid');
    expect((await remine(result, 4)).ok).toBe(true);
    expect(snap(result).chainValid).toBe(true);
    expect(snap(result).blocks).toHaveLength(5);
    // Re-mining is not a new block: no mining operation events.
    expect(events('mining_started')).toHaveLength(0);
    expect(events('mining_completed')).toHaveLength(0);
    expect((await mine(result)).ok).toBe(true);
  });

  it('can be stopped and then leaves the block unchanged', async () => {
    const { result } = await minedHook(2);
    act(() => { actionsOf(result).tamper(1, 0, 1); });
    const before = snap(result).blocks[1].hash;
    let pending;
    act(() => { pending = actionsOf(result).remine(1); });
    expect(snap(result).run).toEqual({ kind: 'remining', index: 1 });
    act(() => { actionsOf(result).pause(); });
    let outcome;
    await act(async () => { await vi.runAllTimersAsync(); outcome = await pending; });
    expect(outcome).toMatchObject({ ok: false, reason: 'aborted', events: [] });
    expect(snap(result).blocks[1].hash).toBe(before);
    expect(statuses(result)[1]).toBe('hash-mismatch');
    expect(snap(result).run.kind).toBe('idle');
    expect(events('mining_cancelled')).toHaveLength(0);
  });

  it('shares the lock with mining in both directions', async () => {
    const { result } = await minedHook(2);
    // A new block is running: re-mining is refused.
    let mining, blocked;
    act(() => { mining = actionsOf(result).mine(); blocked = actionsOf(result).remine(1); });
    await act(async () => { await vi.runAllTimersAsync(); expect((await mining).ok).toBe(true); });
    expect(await blocked).toMatchObject({ ok: false, reason: 'busy' });
    // A re-mine is running: a second re-mine, mining and undo are refused.
    act(() => { actionsOf(result).tamper(1, 0, 1); });
    let reminingBlock, second, undo;
    act(() => {
      reminingBlock = actionsOf(result).remine(1);
      second = actionsOf(result).remine(1);
      mining = actionsOf(result).mine();
      undo = actionsOf(result).undo(1);
    });
    await act(async () => { await vi.runAllTimersAsync(); expect((await reminingBlock).ok).toBe(true); });
    expect(await second).toMatchObject({ ok: false, reason: 'busy' });
    expect(await mining).toMatchObject({ ok: false, reason: 'busy' });
    expect(undo).toMatchObject({ ok: false, restored: 0 });
  });
});

describe('backing a miner', () => {
  it('reports whether the backed miner won and accepts only miners', async () => {
    const { result } = renderHook(() => useWorkbenchSession(config));
    expect(snap(result).backedMiner).toBeNull();
    let rejected;
    act(() => { rejected = actionsOf(result).backMiner('Wallet3'); });
    expect(rejected).toMatchObject({ ok: false, error: 'Choose a miner to back.' });
    expect(snap(result).backedMiner).toBeNull();
    act(() => { actionsOf(result).toggleMiner('Miner2'); }); // Only Miner1 races, so the winner is known.
    act(() => { actionsOf(result).backMiner('Miner1'); });
    expect(snap(result).backedMiner).toBe('Miner1');
    expect(accepted(await mine(result))).toMatchObject({ winner: 'Miner1', backedWon: true });
    act(() => { actionsOf(result).backMiner('Miner2'); });
    expect(accepted(await mine(result))).toMatchObject({ backedWon: false });
    act(() => { actionsOf(result).backMiner(null); });
    expect(accepted(await mine(result))).toMatchObject({ backedWon: null });
  });

  it('counts the backing in place when the race started', async () => {
    const { result } = renderHook(() => useWorkbenchSession(config));
    act(() => { actionsOf(result).toggleMiner('Miner2'); actionsOf(result).backMiner('Miner1'); });
    let pending, outcome;
    act(() => { pending = actionsOf(result).mine(); actionsOf(result).backMiner('Miner2'); });
    await act(async () => { await vi.runAllTimersAsync(); outcome = await pending; });
    expect(accepted(outcome).backedWon).toBe(true);
    expect(snap(result).backedMiner).toBe('Miner2');
  });

  it('reset clears the backing and the edits', async () => {
    const { result } = await minedHook(1);
    act(() => { actionsOf(result).backMiner('Miner1'); actionsOf(result).tamper(1, 0, 9); actionsOf(result).setDifficulty(2); });
    act(() => { actionsOf(result).reset(); });
    expect(snap(result).backedMiner).toBeNull();
    expect(snap(result).tamperedEdits).toEqual([]);
    expect(snap(result).lastRound).toBeNull();
    expect(snap(result).blockStatus).toHaveLength(1);
  });
});

describe('renameMiner', () => {
  it('renames a miner and moves its backing, last win and progress to the new name', async () => {
    const { result } = renderHook(() => useWorkbenchSession(config));
    act(() => { actionsOf(result).toggleMiner('Miner2'); actionsOf(result).backMiner('Miner1'); });
    expect(accepted(await mine(result))).toMatchObject({ winner: 'Miner1' });
    expect(snap(result).raceWinner).toBe('Miner1');
    expect(snap(result).progress.perMiner).toHaveProperty('Miner1');
    const progress = snap(result).progress.perMiner.Miner1;
    let outcome;
    act(() => { outcome = actionsOf(result).renameMiner('Miner1', 'Quill'); });
    expect(outcome).toMatchObject({ ok: true, error: null });
    expect(outcome.participant.name).toBe('Quill');
    expect(outcome.participant.colorKey).toBe('miner1');
    expect(snap(result).participants.map(p => p.name)).toEqual(['Quill', 'Miner2', 'Wallet3']);
    expect(snap(result).backedMiner).toBe('Quill');
    expect(snap(result).raceWinner).toBe('Quill');
    expect(snap(result).progress.perMiner).not.toHaveProperty('Miner1');
    expect(snap(result).progress.perMiner.Quill).toEqual(progress);
    expect(snap(result).lastRound).toMatchObject({ winner: 'Quill', perMiner: { Quill: progress } });
    // The backing that counts for the next race follows the rename.
    expect(accepted(await mine(result))).toMatchObject({ winner: 'Quill', backedWon: true });
  });

  it('refuses a taken name without publishing a change', () => {
    const { result } = renderHook(() => useWorkbenchSession(config));
    act(() => { actionsOf(result).backMiner('Miner1'); });
    const before = snap(result).participants;
    let outcome;
    act(() => { outcome = actionsOf(result).renameMiner('Miner1', 'miner2'); });
    expect(outcome).toMatchObject({ ok: false, error: 'A wallet named miner2 already exists.' });
    expect(snap(result).participants).toBe(before);
    expect(snap(result).backedMiner).toBe('Miner1');
  });

  it('refuses during a race', async () => {
    const { result } = renderHook(() => useWorkbenchSession(config));
    let pending, refused;
    act(() => { pending = actionsOf(result).mine(); refused = actionsOf(result).renameMiner('Miner1', 'Quill'); });
    expect(refused).toMatchObject({ ok: false, error: 'Wait until the current block is found.' });
    await act(async () => { await vi.runAllTimersAsync(); await pending; });
    expect(snap(result).participants.map(p => p.name)).toEqual(['Miner1', 'Miner2', 'Wallet3']);
  });
});

describe('automatic sample transfers', () => {
  it('selects a funded sender even when random picks would repeatedly hit an unfunded wallet', async () => {
    const { result } = renderHook(() => useWorkbenchSession(config));
    act(() => { actionsOf(result).toggleMiner('Miner2'); });
    expect((await mine(result)).ok).toBe(true);
    vi.mocked(Math.random).mockReturnValue(0.999);
    const published = recorded(result);
    act(() => { actionsOf(result).setAutoTransact(true); });
    await act(async () => { await vi.advanceTimersByTimeAsync(AUTO_TRANSACT_MS); });
    expect(published.filter(event => event.type === 'transaction-created')).toEqual([{ type: 'transaction-created', source: 'random', count: 8 }]);
    expect(snap(result).memPool).toHaveLength(8);
    expect(snap(result).memPool.every(tx => tx.outputs[0].value >= 5_000_000 && tx.outputs[0].value <= 10_000_000)).toBe(true);
    expect(snap(result).chainValid).toBe(true);
  });
});

describe('halving and difficulty events', () => {
  it('accepts difficulties through ten, rejects invalid values, and stops a running search before mining again', async () => {
    const { result } = renderHook(() => useWorkbenchSession(config));
    for (let difficulty = 1; difficulty <= 10; difficulty++) {
      act(() => { actionsOf(result).setDifficulty(difficulty); });
      expect(snap(result).difficulty).toBe(difficulty);
    }
    for (const invalid of [0, 11, -1, 1.5, NaN, Infinity, 'x']) {
      act(() => { actionsOf(result).setDifficulty(invalid); });
      expect(snap(result).difficulty).toBe(10);
    }
    let pending;
    act(() => { pending = actionsOf(result).mine(); });
    await act(async () => { await vi.advanceTimersByTimeAsync(1); });
    expect(snap(result).run.kind).toBe('mining');
    expect(snap(result).progress.total.iterations).toBeGreaterThan(0);
    act(() => { actionsOf(result).setDifficulty(1); });
    expect(snap(result).difficulty).toBe(10);
    act(() => { actionsOf(result).pause(); });
    await act(async () => {
      await vi.runAllTimersAsync();
      expect(await pending).toMatchObject({ ok: false, reason: 'aborted' });
    });
    expect(snap(result).run.kind).toBe('idle');
    expect(snap(result).blocks).toHaveLength(1);
    expect(events('mining_cancelled')).toHaveLength(1);
    expect(events('mining_completed')).toHaveLength(0);
    act(() => { actionsOf(result).setDifficulty(1); });
    expect((await mine(result)).ok).toBe(true);
    expect(snap(result).blocks).toHaveLength(2);
    expect(snap(result).chainValid).toBe(true);
  });
  it('reports the halving epoch of each mined block', async () => {
    const { result } = renderHook(() => useWorkbenchSession(config));
    const epochs = [];
    for (let i = 0; i < 4; i++) epochs.push(accepted(await mine(result)).epoch);
    expect(epochs).toEqual([0, 1, 1, 2]);
  });

  it('reports each actual difficulty change with its direction and source', async () => {
    const { result } = await minedHook(1);
    const published = recorded(result);
    const changes = () => published.filter(event => event.type === 'difficulty-changed');
    act(() => { actionsOf(result).setDifficulty(3); });
    expect(changes()).toEqual([{ type: 'difficulty-changed', from: 1, to: 3, source: 'manual' }]);
    // Lowering a chain with mined blocks needs a new chain (ADR 0004); the chain says so and stays.
    let answer;
    act(() => { answer = actionsOf(result).setDifficulty(2, { source: 'manual' }); });
    expect(answer).toMatchObject({ ok: false, reason: 'needs-reset', outcome: 'needs-reset' });
    expect(published.at(-1)).toEqual({ type: 'difficulty-needs-reset', from: 3, to: 2 });
    expect(snap(result).difficulty).toBe(3);
    expect(snap(result).loweringStartsNewChain).toBe(true);
    act(() => { actionsOf(result).setDifficulty('2', { source: 'auto' }); });
    expect(changes().at(-1)).toEqual({ type: 'difficulty-changed', from: 3, to: 2, source: 'auto' });
    act(() => { actionsOf(result).setDifficulty(2); actionsOf(result).setDifficulty(11); actionsOf(result).setDifficulty('x'); });
    expect(changes()).toHaveLength(2);
  });

  it('retargets when the tenth block is accepted and reports it as automatic', async () => {
    const { result } = renderHook(() => useWorkbenchSession(config));
    const published = recorded(result);
    // The fake clock stands still, so every block arrives at once: far faster than the 10 s target.
    for (let i = 0; i < 9; i++) expect(accepted(await mine(result)).retarget).toBeNull();
    expect(published.filter(event => event.type === 'difficulty-changed')).toEqual([]);
    const tenth = await mine(result);
    expect(accepted(tenth).retarget).toEqual({ from: 1, to: 2 });
    expect(accepted(tenth).block.retarget).toEqual({ from: 1, to: 2 });
    expect(snap(result).difficulty).toBe(2);
    expect(tenth.events.map(event => event.type)).toEqual(['block-accepted', 'difficulty-changed']);
    expect(tenth.events[1]).toEqual({ type: 'difficulty-changed', from: 1, to: 2, source: 'auto' });
    expect(events('difficulty_changed').at(-1)).toEqual(['difficulty_changed', { previous: 1, value: 2 }]);
    expect(snap(result).nextBlock).toMatchObject({ height: 11, difficulty: 2, check: { at: 20, in: 10 } });
  });

  it('keeps the target block time as a chain setting through a reset', () => {
    const { result } = renderHook(() => useWorkbenchSession(config));
    expect(snap(result).targetSeconds).toBe(10);
    act(() => { actionsOf(result).setTargetBlockTime(25); });
    expect(snap(result).targetSeconds).toBe(25);
    expect(events('settings_changed')).toEqual([['settings_changed', { setting: 'target_block_time', value: 25 }]]);
    act(() => { actionsOf(result).setTargetBlockTime(25); });
    act(() => { actionsOf(result).setTargetBlockTime(0); });
    expect(events('settings_changed')).toHaveLength(1);
    act(() => { actionsOf(result).reset(); });
    expect(snap(result).targetSeconds).toBe(25);
  });
});

describe('tamper', () => {
  it('passes the chain answer through and publishes and reports only an applied edit', async () => {
    const { result } = await minedHook(1);
    let answer;
    act(() => { answer = actionsOf(result).tamper(1, 0, 3.125000001); });
    expect(answer).toMatchObject({ ok: false, reason: 'invalid-amount', events: [{ type: 'block-tampered', applied: false }] });
    expect(snap(result).tamperedEdits).toEqual([]);
    expect(events('tamper_applied')).toHaveLength(0);
    act(() => { answer = actionsOf(result).tamper(1, 0, 1); });
    expect(answer).toMatchObject({ ok: true, events: [{ type: 'block-tampered', blockIndex: 1, txIndex: 0, applied: true, signed: false, newest: true }] });
    expect(snap(result).tamperedEdits).toHaveLength(1);
    expect(events('tamper_applied')).toEqual([['tamper_applied', { block_height: 1 }]]);
  });
});
