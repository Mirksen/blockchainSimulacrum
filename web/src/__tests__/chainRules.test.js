import { describe, expect, it } from 'vitest';
import { Blockchain, candidateHash, createBlockchain, MAX_MINERS } from '../lib/blockchain';
import { deserializeChain, serializeChain } from '../lib/chainStore';
import { meetsTarget } from '../../../shared/bitcoin-block.mjs';

// The chain module owns every rule the workbench applies (ARC-1): the retarget, ADR 0004,
// the next block's subsidy, the saved form, the tamper result and the miner limit.
// Header times are synthetic and passed in, so no test reads the clock.
const T0 = Date.parse('2026-01-02T12:00:00Z') / 1000;
const setup = (overrides = {}) => createBlockchain({ participants: ['Miner', 'Wallet'], miners: ['Miner'], miningDifficulty: 1, ...overrides });

// Mines the next block `seconds` after the newest one and returns acceptBlock's answer.
function mineNext(chain, seconds = 10) {
  const time = chain.blockArray.length === 1 ? T0 : chain.blockArray.at(-1).time + seconds;
  const candidate = chain.prepareCandidate(chain.getActiveMiner(), { time });
  let nonce = 0;
  while (!meetsTarget(candidateHash(candidate, nonce), candidate.bits)) nonce++;
  const outcome = chain.acceptBlock(candidate, nonce, candidateHash(candidate, nonce));
  expect(outcome.status).toBe('accepted');
  return outcome;
}
const mineTo = (chain, height, seconds) => {
  let outcome = null;
  while (chain.blockArray.length - 1 < height) outcome = mineNext(chain, seconds);
  return outcome;
};
const roundTrip = saved => deserializeChain(JSON.parse(JSON.stringify(saved)));

describe('retarget on accepting a block', () => {
  it('raises the difficulty at height 10 after fast blocks and records it on that block', () => {
    const chain = setup({ miningDifficulty: 1 });
    const ninth = mineTo(chain, 9, 2);
    expect(ninth.retarget).toBeNull();
    expect(chain.miningDifficulty).toBe(1);
    const tenth = mineNext(chain, 2);
    expect(tenth.retarget).toEqual({ from: 1, to: 2 });
    expect(tenth.block.retarget).toEqual({ from: 1, to: 2 });
    expect(chain.miningDifficulty).toBe(2);
    expect(chain.nextBlock().difficulty).toBe(2);
  });

  it('lowers it after slow blocks and keeps it inside the band', () => {
    const slow = setup({ miningDifficulty: 2 });
    expect(mineTo(slow, 10, 20).retarget).toEqual({ from: 2, to: 1 });
    expect(slow.blockArray[10].retarget).toEqual({ from: 2, to: 1 });
    expect(slow.miningDifficulty).toBe(1);
    const steady = setup({ miningDifficulty: 1 });
    expect(mineTo(steady, 10, 10).retarget).toBeNull();
    expect(steady.miningDifficulty).toBe(1);
  });

  it('measures against the chain target block time', () => {
    const chain = setup({ miningDifficulty: 2 });
    expect(chain.setTargetSeconds(30)).toEqual({ outcome: 'applied' });
    // 20 s per block is fast for a 30 s target (below 21 s), slow for the default 10 s.
    expect(mineTo(chain, 10, 20).retarget).toEqual({ from: 2, to: 3 });
    expect(chain.setTargetSeconds(0)).toEqual({ outcome: 'invalid' });
    expect(chain.setTargetSeconds(30)).toEqual({ outcome: 'unchanged' });
  });
});

describe('requestDifficulty (ADR 0004)', () => {
  it('needs a reset only to lower a chain with a block after genesis, never for the automatic adjustment', () => {
    const chain = setup({ miningDifficulty: 3 });
    expect(chain.loweringStartsNewChain()).toBe(false);
    expect(chain.requestDifficulty(2, { source: 'manual' })).toEqual({ outcome: 'applied' });
    expect(chain.requestDifficulty(1)).toEqual({ outcome: 'applied' });
    mineNext(chain);
    expect(chain.loweringStartsNewChain()).toBe(true);
    expect(chain.requestDifficulty(2, { source: 'manual' })).toEqual({ outcome: 'applied' });
    expect(chain.requestDifficulty(1, { source: 'manual' })).toEqual({ outcome: 'needs-reset' });
    expect(chain.requestDifficulty(1)).toEqual({ outcome: 'needs-reset' });
    expect(chain.miningDifficulty).toBe(2);
    expect(chain.requestDifficulty(1, { source: 'auto' })).toEqual({ outcome: 'applied' });
    expect(chain.miningDifficulty).toBe(1);
  });

  it('answers unchanged and invalid without changing the chain', () => {
    const chain = setup({ miningDifficulty: 2 });
    expect(chain.requestDifficulty(2)).toEqual({ outcome: 'unchanged' });
    for (const value of [0, 11, 2.5, Number.NaN, 'x']) expect(chain.requestDifficulty(value)).toEqual({ outcome: 'invalid' });
    expect(chain.miningDifficulty).toBe(2);
  });

  it('keeps the halving interval inside its bounds', () => {
    const chain = setup({ halvingEvent: 21 });
    expect(chain.setHalvingInterval(1)).toEqual({ outcome: 'invalid' });
    expect(chain.setHalvingInterval(101)).toEqual({ outcome: 'invalid' });
    expect(chain.setHalvingInterval(21)).toEqual({ outcome: 'unchanged' });
    expect(chain.setHalvingInterval(2)).toEqual({ outcome: 'applied' });
    expect(chain.halvingEvent).toBe(2);
  });
});

describe('nextBlock', () => {
  it('halves the subsidy at a halving height, as the block then pays', () => {
    const chain = setup({ halvingEvent: 3 });
    expect(chain.nextBlock()).toEqual({ height: 1, subsidy: 312500000, difficulty: 1, bits: chain.nextBlock().bits,
      halving: { at: 3, in: 3, subsidy: 156250000 }, check: { at: 10, in: 10 } });
    mineTo(chain, 2);
    const next = chain.nextBlock();
    expect(next.height % chain.halvingEvent).toBe(0);
    expect(next.subsidy).toBe(156250000);
    expect(next.halving).toEqual({ at: 3, in: 1, subsidy: 156250000 });
    // The newest block still paid the full reward; the next one pays what nextBlock said.
    expect(chain.blockReward).toBe(3.125);
    expect(mineNext(chain).block.subsidy).toBe(next.subsidy);
    expect(chain.nextBlock()).toMatchObject({ height: 4, subsidy: 156250000, halving: { at: 6, in: 3, subsidy: 78125000 } });
  });

  it('answers whether one more miner may join', () => {
    const chain = setup();
    while (chain.canAddMiner()) expect(chain.addMiner(`Extra${chain.participants.length}`).success).toBe(true);
    expect(chain.participants.filter(p => p.isMiner)).toHaveLength(MAX_MINERS);
    expect(chain.addMiner('OneTooMany').success).toBe(false);
  });
});

describe('saved form', () => {
  it('derives every subsidy from the halved blocks, so a raised saved subsidy shows as an overclaim', () => {
    const chain = setup({ halvingEvent: 2 });
    mineTo(chain, 3);
    // Block #3 follows the halving at #2 and may pay 1.5625; its edited coinbase claims 3.125.
    expect(chain.blockArray[3].subsidy).toBe(156250000);
    expect(chain.tamperTransaction(3, 0, 3.125)).toEqual({ applied: true, reason: null });
    expect(chain.inspectBlocks()[3].issue).toEqual({ reason: 'coinbase-overclaim', txIndex: 0 });
    const saved = serializeChain(chain);
    // A save edited by hand raises the subsidy to cover the claim.
    saved.blocks[2].subsidy = 312500000;
    const restored = roundTrip(saved);
    expect(restored.blockArray.map(block => block.subsidy)).toEqual([undefined, 312500000, 156250000, 156250000]);
    expect(restored.inspectBlocks()[3].issue).toEqual({ reason: 'coinbase-overclaim', txIndex: 0 });
    expect(restored.blockReward).toBe(1.5625);
    expect(restored.nextBlock().subsidy).toBe(78125000);
  });

  it('loads a save written before the target block time was saved with 10 s, and keeps a set one', () => {
    const chain = setup();
    mineTo(chain, 2);
    expect(chain.setTargetSeconds(25)).toEqual({ outcome: 'applied' });
    const saved = serializeChain(chain);
    expect(saved.targetSeconds).toBe(25);
    expect(roundTrip(saved).targetSeconds).toBe(25);
    const { targetSeconds, ...old } = saved;
    expect(targetSeconds).toBe(25);
    const restored = roundTrip(old);
    expect(restored.targetSeconds).toBe(10);
    expect(restored.isChainValid()).toBe(true);
    expect(restored.blockArray).toHaveLength(3);
  });

  it('keeps recorded retargets, and marks them on a save written before they were recorded', () => {
    const chain = setup({ miningDifficulty: 1 });
    mineTo(chain, 11, 2);
    expect(chain.blockArray[10].retarget).toEqual({ from: 1, to: 2 });
    const saved = serializeChain(chain);
    expect(roundTrip(saved).blockArray[10].retarget).toEqual({ from: 1, to: 2 });
    const old = structuredClone(saved);
    old.blocks.forEach(record => { delete record.retarget; });
    const restored = roundTrip(old);
    expect(restored.blockArray[10].retarget).toEqual({ from: 1, to: 2 });
    expect(restored.blockArray.slice(1).filter(block => block.retarget)).toHaveLength(1);
  });

  it('keeps private bookkeeping inside the chain module', () => {
    const chain = setup();
    mineTo(chain, 2);
    chain.tamperTransaction(1, 0, 1);
    const restored = Blockchain.fromSaved(JSON.parse(JSON.stringify(chain.toSaved())));
    expect(restored.getTamperedEdits()).toEqual(chain.getTamperedEdits());
    expect(restored.canExtend()).toBe(false);
    expect(restored.undoTamper(1)).toEqual({ success: true, restored: 1 });
    expect(restored.isChainValid()).toBe(true);
  });
});

describe('tamperTransaction', () => {
  it('names why an edit was refused and changes nothing', () => {
    const chain = setup();
    mineNext(chain);
    const before = chain.blockArray[1].hash;
    expect(chain.tamperTransaction(1, 0, 3.125000001)).toEqual({ applied: false, reason: 'invalid-amount' });
    expect(chain.tamperTransaction(1, 4, 1)).toEqual({ applied: false, reason: 'no-output' });
    expect(chain.getTamperedEdits()).toEqual([]);
    expect(chain.canExtend()).toBe(true);
    expect(chain.blockArray[1].createHash()).toBe(before);
  });
});
