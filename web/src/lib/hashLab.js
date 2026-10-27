import SHA256 from 'crypto-js/sha256.js';
import { search } from './powSearch';

export const SEARCH_LIMIT = 50_000;

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

// Splits the trial preimage around the nonce: prefix + nonce + suffix.
function trialParts(message) {
  const preimage = JSON.stringify({ message, nonce: 0 });
  return { prefix: preimage.slice(0, -'0}'.length), suffix: '}' };
}

// This bounded experiment searches one message; it never touches the chain.
export async function findNonce({ message, startNonce, difficulty, signal,
  onProgress = () => {}, yieldControl }) {
  const start = parseNonce(startNonce);
  meetsTarget('', difficulty);
  const { prefix, suffix } = trialParts(message);
  const trialOf = ({ nonce, hash }) => ({ nonce, preimage: prefix + nonce + suffix, hash });
  const result = await search({ entrants: [{ id: 'message', prefix, suffix, startNonce: start }],
    target: '0'.repeat(difficulty), limit: SEARCH_LIMIT, signal, yieldControl,
    onProgress: progress => onProgress({ attempts: progress.attempts, trial: trialOf(progress.entrants.message) }) });
  const last = result.entrants.message;
  return { status: result.status, attempts: result.attempts, trial: last.attempts ? trialOf(last) : null };
}
