import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { evidenceOf, merkleEvidence } from '../lib/missionEvidence';
import { activeMission, initialProgress, load, MISSIONS, reduce, STORAGE_KEY } from '../lib/missions';
import { sampleBlock, txidOf } from '../lib/merkleLab';
import { createTestClock, createWorkbenchSession, inlineSearch, memoryStore } from '../lib/workbenchSession';

// Mission evidence as App reports it: a test session (in-memory store, a clock only the test
// moves, the search inline) publishes its events, evidenceOf derives the evidence from them.
const fixture = vi.hoisted(() => ({ wallet: 0 }));
vi.mock('../lib/wallet', async original => ({ ...await original(), deriveWallet: () => {
  const privateKey = new Uint8Array(32);
  privateKey[31] = ++fixture.wallet;
  return { privateKey, seedPhrase: 'synthetic wallet fixture' };
} }));
vi.mock('../lib/telemetry', async original => ({ ...await original(), telemetry: { track: vi.fn(), reportError: vi.fn() } }));
const sessions = [];
beforeEach(() => { fixture.wallet = 0; vi.spyOn(Date, 'now').mockReturnValue(1767355200000); vi.spyOn(Math, 'random').mockReturnValue(0.5); });
afterEach(() => { for (const session of sessions.splice(0)) session.dispose(); vi.restoreAllMocks(); });
const start = id => ({ ...initialProgress(), completed: MISSIONS.slice(0, MISSIONS.findIndex(m => m.id === id)).map(m => m.id) });
const config = { participants: ['Miner Fixture', 'Wallet A', 'Wallet B'], miners: ['Miner Fixture'], miningDifficulty: 1 };

// The session and the evidence it gave since the last take().
function drive() {
  const clock = createTestClock(1_767_355_200_000);
  const session = createWorkbenchSession({ config, clock, store: memoryStore(), search: inlineSearch(clock) });
  sessions.push(session);
  const evidence = [];
  session.subscribe((events, snapshot) => { for (const event of events) evidence.push(...evidenceOf(event, snapshot)); });
  const { actions } = session;
  // A race only moves with the clock.
  const settle = async pending => { await clock.advance(0); return pending; };
  return {
    actions, settle, take: () => evidence.splice(0),
    async mine(count = 1) { for (let n = 0; n < count; n++) expect((await settle(actions.mine())).ok).toBe(true); },
    remine: index => settle(actions.remine(index))
  };
}
const apply = (progress, evidence) => evidence.reduce(reduce, progress);
const ofType = (evidence, type) => evidence.filter(entry => entry.type === type);

describe('new missions use real results', () => {
  it('requires a waiting low-fee parent, a selected higher-fee child and both in an accepted block', async () => {
    const { actions, take, mine } = drive();
    await mine(8);
    take();
    expect(actions.createTransaction('Miner Fixture', 'Wallet A', 0.5, undefined, 1).ok).toBe(true);
    for (let n = 0; n < 6; n++) expect(actions.createTransaction('Miner Fixture', 'Wallet B', 0.01, undefined, 5).ok).toBe(true);
    let progress = apply(start('get-payment-in'), take());
    expect(progress.step).toBe(1);
    const parent = progress.data.parent;
    expect(reduce(progress, { type: 'navigate' })).toBe(progress);
    expect(reduce(progress, { type: 'block_mined' })).toBe(progress);
    expect(actions.createTransaction('Wallet A', 'Wallet B', 0.1, undefined, 20).ok).toBe(true);
    const child = take();
    expect(child.map(entry => entry.type)).toEqual(['transaction_created', 'fee_market_checked']);
    progress = apply(progress, child);
    expect(progress.step).toBe(2);
    expect(progress.data.parent).toBe(parent);
    const [, fee] = child;
    expect(reduce(progress, fee)).toBe(progress);
    expect(reduce(progress, { ...fee, acceptedBlock: 'c'.repeat(64), confirmed: [parent] })).toEqual(start('get-payment-in'));
    await mine();
    const accepted = take();
    expect(accepted.map(entry => entry.type)).toEqual(['block_mined', 'fee_market_checked']);
    expect(accepted[1].confirmed).toEqual(expect.arrayContaining([parent, progress.data.child]));
    expect(apply(progress, accepted).completed).toContain('get-payment-in');
    actions.reset();
    const reset = apply(progress, take());
    expect(reset).toEqual(start('get-payment-in'));
    expect(apply(reset, accepted).completed).not.toContain('get-payment-in');
  });

  it('requires the same Merkle payment and one well-formed edited sibling, not navigation, text edits or reset', () => {
    const block = sampleBlock(16), proof = block.proofFor(5), txid = block.txids[5];
    const changed = (characters, level = 0) => proof.path.map((step, i) => i === level
      ? { ...step, hash: characters + step.hash.slice(characters.length) } : step);
    const flip = character => (character === '0' ? '1' : '0');
    const fresh = start('prove-a-payment');
    const good = merkleEvidence(txid, proof.path, block.root, proof.levels);
    expect(good).toMatchObject({ valid: true, editedSibling: false });
    const progress = reduce(fresh, good);
    expect(progress.step).toBe(1);
    const sibling = proof.path[0].hash;
    const bad = merkleEvidence(txid, changed(flip(sibling[0])), block.root, proof.levels, proof.path);
    expect(bad).toMatchObject({ valid: false, malformed: false, editedSibling: true });
    const noise = [
      { type: 'navigate' },
      // Not a hash, two changed characters, another payment's text.
      merkleEvidence(txid, changed('g'), block.root, proof.levels, proof.path),
      merkleEvidence(txid, changed(flip(sibling[0]) + flip(sibling[1])), block.root, proof.levels, proof.path),
      merkleEvidence(txidOf('Synthetic payment text'), changed(flip(sibling[0])), block.root, proof.levels, null)
    ];
    expect(noise.slice(1).map(entry => [entry.malformed, entry.editedSibling])).toEqual([[true, true], [false, false], [false, false]]);
    for (const entry of noise) expect(reduce(progress, entry)).toBe(progress);
    expect(reduce(progress, bad).completed).toContain('prove-a-payment');
    expect(reduce(reduce(progress, { type: 'lesson_reset' }), bad)).toEqual(fresh);
  });

  it('requires real re-mined hashes and links while the signed tip stays invalid; undo and cancellation cannot finish', async () => {
    const { actions, take, mine, remine } = drive();
    await mine();
    expect(actions.createTransaction('Miner Fixture', 'Wallet A', 0.5, undefined, 5).ok).toBe(true);
    await mine();
    take();
    expect(actions.tamper(2, 1, 0.4).ok).toBe(true);
    const tampered = take();
    expect(tampered).toEqual([{ type: 'block_tampered', blockIndex: 2, signed: true, newest: true }]);
    const progress = apply(start('test-a-signature'), tampered);
    expect(progress.step).toBe(1);
    const cancelled = actions.remine(2);
    actions.pause();
    expect((await remine(2)).ok).toBe(true);
    expect((await cancelled).ok).toBe(false);
    const remined = take();
    expect(remined).toEqual([{ type: 'block_remined', blockIndex: 2, chainValid: false, hashesAndLinksValid: true, signatureInvalid: true, editPresent: true }]);
    expect(apply(progress, remined).completed).toContain('test-a-signature');
    expect(actions.undo(2).ok).toBe(true);
    const undone = apply(progress, take());
    expect(undone).toEqual(start('test-a-signature'));
    expect((await remine(2)).ok).toBe(true);
    const after = take();
    expect(after).toEqual([expect.objectContaining({ type: 'block_remined', blockIndex: 2, editPresent: false })]);
    expect(apply(undone, after)).toEqual(start('test-a-signature'));
  });

  it('a rejected tamper does not advance a mission', async () => {
    const { actions, take, mine } = drive();
    await mine(2);
    take();
    const progress = start('forge-a-block');
    // The chain refuses a sub-satoshi amount; the session still publishes what it answered.
    const refused = actions.tamper(1, 0, 1.000000001);
    expect(refused).toMatchObject({ ok: false, reason: 'invalid-amount', events: [{ type: 'block-tampered', blockIndex: 1, applied: false }] });
    const rejected = take();
    expect(apply(progress, rejected)).toBe(progress);
    expect(rejected).toEqual([]);
    expect(actions.tamper(1, 0, 1).ok).toBe(true);
    const applied = take();
    expect(applied).toEqual([{ type: 'block_tampered', blockIndex: 1, signed: false, newest: false }]);
    expect(apply(progress, applied)).toMatchObject({ step: 1, data: { tampered: 1 } });
  });

  it('derives nothing from the demo block and tells a manual difficulty change from the retarget', async () => {
    const { actions, take, mine, settle } = drive();
    expect((await settle(actions.startDemo())).ok).toBe(true);
    expect(take()).toEqual([]);
    expect(actions.setDifficulty(2).ok).toBe(true);
    expect(actions.backMiner('Miner Fixture').ok).toBe(true);
    actions.reset();
    expect(take()).toEqual([{ type: 'difficulty_changed', direction: 'up', manual: true }, { type: 'miner_backed', name: 'Miner Fixture' }, { type: 'reset' }]);
    await mine(10);
    expect(ofType(take(), 'difficulty_changed')).toEqual([{ type: 'difficulty_changed', direction: 'up' }]);
  });

  it('keeps all nine old completions of a version 1 save and restarts new runtime evidence on reload', () => {
    // The track as version 1 stored it, before the Basics course and the move of Change the past.
    const old = ['change-fingerprint', 'earn-proof-of-work', 'send-first-coin', 'win-mining-race', 'change-the-past',
      'forge-a-block', 'survive-halving', 'beat-difficulty-adjustment', 'follow-stronger-chain'];
    const read = value => load({ getItem: key => key === STORAGE_KEY ? JSON.stringify(value) : null });
    const restored = read({ version: 1, completed: old, step: 2, data: { parent: 'a'.repeat(64) } });
    expect([...restored.completed].sort()).toEqual([...old].sort());
    // The Basics scenes that came later count as skipped: nobody is sent back into the course.
    const basics = MISSIONS.filter(m => m.chapter === 'basics' && !old.includes(m.id)).map(m => m.id);
    expect(restored.skipped).toEqual(basics);
    expect(restored.step).toBe(0);
    expect(restored.data).toEqual({});
    expect(activeMission(restored).id).toBe('get-payment-in');
  });
});
