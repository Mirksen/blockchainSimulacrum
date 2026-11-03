import { Buffer } from 'node:buffer';
import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { headerHex, meetsTarget, merkleBranch, merkleRoot, reverseHex } from '../../../shared/bitcoin-block.mjs';
import { sha256d } from '../lib/blockHeader';
import { transactionRoot } from '../lib/blockchain';
import { BLOCK_SIZES, MERKLE_BITS, buildTree, merkleLevels, paymentText, sampleBlock, txidOf, verifyProof } from '../lib/merkleLab';

// Independent reference: node:crypto, not the code under test.
const nodeSha256d = hex => createHash('sha256').update(createHash('sha256').update(Buffer.from(hex, 'hex')).digest()).digest();

// Real mainnet blocks (also in merkle.test.js): an even and an odd transaction count.
const BLOCK_100000 = {
  merkleRoot: 'f3e94742aca4b5ef85488dc37c06c3282295ffec960994b2c0d5ac2a25a95766',
  txids: ['8c14f0db3df150123e6f3dbbf30f8b955a8249b62ac1d1ff16284aefa3d06d87', 'fff2525b8931402dd09222c50775608f75787bd2b87e56995a7bdd30f79702c4',
    '6359f0868171b1d194cbee1af2f16ea598ae8fad666d9b012c8ed2b79a236ec4', 'e9a66845e05d5abc0ad04ec80f774a7e585c6e8db975962d069a522137b80c1d']
};
const BLOCK_100002 = {
  merkleRoot: '2fda58e5959b0ee53c5253da9b9f3c0c739422ae04946966991cf55895287552',
  txids: ['ef1d870d24c85b89d92ad50f4631026f585d6a34e972eaf427475e5d60acf3a3', 'f9fc751cb7dc372406a9f8d738d5e6f8f63bab71986a39cf36ee70ee17036d07',
    'db60fb93d736894ed0b86cb92548920a3fe8310dd19b0da7ad97e48725e1e12e', '220ebc64e21abece964927322cba69180ed853bb187fbc6923bac7d010b9d87a',
    '71b3dbaca67e9f9189dad3617138c19725ab541ef0b49c05a94913e9f28e3f4e', 'fe305e1ed08212d76161d853222048eea1f34af42ea0e197896a269fbf8dc2e0',
    '21d2eb195736af2a40d42107e6abd59c97eb6cffd4a5a7a7709e86590ae61987', 'dd1fd2a6fc16404faf339881a90adbde7f4f728691ac62e8f168809cdfae1053',
    '74d681e0e03bafa802c8aa084379aa98d9fcd632ddc2ed9782b586ec87451f20']
};
const flip = hash => (hash[0] === '0' ? '1' : '0') + hash.slice(1);

describe('merkle lab tree', () => {
  it.each([['even', BLOCK_100000], ['odd', BLOCK_100002]])('reproduces a real Bitcoin root with an %s transaction count', (_, block) => {
    const tree = buildTree(block.txids);
    expect(tree.root).toBe(block.merkleRoot);
    expect(tree.root).toBe(transactionRoot(block.txids.map(txid => ({ createHash: () => txid }))));
    for (const index of block.txids.keys()) {
      const proof = tree.proofFor(index);
      expect(verifyProof(block.txids[index], proof.path, block.merkleRoot)).toMatchObject({ valid: true, failedAt: null });
    }
  });

  it('agrees with the shared merkle branch of transaction 0 and the shared root', () => {
    for (const size of [1, 2, 3, 5, 16]) {
      const block = sampleBlock(size);
      expect(block.root).toBe(merkleRoot(block.txids, sha256d));
      expect(block.proofFor(0).path.map(step => reverseHex(step.hash))).toEqual(merkleBranch(block.txids, sha256d));
    }
  });

  it('hashes payment text bytes twice for a txid', () => {
    const text = paymentText(3);
    expect(txidOf(text)).toBe(Buffer.from(nodeSha256d(Buffer.from(text, 'utf8').toString('hex'))).reverse().toString('hex'));
  });

  it('has the all-zero root for no transactions and the txid for one', () => {
    expect(merkleLevels([]).at(-1)[0]).toBe('0'.repeat(64));
    const block = sampleBlock(1);
    expect(block.root).toBe(block.txids[0]);
    expect(block.proofFor(0).path).toEqual([]);
  });
});

describe('merkle lab proofs', () => {
  it.each([1, 2, 3, 5, 16])('verifies every index of a %i-transaction block', size => {
    const block = sampleBlock(size);
    for (let index = 0; index < size; index++) {
      const proof = block.proofFor(index);
      expect(proof.path).toHaveLength(Math.ceil(Math.log2(size)));
      const result = verifyProof(txidOf(block.texts[index]), proof.path, block.root, proof.levels);
      expect(result.valid).toBe(true);
      expect(result.failedAt).toBeNull();
      expect(result.steps.map(step => step.hash)).toEqual(proof.levels);
      expect(result.computedRoot).toBe(block.root);
    }
  });

  it('names the sibling side: odd positions have their sibling on the left; an odd level pairs the last hash with itself', () => {
    const block = sampleBlock(5);
    const proof = block.proofFor(4);
    expect(proof.path.map(step => step.side)).toEqual(['right', 'right', 'left']);
    expect(proof.path[0].hash).toBe(block.txids[4]);
    expect(block.proofFor(1).path[0]).toEqual({ level: 0, side: 'left', hash: block.txids[0] });
  });

  it('fails at level 0 for a changed payment', () => {
    const block = sampleBlock(16);
    const proof = block.proofFor(5);
    const result = verifyProof(txidOf('Payment 5: demo wallet F pays shop 36 900 virtual coins.'), proof.path, block.root, proof.levels);
    expect(result.valid).toBe(false);
    expect(result.failedAt).toBe(0);
    expect(result.computedRoot).not.toBe(block.root);
  });

  it.each([0, 1, 2, 3])('fails at the level above a changed sibling at level %i', level => {
    const block = sampleBlock(16);
    const proof = block.proofFor(5);
    const path = proof.path.map(step => step.level === level ? { ...step, hash: flip(step.hash) } : step);
    const result = verifyProof(proof.txid, path, block.root, proof.levels);
    expect(result.valid).toBe(false);
    expect(result.failedAt).toBe(level + 1);
    expect(result.steps.slice(0, level + 1).map(step => step.hash)).toEqual(proof.levels.slice(0, level + 1));
    expect(result.steps[level + 1].hash).not.toBe(proof.levels[level + 1]);
  });

  it('locates a failure at the root without a reference, and on a swapped side', () => {
    const block = sampleBlock(16);
    const proof = block.proofFor(5);
    const changed = verifyProof(flip(proof.txid), proof.path, block.root);
    expect(changed).toMatchObject({ valid: false, failedAt: 4 });
    const swapped = proof.path.map((step, level) => level === 0 ? { ...step, side: step.side === 'left' ? 'right' : 'left' } : step);
    expect(verifyProof(proof.txid, swapped, block.root, proof.levels)).toMatchObject({ valid: false, failedAt: 1 });
  });

  it('stops at a malformed sibling', () => {
    const block = sampleBlock(4);
    const proof = block.proofFor(2);
    const path = proof.path.map(step => step.level === 0 ? { ...step, hash: 'not a hash' } : step);
    const result = verifyProof(proof.txid, path, block.root, proof.levels);
    expect(result).toMatchObject({ valid: false, failedAt: 1, computedRoot: null, malformed: { level: 0, what: 'sibling' } });
    expect(result.steps.map(step => step.hash)).toEqual([proof.txid, null, null]);
  });
});

describe('merkle lab sample block', () => {
  it.each(BLOCK_SIZES)('commits a fixed 80-byte header to the root of %i payments', size => {
    const block = sampleBlock(size);
    expect(block.texts).toHaveLength(size);
    expect(block.header).toHaveLength(160);
    expect(block.header.slice(72, 136)).toBe(reverseHex(block.root));
    expect(Buffer.from(nodeSha256d(block.header)).reverse().toString('hex')).toBe(block.hash);
    expect(meetsTarget(block.hash, MERKLE_BITS)).toBe(true);
    expect(headerHex({ version: 1, previousHash: '0'.repeat(64), merkleRoot: block.root, time: 1231006505, bits: MERKLE_BITS, nonce: block.nonce })).toBe(block.header);
    expect(block.proofFor(size - 1).path).toHaveLength(Math.log2(size));
    expect(sampleBlock(size)).toBe(block);
  });

  it('rejects an index outside the block', () => {
    expect(() => sampleBlock(4).proofFor(4)).toThrow(RangeError);
    expect(() => sampleBlock(0)).toThrow(RangeError);
  });
});
