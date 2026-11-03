// Client for the leaderboard pool server. Every call has its own timeout and
// turns a failed answer into an Error with a numeric `status` (0 when the
// server could not be reached or answered with something unreadable).
import { GENESIS, proofPrefix } from './poolProof';

export const POOL_API = (import.meta.env?.VITE_POOL_API || 'https://api.proofofwork.fyi').replace(/\/+$/, '');
export const POOL_TIMEOUT_MS = 10_000;

// Same rule as the server: 3–20 letters, digits or hyphens.
const NAME_PATTERN = /^[A-Za-z0-9-]{3,20}$/;
export const isValidPoolName = name => typeof name === 'string' && NAME_PATTERN.test(name);
export const NAME_HINT = 'Use 3–20 characters: letters, digits or hyphens.';
// The page addresses of the board and of one miner's profile (App.jsx reads them back).
export const POOL_HASH = '#/pool';
export const minerProfileHash = name => `${POOL_HASH}/${encodeURIComponent(name)}`;

const MESSAGES = {
  400: 'The leaderboard did not accept this request.',
  409: 'This block was already counted.',
  410: 'This round is over: its Bitcoin block left the window.',
  413: 'The block was too large to send.',
  422: 'The leaderboard did not accept this block.',
  429: 'Too many requests to the leaderboard. Please wait a minute.',
};

function poolError(status, message, code) {
  return Object.assign(new Error(message), { status, ...(code ? { code } : {}) });
}

export const NAME_UNAVAILABLE_MESSAGE = 'This name is not available. Please choose another.';
export const UNKNOWN_MINER_MESSAGE = 'No blocks for this name yet.';
// What the leaderboard views say while the server cannot answer.
export const POOL_UNAVAILABLE_MESSAGE = 'The leaderboard server is unavailable right now. The simulator keeps working.';

const messageFor = status => MESSAGES[status] ||
  (status >= 500 ? 'The leaderboard server is unavailable right now.' : 'The leaderboard answered with an unexpected error.');

// The server decides which names are available; a refused name gets its own code
// so the panel can point at the name field instead of retrying.
async function failureFor(response) {
  if (response.status === 400 || response.status === 404) {
    let body = null;
    try { body = await response.json(); } catch { /* No readable body: a plain error. */ }
    if (response.status === 400 && body?.error === 'name unavailable') {
      return poolError(response.status, NAME_UNAVAILABLE_MESSAGE, 'name-unavailable');
    }
    // A name without blocks, or one the operator hid: the server answers both alike.
    if (response.status === 404 && body?.error === 'unknown name') {
      return poolError(response.status, UNKNOWN_MINER_MESSAGE, 'unknown-name');
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
const isBlock = row => Boolean(row) && isRound(row.round) && /^[0-9a-f]{160}$/.test(row.header ?? '') &&
  /^[0-9a-f]+$/.test(row.coinbase ?? '') && Array.isArray(row.branch) && row.branch.every(node => HASH.test(node)) &&
  HASH.test(row.bestHash ?? '') && Number.isInteger(row.bestZeros) && Number.isFinite(row.difficulty) && Number.isInteger(row.proofs);
const isRow = row => isBlock(row) && isValidPoolName(row.name);
const isRank = rank => rank === null || (Number.isSafeInteger(rank) && rank >= 1);

// The round to mine. The client rebuilds the prefix itself, so a server answering for
// another chain or another name is refused instead of mined.
export async function getChallenge(name, { signal } = {}) {
  const challenge = await request(`/api/challenge?name=${encodeURIComponent(name)}`, { signal });
  if (!challenge || challenge.name !== name || !isRound(challenge.round) || !Number.isInteger(challenge.minZeros) ||
    !Number.isSafeInteger(challenge.windowStart) || challenge.windowStart > challenge.round.height ||
    challenge.minZeros < 1 || challenge.minZeros > 64 || challenge.genesisHash !== GENESIS.hash ||
    challenge.prefix !== proofPrefix(GENESIS.hash, challenge.round, name)) throw invalidAnswer();
  return challenge;
}

// `proof` is { header, coinbase, branch } of a mined block (poolProof.js).
export function submitProof({ name, round }, proof, { signal } = {}) {
  return request('/api/shares', { method: 'POST', body: { name, round: { height: round.height, hash: round.hash }, ...proof }, signal });
}

// { recent: { from, to, rows } | null, allTime: rows }; malformed rows are dropped.
export async function getLeaderboard({ signal } = {}) {
  const board = await request('/api/leaderboard', { signal });
  const recentOk = board?.recent === null || (Number.isSafeInteger(board?.recent?.from) && Number.isSafeInteger(board.recent.to) &&
    board.recent.from <= board.recent.to && Array.isArray(board.recent.rows));
  if (!board || !Array.isArray(board.allTime) || !recentOk) {
    throw invalidAnswer();
  }
  return {
    recent: board.recent ? { from: board.recent.from, to: board.recent.to, rows: board.recent.rows.filter(isRow) } : null,
    allTime: board.allTime.filter(isRow),
  };
}

// { name, rank: { window, allTime }, blocks } of one miner name. An answer for another
// name is refused; malformed blocks are dropped, and each kept block carries the name, so
// it verifies like a leaderboard row. A name without blocks fails with code 'unknown-name'.
export async function getMiner(name, { signal } = {}) {
  const miner = await request(`/api/miner?name=${encodeURIComponent(name)}`, { signal });
  if (!miner || miner.name !== name || !miner.rank || !isRank(miner.rank.window) || !isRank(miner.rank.allTime) ||
    !Array.isArray(miner.blocks)) throw invalidAnswer();
  return {
    name,
    rank: { window: miner.rank.window, allTime: miner.rank.allTime },
    blocks: miner.blocks.filter(block => isBlock(block) && typeof block.inWindow === 'boolean' && Number.isFinite(block.foundAt))
      .map(block => ({ ...block, name })),
  };
}
