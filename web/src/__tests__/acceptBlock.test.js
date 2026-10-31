import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { candidateHash, createBlockchain, transactionRoot } from '../lib/blockchain';
import { headerHex, meetsTarget as meetsBits } from '../../../shared/bitcoin-block.mjs';

const T0 = Date.parse('2026-01-02T12:00:00Z') / 1000;
const setup = (overrides = {}) => createBlockchain({
  participants: ['Miner One', 'Miner Two', 'Wallet Three'], miners: ['Miner One', 'Miner Two'],
  startingBalance: 2, miningDifficulty: 1, ...overrides
});
const miner = (chain, name = 'Miner One') => chain.getParticipantByName(name);
function findNonce(candidate, meetsTarget = true) {
  let nonce = 0;
  while (meetsBits(candidateHash(candidate, nonce), candidate.bits) !== meetsTarget) nonce++;
  return nonce;
}
function mineNext(chain, who = miner(chain)) {
  const candidate = chain.prepareCandidate(who, { time: T0 + chain.blockArray.length });
  const nonce = findNonce(candidate);
  const outcome = chain.acceptBlock(candidate, nonce, candidateHash(candidate, nonce));
  expect(outcome.status).toBe('accepted');
  return outcome;
}
const state = chain => JSON.stringify({
  blocks: chain.blockArray, memPool: chain.memPool, reward: chain.blockReward, log: chain.miningLog,
  won: chain.participants.map(p => p.blocksWon)
});

beforeEach(() => { vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime(T0 * 1000); });
afterEach(() => { vi.useRealTimers(); });

describe('prepareCandidate', () => {
  it('describes one immutable block template whose header matches the block hash', () => {
    const chain = setup();
    chain.createTransaction('Wallet Three', 'Miner Two', 0.5, 0.25, 'synthetic transfer');
    const candidate = chain.prepareCandidate(miner(chain), { time: T0 });
    expect(Object.isFrozen(candidate)).toBe(true);
    expect(Object.isFrozen(candidate.transactions)).toBe(true);
    expect(candidate).toMatchObject({ previousHash: chain.blockArray[0].hash, time: T0, difficulty: 1, bits: 0x200fffff,
      reward: 3.125, halved: false, minerPublicKey: miner(chain).publicKey, height: 1 });
    expect(candidate.transactions).toHaveLength(2);
    expect(candidate.transactions[0]).toMatchObject({ sender: null, recipient: miner(chain).publicKey, amount: 3.375,
      transactionFee: 0, referenceNumber: 'Mining Reward #1' });
    expect(candidate.txRoot).toBe(transactionRoot(candidate.transactions));
    expect(candidate.header).toBe(headerHex({ version: 1, previousHash: candidate.previousHash, merkleRoot: candidate.txRoot,
      time: T0, bits: candidate.bits, nonce: 0 }).slice(0, 152));
    expect(chain.memPool).toHaveLength(1);
  });
});

describe('acceptBlock', () => {
  it('rejects a hash that belongs to a different nonce without changing the chain', () => {
    const chain = setup();
    const candidate = chain.prepareCandidate(miner(chain), { time: T0 });
    const nonce = findNonce(candidate);
    const before = state(chain);
    expect(chain.acceptBlock(candidate, nonce + 1, candidateHash(candidate, nonce)))
      .toEqual({ status: 'rejected', reason: 'hash-mismatch' });
    expect(state(chain)).toBe(before);
  });

  it('rejects a correctly computed hash that misses the target without changing the chain', () => {
    const chain = setup();
    const candidate = chain.prepareCandidate(miner(chain), { time: T0 });
    const nonce = findNonce(candidate, false);
    const hash = candidateHash(candidate, nonce);
    expect(meetsBits(hash, candidate.bits)).toBe(false);
    const before = state(chain);
    expect(chain.acceptBlock(candidate, nonce, hash)).toEqual({ status: 'rejected', reason: 'target-miss' });
    expect(state(chain)).toBe(before);
  });

  it('reports a valid proof as stale once the tip moved after prepare, leaving the chain unchanged', () => {
    const chain = setup();
    const late = chain.prepareCandidate(miner(chain, 'Miner Two'), { time: T0 });
    mineNext(chain, miner(chain, 'Miner One'));
    const before = state(chain);
    const nonce = findNonce(late);
    expect(chain.acceptBlock(late, nonce, candidateHash(late, nonce))).toEqual({ status: 'stale' });
    expect(state(chain)).toBe(before);
    expect(chain.blockArray).toHaveLength(2);
    expect(miner(chain, 'Miner Two').blocksWon).toBe(0);
  });

  it('appends a valid block that keeps the chain valid and records the win and log once', () => {
    const chain = setup();
    chain.createTransaction('Wallet Three', 'Miner Two', 0.5, 0.25, 'synthetic transfer');
    const candidate = chain.prepareCandidate(miner(chain), { time: T0 });
    const nonce = findNonce(candidate);
    const hash = candidateHash(candidate, nonce);
    const outcome = chain.acceptBlock(candidate, nonce, hash);
    expect(outcome.status).toBe('accepted');
    const { block } = outcome;
    expect(chain.blockArray).toHaveLength(2);
    expect(chain.blockArray[1]).toBe(block);
    expect(block).toMatchObject({ time: T0, previousHash: candidate.previousHash, difficulty: 1, txRoot: candidate.txRoot,
      nonce, hash, halved: false });
    expect(block.createHash()).toBe(hash);
    expect(block.isValid()).toBe(true);
    expect(chain.isChainValid()).toBe(true);
    expect(chain.memPool).toEqual([]);
    expect(miner(chain).blocksWon).toBe(1);
    expect(miner(chain, 'Miner Two').blocksWon).toBe(0);
    expect(chain.miningLog).toEqual([{ blockNumber: 1, nonce, hash }]);
    expect(chain.calculateConfirmedBalance(miner(chain).publicKey)).toBe(2 + 3.125 + 0.25);
    // Replaying the same proof is stale and does not count twice.
    expect(chain.acceptBlock(candidate, nonce, hash)).toEqual({ status: 'stale' });
    expect(miner(chain).blocksWon).toBe(1);
    expect(chain.miningLog).toHaveLength(1);
  });

  it('applies the halving exactly at height halvingEvent', () => {
    const chain = setup({ halvingEvent: 3 });
    const rewards = [];
    for (let height = 1; height <= 4; height++) {
      const { block } = mineNext(chain);
      rewards.push({ height, halved: block.halved, coinbase: block.transactions[0].amount, blockReward: chain.blockReward });
    }
    expect(rewards).toEqual([
      { height: 1, halved: false, coinbase: 3.125, blockReward: 3.125 },
      { height: 2, halved: false, coinbase: 3.125, blockReward: 3.125 },
      { height: 3, halved: true, coinbase: 1.5625, blockReward: 1.5625 },
      { height: 4, halved: false, coinbase: 1.5625, blockReward: 1.5625 }
    ]);
    expect(chain.isChainValid()).toBe(true);
    expect(miner(chain).blocksWon).toBe(4);
    expect(chain.miningLog.map(entry => entry.blockNumber)).toEqual([1, 2, 3, 4]);
  });
});
