import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AUTO_MINE_MS, AUTO_TRANSACT_MS, createTestClock, createWorkbenchSession, inlineSearch, memoryStore } from '../lib/workbenchSession';

// The workbench session through its interface: a test clock drives the races and the
// Auto-mine and Auto-transact timers, an in-memory store keeps the saved chain.
const fixture = vi.hoisted(() => ({ wallet: 0 }));
vi.mock('../lib/wallet', async importOriginal => ({ ...await importOriginal(), deriveWallet: () => {
  const privateKey = new Uint8Array(32);
  privateKey[31] = ++fixture.wallet;
  return { privateKey, seedPhrase: 'synthetic wallet fixture' };
} }));
vi.mock('../lib/telemetry', async importOriginal => ({ ...await importOriginal(), telemetry: { track: vi.fn(), reportError: vi.fn() } }));

const config = { participants: ['Miner One', 'Miner Two', 'Wallet Three'], miners: ['Miner One', 'Miner Two'], miningDifficulty: 1, halvingEvent: 21 };
const sessions = [];
function start({ store = memoryStore(), ...options } = {}) {
  const clock = createTestClock(1_000);
  const session = createWorkbenchSession({ config, clock, store, search: inlineSearch(clock), ...options });
  sessions.push(session);
  const published = [];
  session.subscribe((events, snapshot) => published.push({ events, snapshot, at: clock.now() }));
  return { clock, store, session, actions: session.actions, published, now: () => session.getSnapshot() };
}
// One race to its end: the search only moves when the clock does.
async function finish(clock, pending) {
  await clock.advance(0);
  return pending;
}
const typesOf = outcome => outcome.events.map(event => event.type);

beforeEach(() => { fixture.wallet = 0; vi.spyOn(Math, 'random').mockReturnValue(0.5); });
afterEach(() => { for (const session of sessions.splice(0)) session.dispose(); vi.restoreAllMocks(); });

describe('Auto-mine', () => {
  it('starts the next race after the interval when a block is found, and not before', async () => {
    const { clock, actions, published, now } = start();
    actions.setAutoMine(true);
    const first = await finish(clock, actions.mine());
    expect(first.ok).toBe(true);
    expect(typesOf(first)).toEqual(['block-accepted']);
    expect(now()).toMatchObject({ run: { kind: 'idle' }, repeating: true });
    expect(now().blocks).toHaveLength(2);
    const found = clock.now();
    await clock.advance(AUTO_MINE_MS - 1);
    expect(now().blocks).toHaveLength(2);
    expect(published.some(entry => entry.snapshot.run.kind === 'mining' && entry.snapshot.run.index === 2)).toBe(false);
    await clock.advance(1);
    const next = published.find(entry => entry.snapshot.run.kind === 'mining' && entry.snapshot.run.index === 2);
    expect(next?.at).toBe(found + AUTO_MINE_MS);
    expect(now().blocks).toHaveLength(3);
    expect(now().repeating).toBe(true);
  });

  it('Play without Auto-mine mines one block and ends the run', async () => {
    const { clock, actions, now } = start();
    expect((await finish(clock, actions.mine())).ok).toBe(true);
    expect(now()).toMatchObject({ run: { kind: 'idle' }, repeating: false });
    await clock.advance(10 * AUTO_MINE_MS);
    expect(now().blocks).toHaveLength(2);
    expect(clock.pending()).toBe(0);
  });

  it('switched off during a block lets the block finish and starts no further race', async () => {
    const { clock, actions, now } = start();
    actions.setAutoMine(true);
    const pending = actions.mine();
    actions.setAutoMine(false);
    expect(now().run.kind).toBe('mining');
    expect((await finish(clock, pending)).ok).toBe(true);
    await clock.advance(10 * AUTO_MINE_MS);
    expect(now().blocks).toHaveLength(2);
  });
});

describe('cancel', () => {
  it('Pause stops the running race; nothing it would find changes the chain', async () => {
    const { clock, actions, now } = start();
    actions.setAutoMine(true);
    const pending = actions.mine();
    expect(now().run).toEqual({ kind: 'mining', index: 1 });
    actions.pause();
    expect(now()).toMatchObject({ run: { kind: 'idle' }, repeating: false, settings: { autoMine: true } });
    const outcome = await finish(clock, pending);
    expect(outcome).toMatchObject({ ok: false, reason: 'aborted', events: [] });
    await clock.advance(10 * AUTO_MINE_MS);
    expect(now().blocks).toHaveLength(1);
    expect(now().error).toBe('');
  });

  it('Pause between automatic blocks clears the scheduled race', async () => {
    const { clock, actions, now } = start();
    actions.setAutoMine(true);
    await finish(clock, actions.mine());
    expect(clock.pending()).toBe(1);
    actions.pause();
    expect(clock.pending()).toBe(0);
    await clock.advance(10 * AUTO_MINE_MS);
    expect(now().blocks).toHaveLength(2);
  });
});

describe('the last round', () => {
  it('is set in the commit that ends the race, with each miner\'s final progress', async () => {
    const { clock, actions, published } = start();
    const outcome = await finish(clock, actions.mine());
    const [accepted] = outcome.events;
    const end = published.find(entry => entry.snapshot.blocks.length === 2);
    expect(end.snapshot.run.kind).toBe('idle');
    expect(end.snapshot.lastRound).toMatchObject({ index: 1, winner: accepted.winner, nonce: accepted.block.nonce, difficulty: 1 });
    expect(Object.keys(end.snapshot.lastRound.perMiner)).toEqual(['Miner One', 'Miner Two']);
    expect(end.snapshot.lastRound.attempts).toBe(end.snapshot.progress.total.iterations);
    expect(outcome.snapshot.lastRound).toBe(end.snapshot.lastRound);
  });
});

describe('renaming a miner', () => {
  it('is refused during a race and afterwards moves backing, last round and progress to the new name', async () => {
    const { clock, actions, now } = start();
    actions.toggleMiner('Miner Two'); // Only Miner One races, so the winner is known.
    actions.backMiner('Miner One');
    const pending = actions.mine();
    expect(actions.renameMiner('Miner One', 'Quill')).toMatchObject({ ok: false, reason: 'busy', error: 'Wait until the current block is found.' });
    expect(now().participants.map(p => p.name)).toEqual(['Miner One', 'Miner Two', 'Wallet Three']);
    expect((await finish(clock, pending)).events[0]).toMatchObject({ winner: 'Miner One', backedWon: true });
    const renamed = actions.renameMiner('Miner One', 'Quill');
    expect(renamed).toMatchObject({ ok: true, events: [{ type: 'miner-renamed', from: 'Miner One', to: 'Quill' }] });
    expect(now()).toMatchObject({ backedMiner: 'Quill', raceWinner: 'Quill', lastRound: { winner: 'Quill' } });
    expect(Object.keys(now().lastRound.perMiner)).toEqual(['Quill']);
    expect(Object.keys(now().progress.perMiner)).toEqual(['Quill']);
    // The backing that counts for the next race follows the rename.
    expect((await finish(clock, actions.mine())).events[0]).toMatchObject({ winner: 'Quill', backedWon: true });
  });
});

describe('run kinds', () => {
  it('tells the demo, a new block and a re-mine apart, and a re-mine leaves the run alone', async () => {
    const { clock, actions, now } = start();
    const demo = actions.startDemo();
    expect(now().run).toEqual({ kind: 'setup', index: 1 });
    expect((await finish(clock, demo)).events[0]).toMatchObject({ type: 'block-accepted', index: 1, demo: true });
    const block = actions.mine();
    expect(now().run).toEqual({ kind: 'mining', index: 2 });
    expect((await finish(clock, block)).events[0]).toMatchObject({ type: 'block-accepted', index: 2, demo: false });
    const tampered = actions.tamper(1, 0, 1);
    expect(tampered.events).toEqual([expect.objectContaining({ type: 'block-tampered', blockIndex: 1, applied: true, newest: false })]);
    expect(now().chainValid).toBe(false);
    actions.setAutoMine(true);
    const repair = actions.remine(1);
    expect(now().run).toEqual({ kind: 'remining', index: 1 });
    const remined = await finish(clock, repair);
    expect(remined.events).toEqual([expect.objectContaining({ type: 'block-remined', blockIndex: 1, hashesAndLinksValid: false, chainValid: false })]);
    expect(now()).toMatchObject({ run: { kind: 'idle' }, repeating: false, lastRound: { index: 1 } });
    expect(clock.pending()).toBe(0);
  });

  it('refuses a second race while one runs, whatever its kind', async () => {
    const { clock, actions } = start();
    const block = actions.mine();
    expect(await actions.remine(1)).toMatchObject({ ok: false, reason: 'busy' });
    expect(await actions.startDemo()).toMatchObject({ ok: false, reason: 'busy' });
    await finish(clock, block);
  });
});

describe('saving', () => {
  it('saves after every change of the chain, and only then', async () => {
    const { clock, store, actions, now } = start();
    const saves = () => store.saves;
    expect(saves()).toBe(0);
    actions.createWallet('Dana7');
    expect(saves()).toBe(1);
    expect(store.saved.participants.map(p => p.name)).toContain('Dana7');
    await finish(clock, actions.mine());
    expect(saves()).toBe(2);
    expect(store.saved.blocks).toHaveLength(1); // The saved form leaves out genesis.
    actions.setAutoMine(true);
    actions.setAutoMine(false);
    actions.backMiner('Miner One');
    actions.setSlowMotion(true);
    expect(saves()).toBe(2);
    actions.tamper(1, 0, 1);
    actions.undo(1);
    actions.setDifficulty(2);
    actions.setTargetBlockTime(20);
    expect(saves()).toBe(6);
    expect(now().saveState).toBe('saved');
    actions.reset();
    expect(saves()).toBe(7);
    expect(store.saved.blocks).toHaveLength(0);
  });

  it('starts the next session from the saved chain', async () => {
    const first = start();
    await finish(first.clock, first.actions.mine());
    const second = start({ store: first.store });
    expect(second.now().restored).toBe(true);
    expect(second.now().blocks.map(block => block.hash)).toEqual(first.now().blocks.map(block => block.hash));
  });
});

describe('Auto-transact', () => {
  it('refills only an empty mempool, after its interval', async () => {
    const { clock, actions, now } = start();
    await finish(clock, actions.startDemo());
    const waiting = now().memPool.length;
    expect(waiting).toBe(2);
    actions.setAutoTransact(true);
    await clock.advance(10 * AUTO_TRANSACT_MS);
    expect(now().memPool).toHaveLength(waiting);
    await finish(clock, actions.mine());
    expect(now().memPool).toHaveLength(0);
    await clock.advance(AUTO_TRANSACT_MS - 1);
    expect(now().memPool).toHaveLength(0);
    await clock.advance(1);
    const refilled = now().memPool.length;
    expect(refilled).toBeGreaterThan(0);
    await clock.advance(10 * AUTO_TRANSACT_MS);
    expect(now().memPool).toHaveLength(refilled);
  });

  it('waits while a race runs and stops when switched off', async () => {
    const { clock, actions, now } = start();
    await finish(clock, actions.startDemo());
    await finish(clock, actions.mine());
    actions.setAutoTransact(true);
    const pending = actions.mine();
    await clock.advance(0);
    await pending;
    expect(now().memPool).toHaveLength(0);
    actions.setAutoTransact(false);
    await clock.advance(10 * AUTO_TRANSACT_MS);
    expect(now().memPool).toHaveLength(0);
  });
});
