import { createHash } from 'node:crypto';
import http from 'node:http';
import { DatabaseSync } from 'node:sqlite';
import { createApp, sha256hex, leadingHexZeros, proofPrefix } from '../src/app.js';
import { blockHash, coinbaseTail } from '../src/blockProof.js';

export const T0 = Date.UTC(2026, 0, 15, 12, 0, 0);

// Synthetic genesis and Bitcoin rounds: no real block appears in the tests.
export const TEST_GENESIS = 'a1'.repeat(32);
export const ROUND_A = Object.freeze({ height: 900001, hash: `${'0'.repeat(20)}${'a'.repeat(44)}` });
export const ROUND_B = Object.freeze({ height: 900002, hash: `${'0'.repeat(20)}${'b'.repeat(44)}` });
export const ROUND_C = Object.freeze({ height: 900003, hash: `${'0'.repeat(20)}${'c'.repeat(44)}` });

/**
 * A tip with the same contract as createTipTracker(): round() is the newest block,
 * windowStart() the oldest height a proof may name, accepts() takes every known block
 * from there on. `window` is the number of blocks (the server uses 144; 2 keeps tests short).
 */
export function fakeTip({ current = ROUND_A, previous = null, window = 2 } = {}) {
  const state = { current, blocks: [previous, current].filter(Boolean), window };
  const windowStart = () => (state.current ? state.current.height - state.window + 1 : null);
  return {
    state,
    round: () => state.current,
    windowStart,
    accepts: (round) => Boolean(state.current) && Boolean(round) && round.height >= windowStart() &&
      state.blocks.some((known) => known.height === round.height && known.hash === round.hash),
    /** A new Bitcoin block becomes the newest round. */
    advance(next) {
      state.blocks.push(next);
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
    // shared with the server is never blocked for long. The production default is 1.
    shareZeros: options.shareZeros ?? 1,
    maxBlocks: options.maxBlocks,
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

const sha256d = (hex) => createHash('sha256').update(createHash('sha256').update(Buffer.from(hex, 'hex')).digest()).digest('hex');
const le32 = (value) => Buffer.from(new Uint32Array([value]).buffer).toString('hex');

/** A coinbase committing to `prefix`, with a one-byte scriptSig and no reward output. */
export const coinbaseFor = (prefix) => `0100000001${'00'.repeat(32)}ffffffff01510000000001${coinbaseTail(sha256hex(prefix))}`;

/** The 80-byte header over merkle root `root` (internal byte order). */
export const headerFor = (root, nonce) => `${le32(1)}${'00'.repeat(32)}${root}${le32(1785000000)}${le32(0x207fffff)}${le32(nonce)}`;

/** The block of `coinbase` under `branch` at `nonce`: { block, hash, zeros, nonce }. */
export function blockAt(coinbase, nonce, branch = []) {
  const root = branch.reduce((node, sibling) => sha256d(node + sibling), sha256d(coinbase));
  const header = headerFor(root, nonce);
  const hash = blockHash(header);
  return { block: { header, coinbase, branch }, hash, zeros: leadingHexZeros(hash), nonce };
}

/** Find a block whose hash has at least `min` (and, if given, exactly `exact`) leading hex zeros. */
export function mine(prefix, { min = 1, exact, start = 0, accept = () => true, branch = [] } = {}) {
  const coinbase = coinbaseFor(prefix);
  for (let nonce = start; ; nonce += 1) {
    const found = blockAt(coinbase, nonce, branch);
    if (found.zeros >= min && (exact === undefined || found.zeros === exact) && accept(found)) return found;
  }
}

/** Find a block whose hash misses the target of `zeros` leading hex zeros. */
export function miss(prefix, zeros) {
  const coinbase = coinbaseFor(prefix);
  for (let nonce = 0; ; nonce += 1) {
    const found = blockAt(coinbase, nonce);
    if (found.zeros < zeros) return found;
  }
}

/** Mine a block for `name` in `round` on this server and submit it. */
export async function prove(srv, name, round = srv.tip.round(), options = {}) {
  const proof = mine(srv.prefix(name, round), { min: options.min ?? 1, exact: options.exact, start: options.start ?? 0 });
  const res = await postShare(srv, { name, round, ...proof.block }, options.headers ?? {});
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
