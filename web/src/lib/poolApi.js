// Client for the leaderboard pool server. Every call has its own timeout and
// turns a failed answer into an Error with a numeric `status` (0 when the
// server could not be reached or answered with something unreadable).
import { GENESIS, proofPrefix } from './poolProof';

export const POOL_API = (import.meta.env?.VITE_POOL_API || 'https://api.proofofwork.fyi').replace(/\/+$/, '');
export const POOL_TIMEOUT_MS = 10_000;

// Same rule as the server: 3–20 letters, digits or hyphens.
const NAME_PATTERN = /^[A-Za-z0-9-]{3,20}$/;
export const isValidPoolName = name => typeof name === 'string' && NAME_PATTERN.test(name);

const MESSAGES = {
  400: 'The pool did not accept this request.',
  409: 'This proof was already counted.',
  410: 'This round is over: a new Bitcoin block arrived.',
  413: 'The proof was too large to send.',
  422: 'This hash does not meet the target.',
  429: 'Too many requests to the pool. Please wait a minute.',
};

function poolError(status, message, code) {
  return Object.assign(new Error(message), { status, ...(code ? { code } : {}) });
}

export const NAME_UNAVAILABLE_MESSAGE = 'This name is not available. Please choose another.';

const messageFor = status => MESSAGES[status] ||
  (status >= 500 ? 'The leaderboard server is unavailable right now.' : 'The pool answered with an unexpected error.');

// The server decides which names are available; a refused name gets its own code
// so the panel can point at the name field instead of retrying.
async function failureFor(response) {
  if (response.status === 400) {
    let body = null;
    try { body = await response.json(); } catch { /* No readable body: a plain error. */ }
    if (body?.error === 'name unavailable') {
      return poolError(response.status, NAME_UNAVAILABLE_MESSAGE, 'name-unavailable');
    }
  }
  return poolError(response.status, messageFor(response.status));
}

async function request(path, { method = 'GET', body, signal } = {}) {
  if (signal?.aborted) throw new DOMException('The request was cancelled.', 'AbortError');
  const controller = new AbortController();
  let timedOut = false;
  const timer = setTimeout(() => { timedOut = true; controller.abort(); }, POOL_TIMEOUT_MS);
  const forward = () => controller.abort();
  signal?.addEventListener('abort', forward, { once: true });
  const failure = (fallback, code) => {
    if (timedOut) return poolError(0, 'The leaderboard server did not answer in time.', 'timeout');
    if (signal?.aborted) return new DOMException('The request was cancelled.', 'AbortError');
    return poolError(0, fallback, code);
  };
  try {
    let response;
    try {
      response = await fetch(`${POOL_API}${path}`, {
        method,
        headers: body === undefined ? undefined : { 'content-type': 'application/json' },
        body: body === undefined ? undefined : JSON.stringify(body),
        credentials: 'omit',
        cache: 'no-store',
        signal: controller.signal,
      });
    } catch {
      throw failure('The leaderboard server could not be reached.', 'network');
    }
    if (!response.ok) throw await failureFor(response);
    try {
      return await response.json();
    } catch {
      throw failure('The leaderboard server sent an unreadable answer.', 'invalid');
    }
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener('abort', forward);
  }
}

const invalidAnswer = () => poolError(0, 'The leaderboard server sent an unreadable answer.', 'invalid');
const HASH = /^[0-9a-f]{64}$/;
const isRound = round => Boolean(round) && Number.isSafeInteger(round.height) && round.height >= 0 && HASH.test(round.hash ?? '');
const isRow = row => Boolean(row) && isValidPoolName(row.name) && isRound(row.round) && Number.isSafeInteger(row.nonce) &&
  HASH.test(row.bestHash ?? '') && Number.isInteger(row.bestZeros) && Number.isFinite(row.difficulty) && Number.isInteger(row.proofs);

// The round to mine. The client rebuilds the prefix itself, so a server answering for
// another chain or another name is refused instead of mined.
export async function getChallenge(name, { signal } = {}) {
  const challenge = await request(`/api/challenge?name=${encodeURIComponent(name)}`, { signal });
  if (!challenge || challenge.name !== name || !isRound(challenge.round) || !Number.isInteger(challenge.minZeros) ||
    challenge.minZeros < 1 || challenge.minZeros > 64 || challenge.genesisHash !== GENESIS.hash ||
    challenge.prefix !== proofPrefix(GENESIS.hash, challenge.round, name)) throw invalidAnswer();
  return challenge;
}

export function submitProof(challenge, nonce, { signal } = {}) {
  const { name, round } = challenge;
  return request('/api/shares', { method: 'POST', body: { name, round: { height: round.height, hash: round.hash }, nonce }, signal });
}

// { round: { height, hash, rows } | null, allTime: rows }; malformed rows are dropped.
export async function getLeaderboard({ signal } = {}) {
  const board = await request('/api/leaderboard', { signal });
  if (!board || !Array.isArray(board.allTime) || (board.round !== null && !(isRound(board.round) && Array.isArray(board.round.rows)))) {
    throw invalidAnswer();
  }
  return {
    round: board.round ? { height: board.round.height, hash: board.round.hash, rows: board.round.rows.filter(isRow) } : null,
    allTime: board.allTime.filter(isRow),
  };
}
