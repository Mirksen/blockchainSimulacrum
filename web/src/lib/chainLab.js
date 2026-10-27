import SHA256 from 'crypto-js/sha256.js';
import { parseNonce, SEARCH_LIMIT } from './hashLab';
import { search } from './powSearch';

export const ROOT_HASH = '0'.repeat(64);
export const CHAIN_TARGET = '0';

const blockPreimage = (block, nonce) => JSON.stringify({ number: block.number, data: block.data,
  previousHash: block.previousHash, nonce });

export function blockTrial(block) {
  const preimage = blockPreimage(block, parseNonce(block.nonce));
  return { preimage, hash: SHA256(preimage).toString() };
}

export function inspectChain(blocks) {
  let ancestorsValid = true;
  return blocks.map((block, index) => {
    let trial = null;
    let error = '';
    try { trial = blockTrial(block); } catch (cause) { error = cause.message; }
    const hashMatches = trial?.hash === block.hash;
    const workValid = /^0[0-9a-f]{63}$/.test(block.hash);
    const linkMatches = block.previousHash === (index === 0 ? ROOT_HASH : blocks[index - 1].hash);
    const localValid = hashMatches && workValid && linkMatches;
    const result = { trial, error, hashMatches, workValid, linkMatches, ancestorsValid,
      valid: ancestorsValid && localValid };
    ancestorsValid = result.valid;
    return result;
  });
}

// The starting examples are fixed, so their first valid nonces are too
// (5, 16 and 2 from nonce 0). No live simulator state is used.
const SAMPLE_DATA = ['A parcel is packed.', 'The parcel leaves.', 'The parcel arrives.'];
const SAMPLE_NONCES = [5, 16, 2];
export function sampleChain() {
  const blocks = [];
  for (const [index, data] of SAMPLE_DATA.entries()) {
    const block = { number: index + 1, data, previousHash: blocks.at(-1)?.hash || ROOT_HASH, nonce: SAMPLE_NONCES[index] };
    const { hash } = blockTrial(block);
    if (!hash.startsWith(CHAIN_TARGET)) throw new Error('Could not prepare the example chain.');
    blocks.push({ ...block, hash });
  }
  return blocks;
}

// Commit only a successful result; cancelled/exhausted attempts leave the chain intact.
export async function remineBlock(blocks, index, { signal, onProgress = () => {}, yieldControl } = {}) {
  const candidate = { ...blocks[index], previousHash: index === 0 ? ROOT_HASH : blocks[index - 1].hash, nonce: 0 };
  // The nonce is the last key of the block preimage: prefix + nonce + '}'.
  const prefix = blockPreimage(candidate, 0).slice(0, -'0}'.length);
  const result = await search({ entrants: [{ id: 'block', prefix, suffix: '}' }], target: CHAIN_TARGET,
    limit: SEARCH_LIMIT, signal, yieldControl, onProgress: progress => onProgress(progress.attempts) });
  if (result.status === 'found') {
    return { status: 'found', attempts: result.attempts, block: { ...candidate, nonce: result.nonce, hash: result.hash } };
  }
  return { status: result.status, attempts: result.attempts };
}
