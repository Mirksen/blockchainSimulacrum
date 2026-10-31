import { Buffer } from 'node:buffer';
import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { bitsOfZeros, headerFields, headerHex, meetsTarget, targetOf, zerosOfTarget } from '../../../shared/bitcoin-block.mjs';
import { candidateHash, createBlockchain } from '../lib/blockchain';
import { createHeaderHasher, search } from '../lib/powSearch';
import { headerPrefix } from '../lib/blockHeader';

const noWait = async () => {};
// Independent reference: node:crypto over all 80 bytes.
const nodeHash = hex => {
  const once = createHash('sha256').update(Buffer.from(hex, 'hex')).digest();
  return createHash('sha256').update(once).digest().reverse().toString('hex');
};
// Bitcoin block 100000, a header with a real proof of work.
const BLOCK = { hash: '000000000003ba27aa200b1cecaad478d2b00432346c3f1f3986da1afd33e506', version: 1,
  previousHash: '000000000002d01c1fccc21636b607dfd930d31d01c3a62104612a1719011250',
  merkleRoot: 'f3e94742aca4b5ef85488dc37c06c3282295ffec960994b2c0d5ac2a25a95766',
  time: 1293623863, bits: 453281356, nonce: 274148111 };

describe('header hasher', () => {
  it('reproduces a real block from its midstate', () => {
    expect(createHeaderHasher(headerPrefix(BLOCK))(BLOCK.nonce)).toBe(BLOCK.hash);
  });
  it('matches node:crypto over all 80 bytes, at the ends of the nonce range too', () => {
    const prefix = headerPrefix(BLOCK);
    const hasher = createHeaderHasher(prefix);
    for (const nonce of [0, 1, 0xff, 0x100, 0x7fffffff, 0x80000000, 0xffffffff]) {
      const le = Buffer.alloc(4);
      le.writeUInt32LE(nonce);
      expect(hasher(nonce)).toBe(nodeHash(prefix + le.toString('hex')));
    }
  });
  it('finds the real nonce of a real block', async () => {
    const result = await search({ entrants: [{ id: 'block', header: headerPrefix(BLOCK), startNonce: BLOCK.nonce - 5 }],
      bits: BLOCK.bits, limit: 100, yieldControl: noWait });
    expect(result).toMatchObject({ status: 'found', nonce: BLOCK.nonce, hash: BLOCK.hash, attempts: 6 });
  });
  it('refuses anything but 76 header bytes and nonces beyond 32 bits', async () => {
    expect(() => createHeaderHasher('00')).toThrow(RangeError);
    await expect(search({ entrants: [{ id: 'a', header: headerPrefix(BLOCK), startNonce: 2 ** 32 }], bits: BLOCK.bits, limit: 1, yieldControl: noWait }))
      .rejects.toThrow(RangeError);
  });
  it('ends with exhausted after the last 32-bit nonce', async () => {
    const result = await search({ entrants: [{ id: 'a', header: headerPrefix(BLOCK), startNonce: 0xffffffff - 2 }],
      bits: bitsOfZeros(20), limit: 10, yieldControl: noWait });
    expect(result).toMatchObject({ status: 'exhausted', attempts: 3 });
    expect(result.entrants.a.nonce).toBe(0xffffffff);
  });
});

describe('bits', () => {
  it('maps zeros to canonical compact targets and back', () => {
    expect([1, 2, 3, 4].map(bitsOfZeros)).toEqual([0x200fffff, 0x2000ffff, 0x1f0fffff, 0x1f00ffff]);
    expect(bitsOfZeros(8)).toBe(0x1d00ffff);
    for (let zeros = 1; zeros <= 10; zeros++) {
      const bits = bitsOfZeros(zeros);
      expect(zerosOfTarget(bits)).toBe(zeros);
      const target = targetOf(bits).toString(16).padStart(64, '0');
      expect(target.startsWith('0'.repeat(zeros))).toBe(true);
      expect(target[zeros]).toBe('f');
      // Canonical: the mantissa's top bit is clear and it could not lose a leading byte.
      expect((bits & 0x800000) === 0 && (bits & 0xff8000) !== 0).toBe(true);
    }
    for (const zeros of [0, 61, 1.5, '2']) expect(() => bitsOfZeros(zeros)).toThrow(RangeError);
  });
  it('accepts a hash by the target, not by its leading zeros', () => {
    const bits = bitsOfZeros(2);
    expect(meetsTarget(`00ffff${'0'.repeat(58)}`, bits)).toBe(true);
    expect(meetsTarget(`00ffff${'0'.repeat(57)}1`, bits)).toBe(false);
    expect(meetsTarget(`01${'0'.repeat(62)}`, bits)).toBe(false);
  });
  it('rejects a hash above the target of its candidate', () => {
    const chain = createBlockchain({ participants: ['Miner1'], miners: ['Miner1'], miningDifficulty: 1 });
    const candidate = chain.prepareCandidate(chain.getActiveMiner());
    const above = { ...candidate, bits: 1 };
    expect(chain.acceptBlock(above, 0, candidateHash(candidate, 0))).toEqual({ status: 'rejected', reason: 'target-miss' });
  });
});

describe('headerFields', () => {
  it('reads the six fields back from the bytes', () => {
    const fields = headerFields(headerHex(BLOCK));
    expect(fields.map(field => field.bytes.length / 2)).toEqual([4, 32, 32, 4, 4, 4]);
    expect(Object.fromEntries(fields.map(({ name, value }) => [name, value]))).toEqual({ version: 1, previousHash: BLOCK.previousHash,
      merkleRoot: BLOCK.merkleRoot, time: BLOCK.time, bits: BLOCK.bits, nonce: BLOCK.nonce });
  });
});

describe('a simulator block', () => {
  const findNonce = candidate => {
    let nonce = 0;
    while (!meetsTarget(candidateHash(candidate, nonce), candidate.bits)) nonce++;
    return nonce;
  };
  const chain = () => createBlockchain({ participants: ['Miner1', 'Wallet2'], miners: ['Miner1'], miningDifficulty: 1 });

  it('recomputes with node:crypto from its 80 bytes, and links to the genesis in reversed bytes', () => {
    const simulator = chain();
    const candidate = simulator.prepareCandidate(simulator.getActiveMiner());
    const nonce = findNonce(candidate);
    const { block } = simulator.acceptBlock(candidate, nonce, candidateHash(candidate, nonce));
    const hex = headerHex(block.header());
    expect(hex).toHaveLength(160);
    expect(nodeHash(hex)).toBe(block.hash);
    expect(hex.slice(8, 72)).toBe(Buffer.from(simulator.blockArray[0].hash, 'hex').reverse().toString('hex'));
    expect(block.transactions[0].sender).toBeNull();
  });
  it('gives equal rewards different txids at different heights', () => {
    const simulator = chain();
    const miner = simulator.getActiveMiner();
    const mine = () => {
      const candidate = simulator.prepareCandidate(miner, { time: 1800000000 });
      const nonce = findNonce(candidate);
      return simulator.acceptBlock(candidate, nonce, candidateHash(candidate, nonce)).block;
    };
    expect(mine().transactions[0].createHash()).not.toBe(mine().transactions[0].createHash());
  });
  it('moves to a new merkle root with the next extraNonce and stays valid', () => {
    const simulator = chain();
    const miner = simulator.getActiveMiner();
    const time = simulator.nextBlockTime();
    const first = simulator.prepareCandidate(miner, { time });
    const next = simulator.prepareCandidate(miner, { time, extraNonce: 1 });
    expect(next.txRoot).not.toBe(first.txRoot);
    expect(next.header).not.toBe(first.header);
    const nonce = findNonce(next);
    expect(simulator.acceptBlock(next, nonce, candidateHash(next, nonce)).status).toBe('accepted');
    expect(simulator.isChainValid()).toBe(true);
  });
  it('rolls the time of a re-mine instead of touching its transactions', () => {
    const simulator = chain();
    const candidate = simulator.prepareCandidate(simulator.getActiveMiner());
    const nonce = findNonce(candidate);
    const { block } = simulator.acceptBlock(candidate, nonce, candidateHash(candidate, nonce));
    const txid = block.transactions[0].createHash();
    const rolled = simulator.prepareRemine(1, { timeRoll: 1 }).candidate;
    expect(rolled.time).toBe(block.time + 1);
    const again = findNonce(rolled);
    expect(simulator.acceptRemine(rolled, again, candidateHash(rolled, again)).status).toBe('accepted');
    expect(block.time).toBe(rolled.time);
    expect(block.transactions[0].createHash()).toBe(txid);
    expect(simulator.isChainValid()).toBe(true);
  });
  it('shows every coinbase edit in its txid, also those Bitcoin cannot encode', () => {
    const simulator = chain();
    const candidate = simulator.prepareCandidate(simulator.getActiveMiner());
    const nonce = findNonce(candidate);
    const { block } = simulator.acceptBlock(candidate, nonce, candidateHash(candidate, nonce));
    const [coinbase] = block.transactions;
    const txids = [3.125, 3.125000001, 3.125000002, 1e30, 1e31, -1].map(amount => {
      coinbase.amount = amount;
      return coinbase.createHash();
    });
    expect(new Set(txids).size).toBe(txids.length);
    coinbase.amount = 3.125;
    expect(block.isValid()).toBe(true);
  });
  it('rejects a nonce beyond 32 bits', () => {
    const simulator = chain();
    const candidate = simulator.prepareCandidate(simulator.getActiveMiner());
    expect(simulator.acceptBlock(candidate, 2 ** 32, candidateHash(candidate, 0))).toEqual({ status: 'rejected', reason: 'hash-mismatch' });
  });
  it('never lets a block run behind its predecessor', () => {
    const simulator = chain();
    const future = simulator.blockArray[0].time + 1000;
    const candidate = simulator.prepareCandidate(simulator.getActiveMiner(), { time: future });
    const nonce = findNonce(candidate);
    simulator.acceptBlock(candidate, nonce, candidateHash(candidate, nonce));
    expect(simulator.nextBlockTime()).toBeGreaterThanOrEqual(future);
  });
});
