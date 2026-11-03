import { describe, expect, it } from 'vitest';
import { BLOCK_SPACE, candidateHash, createBlockchain, DEFAULT_FEE_RATE, MAX_BLOCK_BYTES } from '../lib/blockchain';
import { meetsTarget } from '../../../shared/bitcoin-block.mjs';

// Test helper: search nonces for the miner's candidate, then hand the proof to the chain.
function mineNext(chain, miner = chain.getActiveMiner()) {
  const candidate = chain.prepareCandidate(miner);
  let nonce = 0;
  while (!meetsTarget(candidateHash(candidate, nonce), candidate.bits)) nonce++;
  const outcome = chain.acceptBlock(candidate, nonce, candidateHash(candidate, nonce));
  expect(outcome.status).toBe('accepted');
  return { candidate, block: outcome.block };
}

// Miner, then A, B and C with one confirmed coin each.
function fundedWallets() {
  const chain = createBlockchain({ participants: ['Miner', 'A', 'B', 'C'], miners: ['Miner'], miningDifficulty: 1 });
  mineNext(chain);
  for (const name of ['A', 'B', 'C']) chain.createTransactionAtRate('Miner', name, 0.5, 1);
  mineNext(chain);
  expect(chain.memPool).toHaveLength(0);
  return chain;
}
const txidOf = tx => tx.createHash();
const rateOf = (chain, tx) => chain.blockTemplate().entries[chain.memPool.indexOf(tx)].rate;

describe('fee rate pricing', () => {
  it('prices a transfer by its size, never below the chosen rate', () => {
    const chain = fundedWallets();
    for (const [rate, reference] of [[1, ''], [5, 'Coffee'], [20, 'x'.repeat(80)]]) {
      const plan = chain.planAtRate('A', 0.01, rate, reference);
      const tx = chain.createTransactionAtRate('A', 'B', 0.01, rate, reference);
      expect(plan.fee).toBe(Math.ceil(rate * plan.size));
      // The estimate assumes the longest signature, so the real transaction is at most a few bytes smaller.
      expect(tx.size).toBeLessThanOrEqual(plan.size);
      expect(plan.size - tx.size).toBeLessThanOrEqual(2);
      expect(rateOf(chain, tx)).toBeGreaterThanOrEqual(rate);
    }
  });
  it('defaults to the normal rate and previews nothing it cannot fund', () => {
    const chain = fundedWallets();
    expect(chain.planAtRate('A', 0.01).feeRate).toBe(DEFAULT_FEE_RATE);
    expect(chain.planAtRate('A', 0.5, 20)).toMatchObject({ funded: false, feeRate: 20 });
    expect(chain.planAtRate('Nobody', 0.01, 5)).toBeNull();
  });
  it.each([NaN, -1, Infinity])('refuses the fee rate %s and keeps the mempool as it was', rate => {
    const chain = fundedWallets();
    expect(() => chain.createTransactionAtRate('A', 'B', 0.01, rate)).toThrow(/Fee rate/);
    expect(chain.memPool).toHaveLength(0);
  });
  it('refuses a transfer that cannot pay its fee instead of sending it without one', () => {
    const chain = fundedWallets();
    expect(() => chain.createTransactionAtRate('A', 'B', 0.5, 20)).toThrow(/Insufficient funds/);
    expect(chain.memPool).toHaveLength(0);
  });
});

describe('block template', () => {
  it('fills the room with the highest fee per byte first', () => {
    const chain = fundedWallets();
    const low = chain.createTransactionAtRate('A', 'B', 0.01, 1);
    const high = chain.createTransactionAtRate('B', 'C', 0.01, 20);
    const normal = chain.createTransactionAtRate('C', 'A', 0.01, 5);
    const template = chain.blockTemplate(500);
    expect(template.included.map(i => chain.memPool[i])).toEqual([high, normal]);
    expect(template.waiting.map(i => chain.memPool[i])).toEqual([low]);
    expect(template.reasons[chain.memPool.indexOf(low)]).toBe('full');
    expect(template.bytes).toBe(high.size + normal.size);
    expect(template.bytes).toBeLessThanOrEqual(500);
    expect(template.fees).toBe(template.entries[1].fee + template.entries[2].fee);
  });
  it('takes a child only after its parent, and says when the parent is the reason it waits', () => {
    const chain = fundedWallets();
    const parent = chain.createTransactionAtRate('A', 'B', 0.01, 1);
    const child = chain.createTransactionAtRate('A', 'C', 0.01, 20);
    expect(child.inputs.map(input => input.txid)).toContain(txidOf(parent));
    const roomForBoth = chain.blockTemplate(1000);
    expect(roomForBoth.included.map(i => chain.memPool[i])).toEqual([parent, child]);
    const roomForNone = chain.blockTemplate(200);
    expect(roomForNone.included).toEqual([]);
    expect(roomForNone.reasons).toEqual({ 0: 'full', 1: 'parent' });
    const roomForOne = chain.blockTemplate(250);
    expect(roomForOne.included.map(i => chain.memPool[i])).toEqual([parent]);
    expect(roomForOne.reasons).toEqual({ 1: 'full' });
  });
  it('lets a child with a high fee pull its cheap parent ahead of others (child pays for parent)', () => {
    const chain = fundedWallets();
    const normalB = chain.createTransactionAtRate('B', 'C', 0.01, 5);
    const normalC = chain.createTransactionAtRate('C', 'B', 0.01, 5);
    const parent = chain.createTransactionAtRate('A', 'B', 0.01, 1);
    const child = chain.createTransactionAtRate('A', 'C', 0.01, 20);
    // Room for two: the parent alone (1 sat/B) would lose to both normal transfers, its package with the child wins.
    const template = chain.blockTemplate(460);
    expect(template.included.map(i => chain.memPool[i])).toEqual([parent, child]);
    // Both pay 5 sat/B nominally; a signature one byte shorter decides their order, so compare the set.
    expect([...template.waiting].sort((a, b) => a - b).map(i => chain.memPool[i])).toEqual([normalB, normalC]);
    expect(Object.values(template.reasons)).toEqual(['full', 'full']);
    // Room for three: the package first, then one normal transfer.
    const roomForThree = chain.blockTemplate(700).included.map(i => chain.memPool[i]);
    expect(roomForThree.slice(0, 2)).toEqual([parent, child]);
    expect([normalB, normalC]).toContain(roomForThree[2]);
    expect(roomForThree).toHaveLength(3);
  });
  it('ranks a child by its package: a cheap parent drags a good child below a plain transfer', () => {
    const chain = fundedWallets();
    const plain = chain.createTransactionAtRate('B', 'C', 0.01, 4);
    const parent = chain.createTransactionAtRate('A', 'B', 0.01, 1);
    const child = chain.createTransactionAtRate('A', 'C', 0.01, 5);
    // The child pays 5 sat/B, its package with the parent only about 3: the plain 4 sat/B transfer goes first.
    const template = chain.blockTemplate(460);
    expect(template.included.map(i => chain.memPool[i])).toEqual([plain, parent]);
    expect(template.reasons[chain.memPool.indexOf(child)]).toBe('full');
  });
  it('mines what fits into a block of at most MAX_BLOCK_BYTES and keeps the rest for the next', () => {
    const chain = fundedWallets();
    const sent = Array.from({ length: 8 }, (_, i) => chain.createTransactionAtRate(['A', 'B', 'C'][i % 3], ['B', 'C', 'A'][i % 3], 0.01, [1, 2, 5, 10, 20][i % 5], 'Demo transfer'));
    const template = chain.blockTemplate();
    expect(template.space).toBe(BLOCK_SPACE);
    expect(template.included.length).toBeGreaterThan(0);
    expect(template.waiting.length).toBeGreaterThan(0);
    const { candidate, block } = mineNext(chain);
    expect(candidate.transactions.slice(1)).toEqual(template.included.map(i => sent[i]));
    expect(candidate.transactions[0].outputs[0].value).toBe(candidate.subsidy + template.fees);
    const blockBytes = 80 + 1 + block.transactions.reduce((sum, tx) => sum + tx.size, 0);
    expect(blockBytes).toBeLessThanOrEqual(MAX_BLOCK_BYTES);
    expect(chain.isChainValid()).toBe(true);
    expect(chain.memPool).toEqual(sent.filter((_, i) => template.waiting.includes(i)));
    while (chain.memPool.length) mineNext(chain);
    expect(chain.isChainValid()).toBe(true);
    expect(chain.blockArray.flatMap(b => b.transactions).filter(tx => sent.includes(tx))).toHaveLength(sent.length);
  });
});
