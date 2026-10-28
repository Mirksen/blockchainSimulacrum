import http from 'node:http';
import { DatabaseSync } from 'node:sqlite';
import { createApp, sha256hex, leadingHexZeros, proofPrefix } from '../src/app.js';

export const T0 = Date.UTC(2026, 0, 15, 12, 0, 0);

// Synthetic genesis and Bitcoin rounds: no real block appears in the tests.
export const TEST_GENESIS = 'a1'.repeat(32);
export const ROUND_A = Object.freeze({ height: 900001, hash: `${'0'.repeat(20)}${'a'.repeat(44)}` });
export const ROUND_B = Object.freeze({ height: 900002, hash: `${'0'.repeat(20)}${'b'.repeat(44)}` });
export const ROUND_C = Object.freeze({ height: 900003, hash: `${'0'.repeat(20)}${'c'.repeat(44)}` });

/**
 * A tip with the same contract as createTipTracker(): round() is the current round,
 * accepts() takes the current and the previous one. Tests set the state directly.
 */
export function fakeTip({ current = ROUND_A, previous = null } = {}) {
  const state = { current, previous };
  return {
    state,
    round: () => state.current,
    accepts: (round) => [state.current, state.previous].some(
      (known) => known && round && known.height === round.height && known.hash === round.hash,
    ),
    /** A new Bitcoin block: the current round becomes the previous one. */
    advance(next) {
      state.previous = state.current;
      state.current = next;
    },
  };
}

export async function startServer(options = {}) {
  const clock = { t: options.startAt ?? T0 };
  const db = options.db ?? new DatabaseSync(':memory:');
  const tip = options.tip ?? fakeTip();
  const genesisHash = options.genesisHash ?? TEST_GENESIS;
  const lines = [];
  const handler = createApp({
    db,
    tip,
    genesisHash,
    now: () => clock.t,
    allowedOrigins: options.allowedOrigins ?? ['https://proofofwork.fyi'],
    staticDir: options.staticDir,
    // Low difficulty keeps in-test mining to a few dozen hashes, so the event loop
    // shared with the server is never blocked for long. The production default is 5.
    shareZeros: options.shareZeros ?? 1,
    nameLists: options.nameLists,
    log: (line) => lines.push(line),
  });
  const server = http.createServer(handler);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address();
  const base = `http://127.0.0.1:${port}`;
  return {
    db,
    tip,
    genesisHash,
    clock,
    lines,
    base,
    port,
    prefix: (name, round = tip.round()) => proofPrefix(genesisHash, round, name),
    async close() {
      server.closeAllConnections();
      await new Promise((resolve) => server.close(resolve));
    },
  };
}

export async function getChallenge(srv, name, headers = {}) {
  const query = name === undefined ? '' : `?name=${encodeURIComponent(name)}`;
  const res = await fetch(`${srv.base}/api/challenge${query}`, { headers });
  return { status: res.status, body: await res.json() };
}

export async function postShare(srv, payload, headers = {}) {
  const res = await fetch(`${srv.base}/api/shares`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...headers },
    body: typeof payload === 'string' ? payload : JSON.stringify(payload),
  });
  return { status: res.status, body: await res.json() };
}

export async function getLeaderboard(srv) {
  const res = await fetch(`${srv.base}/api/leaderboard`);
  return { status: res.status, body: await res.json() };
}

/** Find a nonce whose hash has at least `min` (and, if given, exactly `exact`) leading hex zeros. */
export function mine(prefix, { min = 1, exact, start = 0, accept = () => true } = {}) {
  for (let nonce = start; ; nonce += 1) {
    const hash = sha256hex(prefix + String(nonce));
    const z = leadingHexZeros(hash);
    if (z >= min && (exact === undefined || z === exact) && accept(nonce, hash)) return { nonce, hash, zeros: z };
  }
}

/** Find a nonce whose hash misses the target of `zeros` leading hex zeros. */
export function miss(prefix, zeros) {
  for (let nonce = 0; ; nonce += 1) {
    const hash = sha256hex(prefix + String(nonce));
    if (leadingHexZeros(hash) < zeros) return { nonce, hash };
  }
}

/** Mine a proof for `name` in `round` on this server and submit it. */
export async function prove(srv, name, round = srv.tip.round(), options = {}) {
  const proof = mine(srv.prefix(name, round), { min: options.min ?? 1, exact: options.exact, start: options.start ?? 0 });
  const res = await postShare(srv, { name, round, nonce: proof.nonce }, options.headers ?? {});
  return { ...proof, res };
}

export function rawGet(port, rawPath) {
  return new Promise((resolve, reject) => {
    const req = http.request({ host: '127.0.0.1', port, path: rawPath, method: 'GET' }, (res) => {
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body: Buffer.concat(chunks).toString('utf8') }));
    });
    req.on('error', reject);
    req.end();
  });
}
