import { Buffer } from 'node:buffer';
import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { meetsTarget } from '../../../shared/bitcoin-block.mjs';
import { blockTrial, CHAIN_BITS, inspectChain, remineBlock, ROOT_HASH, sampleChain } from '../lib/chainLab';

const noWait = async () => {};
const sha256d = bytes => createHash('sha256').update(createHash('sha256').update(bytes).digest()).digest();
// Independent reference: the 80 header bytes of a toy block.
function header({ number, data, previousHash, nonce }) {
  const bytes = Buffer.alloc(80);
  bytes.writeUInt32LE(1, 0);
  Buffer.from(previousHash, 'hex').reverse().copy(bytes, 4);
  sha256d(Buffer.from(data, 'utf8')).copy(bytes, 36);
  bytes.writeUInt32LE(1231006505 + number * 600, 68);
  bytes.writeUInt32LE(0x200fffff, 72);
  bytes.writeUInt32LE(nonce, 76);
  return bytes;
}
const repair = async (blocks, index) => {
  const result = await remineBlock(blocks, index, { yieldControl: noWait });
  expect(result.status).toBe('found');
  return blocks.map((block, position) => position === index ? result.block : block);
};

describe('isolated linked-block experiment', () => {
  it('starts with three reproducible linked proofs over real 80-byte headers', () => {
    const blocks = sampleChain();
    expect(blocks).toEqual(sampleChain());
    expect(blocks).toHaveLength(3);
    expect(blocks[0].previousHash).toBe(ROOT_HASH);
    for (const [index, block] of blocks.entries()) {
      const trial = blockTrial(block);
      expect(block.number).toBe(index + 1);
      expect(trial.header).toBe(header(block).toString('hex'));
      expect(trial.hash).toBe(Buffer.from(sha256d(header(block))).reverse().toString('hex'));
      expect(trial.hash).toBe(block.hash);
      expect(block.hash).toMatch(/^0[0-9a-f]{63}$/);
      if (index > 0) expect(block.previousHash).toBe(blocks[index - 1].hash);
    }
    expect(inspectChain(blocks).map(check => check.valid)).toEqual([true, true, true]);
  });

  it('preserves data boundaries and requires a 32-bit nonce', () => {
    const block = sampleChain()[0];
    expect(blockTrial({ ...block, data: 'a", "nonce":9' }).hash).not.toBe(blockTrial({ ...block, data: 'a', nonce: 9 }).hash);
    expect(blockTrial({ ...block, nonce: String(block.nonce) })).toEqual(blockTrial(block));
    for (const nonce of ['', '-1', '1.5', 'Infinity', '4294967296']) {
      expect(inspectChain([{ ...block, nonce }])[0].error).toContain('whole number');
      expect(inspectChain([{ ...block, nonce }])[0].valid).toBe(false);
    }
  });

  it('separates a changed input from unchanged links and invalid ancestry', () => {
    const original = sampleChain();
    const edited = original.map((block, index) => index === 0 ? { ...block, data: 'A changed record.' } : block);
    expect(edited.map(block => block.hash)).toEqual(original.map(block => block.hash));
    const checks = inspectChain(edited);
    expect(checks[0]).toMatchObject({ hashMatches: false, workValid: true, linkMatches: true, valid: false });
    expect(checks[1]).toMatchObject({ hashMatches: true, workValid: true, linkMatches: true, ancestorsValid: false, valid: false });
    expect(checks[2]).toMatchObject({ hashMatches: true, linkMatches: true, ancestorsValid: false, valid: false });
  });

  it('repairs only one block, then requires successors to adopt new commitments in order', async () => {
    const original = sampleChain();
    let blocks = original.map((block, index) => index === 0 ? { ...block, data: 'A changed record.' } : block);
    const snapshot = structuredClone(blocks);
    blocks = await repair(blocks, 0);
    expect(snapshot[0].hash).toBe(original[0].hash);
    expect(blocks[0].hash).not.toBe(original[0].hash);
    expect(blocks.slice(1)).toEqual(original.slice(1));
    expect(inspectChain(blocks).map(check => check.valid)).toEqual([true, false, false]);
    expect(inspectChain(blocks)[1].linkMatches).toBe(false);
    expect(inspectChain(blocks)[2]).toMatchObject({ linkMatches: true, ancestorsValid: false });
    blocks = await repair(blocks, 1);
    expect(inspectChain(blocks).map(check => check.valid)).toEqual([true, true, false]);
    blocks = await repair(blocks, 2);
    expect(inspectChain(blocks).every(check => check.valid)).toBe(true);
    expect(original).toEqual(sampleChain());
  });

  it('does not confuse matching input, work and valid ancestry', async () => {
    const blocks = sampleChain();
    let block = { ...blocks[0], nonce: 0 };
    while (meetsTarget(blockTrial(block).hash, CHAIN_BITS)) block.nonce++;
    block = { ...block, hash: blockTrial(block).hash };
    expect(inspectChain([block])[0]).toMatchObject({ hashMatches: true, workValid: false, valid: false });
    const edited = blocks.map((item, index) => index === 0 ? { ...item, data: 'Earlier input changed.' } : item);
    const later = await repair(edited, 1);
    expect(inspectChain(later)[1]).toMatchObject({ hashMatches: true, workValid: true, linkMatches: true, ancestorsValid: false, valid: false });
  });

  it('reports exact attempts and leaves its source untouched', async () => {
    const blocks = sampleChain();
    const snapshot = structuredClone(blocks);
    const result = await remineBlock(blocks, 0, { yieldControl: noWait });
    expect(result.attempts).toBe(result.block.nonce + 1);
    expect(result.block).toEqual(blocks[0]);
    expect(blocks).toEqual(snapshot);
  });

  it('yields before work so cancellation makes zero attempts and no partial block', async () => {
    const controller = new AbortController();
    const result = await remineBlock(sampleChain(), 0, { signal: controller.signal,
      yieldControl: async () => { controller.abort(); } });
    expect(result).toEqual({ status: 'stopped', attempts: 0 });
  });
});
