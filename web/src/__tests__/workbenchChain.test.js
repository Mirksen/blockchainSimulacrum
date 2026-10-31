import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { candidateHash, createBlockchain } from '../lib/blockchain';

const T0 = Date.parse('2026-01-02T12:00:00Z');
const setup = (overrides = {}) => createBlockchain({
  participants: ['Miner1', 'Wallet2'], miners: ['Miner1'], miningDifficulty: 1, ...overrides
});
function findNonce(candidate, meetsTarget = true) {
  let nonce = 0;
  while (candidateHash(candidate, nonce).startsWith(candidate.target) !== meetsTarget) nonce++;
  return nonce;
}
function mineNext(chain) {
  const candidate = chain.prepareCandidate(chain.getActiveMiner(), { timestamp: T0 + chain.blockArray.length });
  const nonce = findNonce(candidate);
  expect(chain.acceptBlock(candidate, nonce, candidateHash(candidate, nonce)).status).toBe('accepted');
}
function remine(chain, index) {
  const prepared = chain.prepareRemine(index);
  expect(prepared.success).toBe(true);
  const nonce = findNonce(prepared.candidate);
  const outcome = chain.acceptRemine(prepared.candidate, nonce, candidateHash(prepared.candidate, nonce));
  expect(outcome.status).toBe('accepted');
  return outcome;
}
// Genesis plus four mined blocks, each holding only its coinbase transaction.
function minedChain(overrides) {
  const chain = setup(overrides);
  for (let i = 0; i < 4; i++) mineNext(chain);
  return chain;
}
const statuses = chain => chain.inspectBlocks().map(check => check.status);

beforeEach(() => { vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime(T0); });
afterEach(() => { vi.useRealTimers(); });

describe('addWallet', () => {
  it('adds a non-miner wallet that starts without coins', () => {
    const chain = setup();
    const result = chain.addWallet('Dana7');
    expect(result).toMatchObject({ success: true, error: null });
    expect(result.participant.isMiner).toBe(false);
    expect(chain.getAllBalances().at(-1)).toMatchObject({ name: 'Dana7', balance: 0, isMiner: false });
    expect(chain.getActiveMiners().map(p => p.name)).toEqual(['Miner1']);
    expect(chain.calculateConfirmedBalance(chain.getParticipantByName('Dana7').publicKey)).toBe(0);
  });

  it('accepts exactly 2 and 16 letters or digits and trims surrounding spaces', () => {
    const chain = setup();
    expect(chain.addWallet('ab').success).toBe(true);
    expect(chain.addWallet('A234567890123456').success).toBe(true);
    expect(chain.addWallet('  Eve9  ')).toMatchObject({ success: true });
    expect(chain.getParticipantByName('Eve9')).toBeTruthy();
  });

  it.each(['', 'a', 'A2345678901234567', 'Two Words', 'dash-name', 'Ünlaut', null, undefined, 42])(
    'rejects the name %j without adding a wallet', name => {
      const chain = setup();
      const result = chain.addWallet(name);
      expect(result.success).toBe(false);
      expect(result.error).toMatch(/2–16 letters or digits/);
      expect(chain.participants).toHaveLength(2);
    });

  it('rejects a name that already exists in any letter case', () => {
    const chain = setup();
    expect(chain.addWallet('wallet2')).toEqual({ success: false, error: 'A wallet named wallet2 already exists.' });
    expect(chain.addWallet('Dana7').success).toBe(true);
    expect(chain.addWallet('DANA7').success).toBe(false);
    expect(chain.participants.map(p => p.name)).toEqual(['Miner1', 'Wallet2', 'Dana7']);
  });
});

describe('inspectBlocks', () => {
  it('reports genesis alone as valid with an intact link and met target', () => {
    const [genesis] = setup().inspectBlocks();
    expect(genesis).toEqual({ index: 0, storedHash: genesis.computedHash, computedHash: genesis.computedHash,
      hashMatches: true, meetsTarget: true, linkIntact: true, signaturesValid: true, builtOnBroken: false, status: 'valid', issue: null });
  });

  it('reports every block of an untouched chain as valid', () => {
    const chain = minedChain();
    expect(statuses(chain)).toEqual(['valid', 'valid', 'valid', 'valid', 'valid']);
    expect(chain.firstBrokenBlock()).toBeNull();
  });

  it('marks a changed block as hash-mismatch and its descendants as built on a broken block, never link-broken', () => {
    const chain = minedChain();
    const stored = chain.blockArray[2].hash;
    chain.tamperTransaction(2, 0, 999);
    const checks = chain.inspectBlocks();
    expect(checks.map(check => check.status)).toEqual(['valid', 'valid', 'hash-mismatch', 'built-on-broken', 'built-on-broken']);
    expect(checks[2]).toMatchObject({ storedHash: stored, hashMatches: false, meetsTarget: true, linkIntact: true, builtOnBroken: false });
    expect(checks[2].computedHash).not.toBe(stored);
    // Descendants still store the predecessor's stored hash, so their links are intact.
    expect(checks[3]).toMatchObject({ hashMatches: true, linkIntact: true, builtOnBroken: true });
    expect(checks[4]).toMatchObject({ hashMatches: true, linkIntact: true, builtOnBroken: true });
    expect(chain.firstBrokenBlock()).toBe(2);
  });

  it('calls a correctly computed hash that misses its target a hash mismatch', () => {
    const chain = minedChain();
    const block = chain.blockArray[1];
    const prefix = block.previousHash + block.txRoot + block.timestamp + block.difficulty;
    block.nonce = findNonce({ prefix, target: '0' }, false);
    block.hash = block.createHash();
    const checks = chain.inspectBlocks();
    expect(checks[1]).toMatchObject({ hashMatches: true, meetsTarget: false, status: 'hash-mismatch' });
    // #2 still stores the new hash of #1, so only the ancestry is broken.
    expect(checks[2]).toMatchObject({ linkIntact: false, status: 'link-broken' });
  });

  it('marks the successor of a changed genesis hash as link-broken', () => {
    const chain = minedChain();
    chain.blockArray[0].hash = 'f'.repeat(64);
    expect(statuses(chain)).toEqual(['hash-mismatch', 'link-broken', 'built-on-broken', 'built-on-broken', 'built-on-broken']);
  });
});

describe('tamper bookkeeping', () => {
  it('remembers the original amount once and reports the current edit', () => {
    const chain = minedChain();
    expect(chain.getTamperedEdits()).toEqual([]);
    chain.tamperTransaction(3, 0, 50);
    chain.tamperTransaction(3, 0, 999);
    chain.tamperTransaction(1, 0, 7);
    expect(chain.getTamperedEdits()).toEqual([
      { blockIndex: 1, txIndex: 0, from: 3.125, to: 7 },
      { blockIndex: 3, txIndex: 0, from: 3.125, to: 999 }
    ]);
  });

  it('ends an edit when the original amount is set again', () => {
    const chain = minedChain();
    chain.tamperTransaction(2, 0, 999);
    chain.tamperTransaction(2, 0, 3.125);
    expect(chain.getTamperedEdits()).toEqual([]);
    expect(chain.isChainValid()).toBe(true);
  });

  it('ignores edits of blocks or transactions that do not exist', () => {
    const chain = minedChain();
    expect(chain.tamperTransaction(9, 0, 1)).toBe(false);
    expect(chain.tamperTransaction(2, 5, 1)).toBe(false);
    expect(chain.getTamperedEdits()).toEqual([]);
  });

  it('undo restores the originals of one block and with them its validity', () => {
    const chain = minedChain();
    chain.tamperTransaction(2, 0, 999);
    chain.tamperTransaction(4, 0, 1);
    expect(chain.undoTamper(2)).toEqual({ success: true, restored: 1 });
    expect(chain.blockArray[2].transactions[0].outputs[0].value).toBe(312500000);
    expect(chain.getTamperedEdits()).toEqual([{ blockIndex: 4, txIndex: 0, from: 3.125, to: 1 }]);
    expect(statuses(chain)).toEqual(['valid', 'valid', 'valid', 'valid', 'hash-mismatch']);
    expect(chain.undoTamper(4)).toEqual({ success: true, restored: 1 });
    expect(chain.isChainValid()).toBe(true);
    expect(statuses(chain).every(status => status === 'valid')).toBe(true);
  });

  it('undo of a block without edits changes nothing', () => {
    const chain = minedChain();
    const before = JSON.stringify(chain.blockArray);
    expect(chain.undoTamper(2)).toEqual({ success: false, restored: 0 });
    expect(JSON.stringify(chain.blockArray)).toBe(before);
  });
});

describe('re-mining a historical block', () => {
  it('refuses genesis and blocks that do not exist', () => {
    const chain = minedChain();
    for (const index of [0, 5, -1, 1.5, '2']) {
      expect(chain.prepareRemine(index)).toMatchObject({ success: false, code: 'invalid_block' });
    }
  });

  it('refuses a block when an earlier block is broken and names the block to repair first', () => {
    const chain = minedChain();
    chain.tamperTransaction(2, 0, 1);
    expect(chain.prepareRemine(3)).toEqual({ success: false, code: 'repair_first', repairFirst: 2, error: 'Re-mine block #2 first.' });
    expect(chain.prepareRemine(4)).toMatchObject({ repairFirst: 2 });
    remine(chain, 2);
    expect(chain.prepareRemine(4)).toEqual({ success: false, code: 'repair_first', repairFirst: 3, error: 'Re-mine block #3 first.' });
  });

  it('re-links the block, keeps its transactions and leaves the next link broken until that block is re-mined', () => {
    const chain = minedChain();
    chain.tamperTransaction(2, 0, 1);
    const block = chain.blockArray[2];
    const { transactions, timestamp } = block;
    const state = () => JSON.stringify({ memPool: chain.memPool, reward: chain.blockReward, log: chain.miningLog,
      won: chain.participants.map(p => p.blocksWon) });
    const before = state();
    const { block: remined } = remine(chain, 2);
    expect(remined).toBe(block);
    expect(block.transactions).toBe(transactions);
    expect(block.transactions[0].outputs[0].value).toBe(100000000);
    expect(block.timestamp).toBe(timestamp);
    expect(block.previousHash).toBe(chain.blockArray[1].hash);
    expect(block.hash).toBe(block.createHash());
    expect(block.hash.startsWith('0')).toBe(true);
    expect(state()).toBe(before);
    expect(statuses(chain)).toEqual(['valid', 'valid', 'valid', 'link-broken', 'built-on-broken']);
    remine(chain, 3);
    expect(statuses(chain)).toEqual(['valid', 'valid', 'valid', 'valid', 'link-broken']);
    remine(chain, 4);
    expect(statuses(chain).every(status => status === 'valid')).toBe(true);
    // The edit stays recorded: undoing it now breaks the re-mined block again.
    expect(chain.getTamperedEdits()).toHaveLength(1);
    chain.undoTamper(2);
    expect(statuses(chain)).toEqual(['valid', 'valid', 'hash-mismatch', 'built-on-broken', 'built-on-broken']);
  });

  it('repairs the hash of a forged transfer but never its signature', () => {
    const chain = minedChain();
    chain.createTransaction('Miner1', 'Wallet2', 1, 0);
    mineNext(chain);
    const index = chain.blockArray.length - 1;
    const transfer = chain.blockArray[index].transactions.findIndex(tx => !tx.isCoinbase);
    chain.tamperTransaction(index, transfer, 2);
    expect(statuses(chain).at(-1)).toBe('hash-mismatch');
    remine(chain, index);
    const check = chain.inspectBlocks().at(-1);
    expect(check).toMatchObject({ hashMatches: true, linkIntact: true, signaturesValid: false, status: 'signature-invalid' });
    expect(chain.canExtend()).toBe(false);
    chain.undoTamper(index);
    expect(statuses(chain).at(-1)).toBe('hash-mismatch');
  });

  it('meets the current target and records it as the block difficulty', () => {
    const chain = minedChain();
    chain.tamperTransaction(1, 0, 1);
    chain.miningDifficulty = 2;
    const { block } = remine(chain, 1);
    expect(block.difficulty).toBe(2);
    expect(block.hash.startsWith('00')).toBe(true);
    expect(chain.inspectBlocks()[1]).toMatchObject({ hashMatches: true, meetsTarget: true, status: 'valid' });
  });

  it('may re-mine a valid block; a new hash breaks the next link', () => {
    const chain = minedChain();
    // Same header and same search: the same proof, so nothing changes.
    const hash = chain.blockArray[3].hash;
    remine(chain, 3);
    expect(chain.blockArray[3].hash).toBe(hash);
    expect(statuses(chain)).toEqual(['valid', 'valid', 'valid', 'valid', 'valid']);
    chain.miningDifficulty = 2;
    remine(chain, 4);
    expect(statuses(chain)).toEqual(['valid', 'valid', 'valid', 'valid', 'valid']);
    remine(chain, 3);
    expect(chain.blockArray[3].hash).not.toBe(hash);
    expect(statuses(chain)).toEqual(['valid', 'valid', 'valid', 'valid', 'link-broken']);
  });

  it('rejects wrong or insufficient proofs without changing the block', () => {
    const chain = minedChain();
    chain.tamperTransaction(2, 0, 999);
    const { candidate } = chain.prepareRemine(2);
    const before = JSON.stringify(chain.blockArray);
    const good = findNonce(candidate);
    expect(chain.acceptRemine(candidate, good + 1, candidateHash(candidate, good))).toEqual({ status: 'rejected', reason: 'hash-mismatch' });
    const miss = findNonce(candidate, false);
    expect(chain.acceptRemine(candidate, miss, candidateHash(candidate, miss))).toEqual({ status: 'rejected', reason: 'target-miss' });
    expect(JSON.stringify(chain.blockArray)).toBe(before);
  });

  it('treats a proof as stale when the block or its predecessor changed after preparing', () => {
    const chain = minedChain();
    chain.tamperTransaction(3, 0, 999);
    const { candidate } = chain.prepareRemine(3);
    const nonce = findNonce(candidate);
    const hash = candidateHash(candidate, nonce);
    chain.undoTamper(3);
    expect(chain.acceptRemine(candidate, nonce, hash)).toEqual({ status: 'stale' });
    chain.tamperTransaction(3, 0, 999);
    chain.miningDifficulty = 2; // A new target gives #2 a new hash.
    remine(chain, 2);
    expect(chain.blockArray[2].hash).not.toBe(candidate.previousHash);
    const before = JSON.stringify(chain.blockArray[3]);
    expect(chain.acceptRemine(candidate, nonce, hash)).toEqual({ status: 'stale' });
    expect(JSON.stringify(chain.blockArray[3])).toBe(before);
  });
});

describe('canExtend', () => {
  it('allows a new block only while every edit of history leaves the chain valid', () => {
    const chain = minedChain();
    expect(chain.canExtend()).toBe(true);
    chain.tamperTransaction(2, 0, 999);
    expect(chain.canExtend()).toBe(false);
    chain.undoTamper(2);
    expect(chain.canExtend()).toBe(true);
    chain.miningDifficulty = 2;
    remine(chain, 3); // A valid block with a new hash: #4 now has a broken link.
    expect(chain.canExtend()).toBe(false);
    remine(chain, 4);
    expect(chain.canExtend()).toBe(true);
  });
});

describe('epochAt', () => {
  it('counts the halvings applied up to and including a height', () => {
    const chain = minedChain({ halvingEvent: 2 });
    expect([0, 1, 2, 3, 4].map(height => chain.epochAt(height))).toEqual([0, 0, 1, 1, 2]);
  });
});
