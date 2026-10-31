import { bitsOfZeros, le, meetsTarget } from '../../../shared/bitcoin-block.mjs';
import { hashAtNonce, labHeaderPrefix, ZERO_HASH } from './blockHeader';
import { parseNonce, SEARCH_LIMIT } from './hashLab';
import { search } from './powSearch';

export const ROOT_HASH = ZERO_HASH;
// One leading hex zero, the same target for every toy block.
export const CHAIN_BITS = bitsOfZeros(1);

// The first 76 header bytes of a toy block: its data stands in for the transactions.
export const blockHeader = block => labHeaderPrefix({ data: block.data, previousHash: block.previousHash,
  number: block.number, bits: CHAIN_BITS });

export function blockTrial(block) {
  const nonce = parseNonce(block.nonce);
  const header = blockHeader(block);
  return { header: header + le(nonce, 4), hash: hashAtNonce(header, nonce) };
}

export function inspectChain(blocks) {
  let ancestorsValid = true;
  return blocks.map((block, index) => {
    let trial = null;
    let error = '';
    try { trial = blockTrial(block); } catch (cause) { error = cause.message; }
    const hashMatches = trial?.hash === block.hash;
    const workValid = /^[0-9a-f]{64}$/.test(block.hash) && meetsTarget(block.hash, CHAIN_BITS);
    const linkMatches = block.previousHash === (index === 0 ? ROOT_HASH : blocks[index - 1].hash);
    const localValid = hashMatches && workValid && linkMatches;
    const result = { trial, error, hashMatches, workValid, linkMatches, ancestorsValid,
      valid: ancestorsValid && localValid };
    ancestorsValid = result.valid;
    return result;
  });
}

// The starting examples are fixed, so their first valid nonces are too
// (0, 32 and 71 from nonce 0). No live simulator state is used.
const SAMPLE_DATA = ['A parcel is packed.', 'The parcel leaves.', 'The parcel arrives.'];
const SAMPLE_NONCES = [0, 32, 71];
export function sampleChain() {
  const blocks = [];
  for (const [index, data] of SAMPLE_DATA.entries()) {
    const block = { number: index + 1, data, previousHash: blocks.at(-1)?.hash || ROOT_HASH, nonce: SAMPLE_NONCES[index] };
    const { hash } = blockTrial(block);
    if (!meetsTarget(hash, CHAIN_BITS)) throw new Error('Could not prepare the example chain.');
    blocks.push({ ...block, hash });
  }
  return blocks;
}

// Commit only a successful result; cancelled/exhausted attempts leave the chain intact.
export async function remineBlock(blocks, index, { signal, onProgress = () => {}, yieldControl } = {}) {
  const candidate = { ...blocks[index], previousHash: index === 0 ? ROOT_HASH : blocks[index - 1].hash, nonce: 0 };
  const result = await search({ entrants: [{ id: 'block', header: blockHeader(candidate) }], bits: CHAIN_BITS,
    limit: SEARCH_LIMIT, signal, yieldControl, onProgress: progress => onProgress(progress.attempts) });
  if (result.status === 'found') {
    return { status: 'found', attempts: result.attempts, block: { ...candidate, nonce: result.nonce, hash: result.hash } };
  }
  return { status: result.status, attempts: result.attempts };
}
