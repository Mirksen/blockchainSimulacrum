import SHA256 from 'crypto-js/sha256.js';

export const SEARCH_LIMIT = 50_000;
const BATCH_SIZE = 100;

export function parseNonce(value) {
  if ((typeof value !== 'number' && typeof value !== 'string') ||
      (typeof value === 'string' && !/^\d+$/.test(value)) ||
      !Number.isSafeInteger(Number(value)) || Number(value) < 0) {
    throw new RangeError('Enter a whole number from 0 to 9007199254740991.');
  }
  return Number(value);
}

export function createTrial(message, nonce) {
  // JSON preserves the boundary between the message and the numeric nonce.
  const preimage = JSON.stringify({ message, nonce: parseNonce(nonce) });
  return { nonce: parseNonce(nonce), preimage, hash: SHA256(preimage).toString() };
}

export function meetsTarget(hash, difficulty) {
  if (![1, 2, 3].includes(difficulty)) throw new RangeError('Choose 1, 2 or 3 leading zeros.');
  return hash.startsWith('0'.repeat(difficulty));
}

export function changedPositions(hash, previousHash) {
  return [...hash].map((character, index) => previousHash != null && character !== previousHash[index]);
}

const yieldToBrowser = () => new Promise(resolve => setTimeout(resolve, 0));

// This bounded experiment searches one message; it never touches the chain.
export async function findNonce({ message, startNonce, difficulty, signal,
  onProgress = () => {}, yieldControl = yieldToBrowser }) {
  let nonce = parseNonce(startNonce);
  meetsTarget('', difficulty);
  let trial = null;
  let attempts = 0;
  // Let React paint the Stop button, even when the first candidate succeeds.
  await yieldControl();
  while (attempts < SEARCH_LIMIT && !signal?.aborted) {
    trial = createTrial(message, nonce);
    attempts++;
    if (meetsTarget(trial.hash, difficulty)) return { status: 'found', attempts, trial };
    if (nonce === Number.MAX_SAFE_INTEGER) return { status: 'exhausted', attempts, trial };
    nonce++;
    if (attempts % BATCH_SIZE === 0) {
      onProgress({ attempts, trial });
      await yieldControl();
    }
  }
  return { status: signal?.aborted ? 'stopped' : 'exhausted', attempts, trial };
}
