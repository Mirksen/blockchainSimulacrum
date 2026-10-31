import { bitsOfZeros, displayHash, le, meetsTarget as meetsBits } from '../../../shared/bitcoin-block.mjs';
import { labHeaderPrefix, MAX_NONCE, sha256d } from './blockHeader';
import { search } from './powSearch';

export const SEARCH_LIMIT = 50_000;

// The target is part of the header, so each target searches different hashes and a stricter one
// can win by luck. This message keeps the lesson's order: 12, 188 and 6122 attempts from nonce 0.
export const INITIAL_MESSAGE = 'Hello, block.';

export function parseNonce(value) {
  if ((typeof value !== 'number' && typeof value !== 'string') ||
      (typeof value === 'string' && !/^\d+$/.test(value)) ||
      !Number.isSafeInteger(Number(value)) || Number(value) < 0 || Number(value) > MAX_NONCE) {
    throw new RangeError(`Enter a whole number from 0 to ${MAX_NONCE}.`);
  }
  return Number(value);
}

function labBits(difficulty) {
  if (![1, 2, 3].includes(difficulty)) throw new RangeError('Choose 1, 2 or 3 leading zeros.');
  return bitsOfZeros(difficulty);
}

// One 80-byte header: the message stands in for the transactions, the chosen target fills
// the bits field, so the target is part of what is hashed.
export function createTrial(message, nonce, difficulty) {
  const header = labHeaderPrefix({ data: message, bits: labBits(difficulty) }) + le(parseNonce(nonce), 4);
  return { nonce: parseNonce(nonce), header, hash: displayHash(header, sha256d) };
}

export const meetsTarget = (hash, difficulty) => meetsBits(hash, labBits(difficulty));

export function changedPositions(hash, previousHash) {
  return [...hash].map((character, index) => previousHash != null && character !== previousHash[index]);
}

// This bounded experiment searches one message; it never touches the chain.
export async function findNonce({ message, startNonce, difficulty, signal,
  onProgress = () => {}, yieldControl }) {
  const start = parseNonce(startNonce);
  const bits = labBits(difficulty);
  const header = labHeaderPrefix({ data: message, bits });
  const trialOf = ({ nonce, hash }) => ({ nonce, header: header + le(nonce, 4), hash });
  const result = await search({ entrants: [{ id: 'message', header, startNonce: start }],
    bits, limit: SEARCH_LIMIT, signal, yieldControl,
    onProgress: progress => onProgress({ attempts: progress.attempts, trial: trialOf(progress.entrants.message) }) });
  const last = result.entrants.message;
  return { status: result.status, attempts: result.attempts, trial: last.attempts ? trialOf(last) : null };
}
