import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { candidateHash, createBlockchain } from '../lib/blockchain';
import {
  bandWindow, buildBlockViews, candidateCopy, formatSeconds, healthSummary, linkInto, listBlocks, pendingLink,
  shortHash, stateOf, statusLabel, zerosOf
} from '../components/workbench/blockView';

const T0 = Date.parse('2026-01-02T12:00:00Z');
const HASH = '0080a3e897fb1e3839f43f95b033620ff7fb2f9739c8e415e5ce6e7df0726c4d';

function findNonce(candidate) {
  let nonce = 0;
  while (!candidateHash(candidate, nonce).startsWith(candidate.target)) nonce++;
  return nonce;
}
// Genesis plus four mined blocks, 2.5 s apart (deterministic clock).
function minedChain() {
  const chain = createBlockchain({ participants: ['Lars', 'Dana7'], miners: ['Lars'], miningDifficulty: 1 });
  for (let i = 1; i <= 4; i++) {
    const candidate = chain.prepareCandidate(chain.getActiveMiner(), { timestamp: T0 + i * 2500 });
    const nonce = findNonce(candidate);
    expect(chain.acceptBlock(candidate, nonce, candidateHash(candidate, nonce)).status).toBe('accepted');
  }
  return chain;
}
const snapshotViews = chain => buildBlockViews({
  blocks: [...chain.blockArray], blockStatus: chain.inspectBlocks(),
  participants: chain.participants.map(p => ({ ...p })), tamperedEdits: chain.getTamperedEdits()
});

beforeEach(() => { vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime(T0); });
afterEach(() => { vi.useRealTimers(); });

describe('shortHash and zerosOf', () => {
  it('keeps the first 6 and the last 2 characters', () => {
    expect(shortHash(HASH)).toBe('0080a3…4d');
    expect(shortHash('abc')).toBe('abc');
    expect(shortHash('')).toBe('');
    expect(shortHash(undefined)).toBe('');
  });
  it('counts leading zeros', () => {
    expect(zerosOf(HASH)).toBe(2);
    expect(zerosOf('0000a1')).toBe(4);
    expect(zerosOf('7c41e2')).toBe(0);
    expect(zerosOf(null)).toBe(0);
  });
  it('formats seconds and block lists', () => {
    expect(formatSeconds(7.08)).toBe('7.1 s');
    expect(formatSeconds(null)).toBeNull();
    expect(listBlocks([3])).toBe('#3');
    expect(listBlocks([3, 4, 5])).toBe('#3, #4 and #5');
  });
});

describe('buildBlockViews', () => {
  it('builds one view per block with miner, tx count, time and hashes', () => {
    const chain = minedChain();
    const views = snapshotViews(chain);
    expect(views).toHaveLength(5);
    expect(views[0]).toMatchObject({ index: 0, isGenesis: true, minerName: 'Genesis', minerKey: 'genesis', txCount: 1, seconds: null, prevHash: null });
    // The genesis time is a fixed launch moment, so block #1 has no mining interval.
    expect(views[1].seconds).toBeNull();
    expect(views[2]).toMatchObject({
      index: 2, minerName: 'Lars', minerKey: 'lars', txCount: 1, seconds: 2.5, status: 'valid', difficulty: 1,
      storedHash: chain.blockArray[2].hash, prevHash: chain.blockArray[1].hash, edited: false, edits: []
    });
    expect(views.every(view => view.status === 'valid')).toBe(true);
  });

  it('marks an edited block, its descendants and a broken link after re-mining', () => {
    const chain = minedChain();
    const original = chain.blockArray[2].transactions[0].outputs[0].value / 1e8;
    chain.tamperTransaction(2, 0, 1);
    let views = snapshotViews(chain);
    expect(views.map(view => view.status)).toEqual(['valid', 'valid', 'hash-mismatch', 'built-on-broken', 'built-on-broken']);
    expect(views[2].edits).toEqual([{ txIndex: 0, from: original, to: 1 }]);
    expect(views[2].edited).toBe(true);
    expect(views[2].computedHash).not.toBe(views[2].storedHash);
    expect(stateOf(views[2])).toBe('broken');
    expect(stateOf(views[3])).toBe('dependent');
    expect(linkInto(views[3], views[2]).state).toBe('dependent');
    expect(linkInto(views[4], views[3]).state).toBe('ok');

    const prepared = chain.prepareRemine(2);
    const nonce = findNonce(prepared.candidate);
    expect(chain.acceptRemine(prepared.candidate, nonce, candidateHash(prepared.candidate, nonce)).status).toBe('accepted');
    views = snapshotViews(chain);
    expect(views.map(view => view.status)).toEqual(['valid', 'valid', 'valid', 'link-broken', 'built-on-broken']);
    expect(linkInto(views[3], views[2])).toMatchObject({ state: 'broken', title: 'Link broken' });
  });

  it('passes signature-invalid through from blockStatus', () => {
    const blocks = [{ hash: 'aa', transactions: [], difficulty: 0, timestamp: 1 }, { hash: '00bb', previousHash: 'aa', transactions: [], difficulty: 2, timestamp: 1001 }];
    const views = buildBlockViews({ blocks, blockStatus: [{ status: 'valid' }, { status: 'signature-invalid', hashMatches: true, meetsTarget: true, linkIntact: true, signaturesValid: false }] });
    expect(views[1]).toMatchObject({ status: 'signature-invalid', minerName: 'Unknown miner', minerKey: 'other', seconds: null });
    expect(stateOf(views[1])).toBe('broken');
    expect(statusLabel('signature-invalid')).toBe('Signature invalid');
    expect(healthSummary(views).issues).toEqual(['#1 has a signature that no longer matches']);
  });
});

describe('healthSummary', () => {
  it('counts mined hashes and links of a valid chain', () => {
    const summary = healthSummary(snapshotViews(minedChain()));
    expect(summary).toMatchObject({ valid: true, minedCount: 4, hashOk: 4, linkOk: 4, target: '0', hashPhrase: 'hashes start with 0', issues: [], firstBroken: null });
  });
  it('names the changed block and the blocks built on it', () => {
    const chain = minedChain();
    chain.tamperTransaction(2, 0, 1);
    const summary = healthSummary(snapshotViews(chain));
    expect(summary.valid).toBe(false);
    expect(summary.firstBroken).toBe(2);
    expect(summary.hashOk).toBe(3);
    expect(summary.issues).toEqual(['#2 changed after mining', '#3 and #4 are unchanged but built on it']);
  });
  it('reports genesis only', () => {
    const chain = createBlockchain({ participants: ['Lars'], miners: ['Lars'] });
    expect(healthSummary(snapshotViews(chain))).toMatchObject({ valid: true, minedCount: 0, target: null });
  });
});

describe('band window and candidate copy', () => {
  it('hides older blocks only when the tier cannot show all of them', () => {
    expect(bandWindow(5)).toEqual({ a: { hidden: 2, visible: 3 }, b: { hidden: 0, visible: 5 }, c: { hidden: 0, visible: 5 } });
    expect(bandWindow(9)).toEqual({ a: { hidden: 6, visible: 3 }, b: { hidden: 5, visible: 4 }, c: { hidden: 4, visible: 5 } });
    expect(bandWindow(2).a.hidden).toBe(0);
  });
  it('words each candidate state', () => {
    expect(candidateCopy({ index: 5, txCount: 2, state: 'idle' })).toMatchObject({ tag: 'next', what: '2 tx waiting', down: 'Mine it below' });
    expect(candidateCopy({ index: 5, txCount: 2, state: 'mining', elapsedMs: 3400, attempts: 1480 })).toMatchObject({ tag: 'mining', time: '3.4 s', tries: '1,480' });
    expect(candidateCopy({ index: 5, txCount: 2, state: 'paused' }).tag).toBe('paused');
    expect(pendingLink(5, 'mining').title).toBe('Being mined');
  });
});
