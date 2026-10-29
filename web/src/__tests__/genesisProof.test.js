import { describe, expect, it } from 'vitest';
import SHA256 from 'crypto-js/sha256';
import { Blockchain, createGenesisBlock, GENESIS } from '../lib/blockchain';
import { formatDifficulty, hashDifficulty, leadingZeros, proofPrefix, verifyRow } from '../lib/poolProof';

const ROUND = { height: 900001, hash: `0000${'ab'.repeat(30)}` };

describe('genesis block', () => {
  it('rebuilds the stored genesis hash from shared/genesis.json', () => {
    const block = createGenesisBlock();
    expect(block.hash).toBe(GENESIS.hash);
    expect(block.isValid()).toBe(true);
    expect(block.previousHash).toBe(GENESIS.anchor.hash);
    expect(block.txRoot).toBe(GENESIS.txRoot);
    expect(leadingZeros(block.hash)).toBeGreaterThanOrEqual(GENESIS.difficulty);
  });

  it('carries one unspendable coinbase with the memo', () => {
    const [coinbase] = createGenesisBlock().transactions;
    expect(coinbase).toMatchObject({ sender: null, recipient: GENESIS.coinbase.recipient, amount: GENESIS.coinbase.amount,
      referenceNumber: GENESIS.coinbase.memo });
  });

  it('starts every simulated chain, which stays valid', () => {
    const chain = new Blockchain('synthetic', 1);
    expect(chain.blockArray[0].hash).toBe(GENESIS.hash);
    expect(chain.isChainValid()).toBe(true);
  });
});

describe('pool proof', () => {
  it('names the chain, the round and the miner in its prefix', () => {
    expect(proofPrefix(GENESIS.hash, ROUND, 'synthetic-miner'))
      .toBe(`proofofwork.fyi|${GENESIS.hash}|${ROUND.height}:${ROUND.hash}|synthetic-miner|`);
  });

  it('verifies a row from its public fields and catches a changed name', () => {
    const prefix = proofPrefix(GENESIS.hash, ROUND, 'synthetic-miner');
    const row = { name: 'synthetic-miner', round: ROUND, nonce: 42, bestHash: SHA256(`${prefix}42`).toString() };
    expect(verifyRow(row)).toMatchObject({ preimage: `${prefix}42`, matches: true });
    expect(verifyRow({ ...row, name: 'other-miner' }).matches).toBe(false);
  });

  it('scores difficulty relative to one zero, finer than counting zeros', () => {
    expect(hashDifficulty(`0${'f'.repeat(63)}`)).toBe(1);
    expect(hashDifficulty(`00${'f'.repeat(62)}`)).toBe(16);
    // Equal zeros, smaller hash, higher difficulty.
    expect(hashDifficulty(`0001${'0'.repeat(60)}`)).toBeGreaterThan(hashDifficulty(`0009${'0'.repeat(60)}`));
  });

  it('abbreviates large difficulties', () => {
    expect(formatDifficulty(1.5)).toBe('1.5');
    expect(formatDifficulty(4096)).toBe('4,096');
    expect(formatDifficulty(2.5e9)).toBe('2.5 B');
    expect(formatDifficulty(Number.NaN)).toBe('—');
  });
});
