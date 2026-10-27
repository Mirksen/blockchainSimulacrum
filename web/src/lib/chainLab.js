import SHA256 from 'crypto-js/sha256.js';
import { parseNonce, SEARCH_LIMIT } from './hashLab';

export const ROOT_HASH = '0'.repeat(64);
export const CHAIN_TARGET = '0';
const BATCH_SIZE = 100;

export function blockTrial(block) {
  const preimage = JSON.stringify({ number: block.number, data: block.data,
    previousHash: block.previousHash, nonce: parseNonce(block.nonce) });
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

// Each starting example needs only a few hashes. No live simulator state is used.
export function sampleChain() {
  const data = ['A parcel is packed.', 'The parcel leaves.', 'The parcel arrives.'];
  const blocks = [];
  for (const [index, text] of data.entries()) {
    const block = { number: index + 1, data: text, previousHash: blocks.at(-1)?.hash || ROOT_HASH, nonce: 0 };
    while (block.nonce < SEARCH_LIMIT) {
      const { hash } = blockTrial(block);
      if (hash.startsWith(CHAIN_TARGET)) { blocks.push({ ...block, hash }); break; }
      block.nonce++;
    }
    if (blocks.length !== index + 1) throw new Error('Could not prepare the example chain.');
  }
  return blocks;
}

// Commit only a successful result; cancelled/exhausted attempts leave the chain intact.
export async function remineBlock(blocks, index, { signal, onProgress = () => {},
  yieldControl = () => new Promise(resolve => setTimeout(resolve, 0)) } = {}) {
  const candidate = { ...blocks[index], previousHash: index === 0 ? ROOT_HASH : blocks[index - 1].hash, nonce: 0 };
  let attempts = 0;
  await yieldControl();
  while (attempts < SEARCH_LIMIT && !signal?.aborted) {
    const { hash } = blockTrial(candidate);
    attempts++;
    if (hash.startsWith(CHAIN_TARGET)) return { status: 'found', attempts, block: { ...candidate, hash } };
    candidate.nonce++;
    if (attempts % BATCH_SIZE === 0) { onProgress(attempts); await yieldControl(); }
  }
  return { status: signal?.aborted ? 'stopped' : 'exhausted', attempts };
}
