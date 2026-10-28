import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { readFile, realpath, stat } from 'node:fs/promises';
import path from 'node:path';
import { NAME_RE, checkName, createHiddenNames, foldName, loadNameLists, prepareNameLists } from './names.js';
import { isRound } from './bitcoinTip.js';

// The fixed genesis block of proofofwork.fyi (a copy of shared/genesis.json, written by
// shared/mine-genesis.mjs). Every proof names its hash: the work was done for this chain.
export const GENESIS = JSON.parse(readFileSync(new URL('./genesis.json', import.meta.url), 'utf8'));

export const PROOF_ZEROS = 5;
export const MIN_SHARE_ZEROS = 1;
export const MAX_SHARE_ZEROS = 8;
export const MAX_BODY_BYTES = 2048;
export const LEADERBOARD_SIZE = 20;
export const RATE_LIMITS = Object.freeze({ challenge: 30, share: 120 });
const RATE_WINDOW_MS = 60 * 1000;

const CONTENT_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.txt': 'text/plain; charset=utf-8',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.webmanifest': 'application/manifest+json',
  '.map': 'application/json; charset=utf-8',
};

export function sha256hex(input) {
  return createHash('sha256').update(input, 'utf8').digest('hex');
}

export function leadingHexZeros(hex) {
  let count = 0;
  while (count < hex.length && hex[count] === '0') count += 1;
  return count;
}

// The proof a miner searches: SHA-256 of this prefix plus the nonce in decimal. It names
// the chain (genesis hash), the round (the newest Bitcoin block) and whose work it is.
export function proofPrefix(genesisHash, round, name) {
  return `proofofwork.fyi|${genesisHash}|${round.height}:${round.hash}|${name}|`;
}

// Bitcoin-style difficulty relative to one leading hex zero: 2^252 / (hash + 1). A hash
// with z zeros scores at least 16^(z - 1); among equal zeros the smaller hash scores higher.
export function hashDifficulty(hex) {
  const scaled = (2n ** 252n * 100n) / (BigInt(`0x${hex}`) + 1n);
  return Number(scaled) / 100;
}

class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

function createRateLimiter(now) {
  const buckets = new Map();
  let lastSweep = now();

  function sweep(t) {
    if (t - lastSweep < RATE_WINDOW_MS) return;
    lastSweep = t;
    for (const [key, entry] of buckets) {
      if (t - entry.last >= RATE_WINDOW_MS) buckets.delete(key);
    }
  }

  return function take(kind, clientKey) {
    const t = now();
    sweep(t);
    const capacity = RATE_LIMITS[kind];
    const key = `${kind}\u0000${clientKey}`;
    let entry = buckets.get(key);
    if (!entry) {
      entry = { tokens: capacity, last: t };
      buckets.set(key, entry);
    } else {
      const elapsed = Math.max(0, t - entry.last);
      entry.tokens = Math.min(capacity, entry.tokens + (elapsed * capacity) / RATE_WINDOW_MS);
      entry.last = t;
    }
    if (entry.tokens < 1) return false;
    entry.tokens -= 1;
    return true;
  };
}

function clientKeyOf(req) {
  const header = req.headers['cf-connecting-ip'];
  if (typeof header === 'string' && header.length > 0) return header;
  return req.socket?.remoteAddress ?? 'unknown';
}

function readBody(req, limit) {
  return new Promise((resolve, reject) => {
    const declared = Number(req.headers['content-length']);
    if (Number.isFinite(declared) && declared > limit) {
      reject(new HttpError(413, 'body too large'));
      return;
    }
    const chunks = [];
    let size = 0;
    let done = false;
    req.on('data', (chunk) => {
      if (done) return;
      size += chunk.length;
      if (size > limit) {
        done = true;
        reject(new HttpError(413, 'body too large'));
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => {
      if (done) return;
      done = true;
      resolve(Buffer.concat(chunks).toString('utf8'));
    });
    req.on('error', (err) => {
      if (done) return;
      done = true;
      reject(err);
    });
  });
}

function parseShare(raw) {
  let body;
  try {
    body = JSON.parse(raw);
  } catch {
    throw new HttpError(400, 'invalid JSON');
  }
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw new HttpError(400, 'invalid body');
  const { name, round, nonce } = body;
  if (typeof name !== 'string' || !NAME_RE.test(name)) throw new HttpError(400, 'invalid name');
  if (!round || typeof round !== 'object' || Array.isArray(round)) throw new HttpError(400, 'invalid round');
  const { height, hash } = round;
  if (!isRound({ height, hash })) throw new HttpError(400, 'invalid round');
  if (!Number.isSafeInteger(nonce) || nonce < 0) throw new HttpError(400, 'invalid nonce');
  return { name, round: { height, hash }, nonce };
}

export function createApp({
  db,
  // The current round: { round() → {height, hash} | null, accepts({height, hash}) → boolean }.
  tip,
  now = Date.now,
  allowedOrigins = ['https://proofofwork.fyi'],
  staticDir,
  log,
  shareZeros = PROOF_ZEROS,
  genesisHash = GENESIS.hash,
  // Folded blocked/reserved/allowed name lists; defaults to the term files in server/data/.
  nameLists,
} = {}) {
  if (!db) throw new Error('createApp: db is required');
  if (!tip || typeof tip.round !== 'function' || typeof tip.accepts !== 'function') throw new Error('createApp: tip is required');
  if (typeof genesisHash !== 'string' || !/^[0-9a-f]{64}$/.test(genesisHash)) throw new Error('createApp: genesisHash is required');
  if (!Number.isInteger(shareZeros) || shareZeros < MIN_SHARE_ZEROS || shareZeros > MAX_SHARE_ZEROS) {
    throw new Error(`createApp: shareZeros must be an integer from ${MIN_SHARE_ZEROS} to ${MAX_SHARE_ZEROS}`);
  }
  const origins = new Set(allowedOrigins);
  const takeToken = createRateLimiter(now);
  const staticRoot = staticDir ? path.resolve(staticDir) : null;
  const names = nameLists ? prepareNameLists(nameLists) : loadNameLists();

  // Proofs of the pool. The earlier `shares` table of the signed-challenge pool stays
  // untouched in old databases; nothing reads it any more.
  db.exec(`
    CREATE TABLE IF NOT EXISTS proofs (
      name TEXT NOT NULL,
      round_height INTEGER NOT NULL,
      round_hash TEXT NOT NULL,
      nonce INTEGER NOT NULL,
      hash TEXT NOT NULL,
      zeros INTEGER NOT NULL,
      created_at INTEGER NOT NULL,
      UNIQUE (name, round_height, round_hash, nonce)
    );
    CREATE INDEX IF NOT EXISTS proofs_round ON proofs (round_height, round_hash);
  `);
  const hiddenNames = createHiddenNames(db);
  // Lets the leaderboard compare stored names with hidden_names.folded in SQL.
  db.function('fold_name', { deterministic: true }, (name) => foldName(name));
  const insertProof = db.prepare(
    `INSERT INTO proofs (name, round_height, round_hash, nonce, hash, zeros, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT (name, round_height, round_hash, nonce) DO NOTHING`,
  );
  // Best proof per name: the smallest hash, which means the most leading zeros and,
  // among equal zeros, the higher difficulty. Fixed-length lowercase hex sorts by value.
  // ?1 restricts to one round; NULL means all rounds.
  const selectBest = db.prepare(`
    WITH scoped AS (
      SELECT * FROM proofs
      WHERE (?1 IS NULL OR (round_height = ?1 AND round_hash = ?2))
        AND NOT EXISTS (SELECT 1 FROM hidden_names h WHERE h.folded = fold_name(proofs.name))
    ),
    ranked AS (
      SELECT *, ROW_NUMBER() OVER (PARTITION BY name ORDER BY hash ASC, created_at ASC) AS rn,
             COUNT(*) OVER (PARTITION BY name) AS proofs
      FROM scoped
    )
    SELECT name, round_height, round_hash, nonce, hash, zeros, proofs, created_at
    FROM ranked WHERE rn = 1
    ORDER BY hash ASC, created_at ASC
    LIMIT ${LEADERBOARD_SIZE}
  `);
  const leaderboardRows = (round) => selectBest.all(round?.height ?? null, round?.hash ?? null).map((row) => ({
    name: row.name,
    round: { height: row.round_height, hash: row.round_hash },
    nonce: row.nonce,
    bestHash: row.hash,
    bestZeros: row.zeros,
    difficulty: hashDifficulty(row.hash),
    proofs: row.proofs,
    foundAt: row.created_at,
  }));

  function send(res, status, payload, headers = {}) {
    const body = payload === undefined ? '' : JSON.stringify(payload);
    res.writeHead(status, {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
      'x-content-type-options': 'nosniff',
      ...headers,
    });
    res.end(body);
  }

  function applyCors(req, res) {
    const origin = req.headers.origin;
    res.setHeader('vary', 'Origin');
    if (typeof origin === 'string' && origins.has(origin)) {
      res.setHeader('access-control-allow-origin', origin);
      return true;
    }
    return false;
  }

  function checkPoolName(name) {
    const verdict = checkName(name, names);
    if (!verdict.ok && verdict.reason === 'format') throw new HttpError(400, 'invalid name');
    if (!verdict.ok || hiddenNames.isHidden(name)) throw new HttpError(400, 'name unavailable');
  }

  function handleChallenge(url, req, res) {
    if (!takeToken('challenge', clientKeyOf(req))) throw new HttpError(429, 'rate limited');
    const name = url.searchParams.get('name');
    checkPoolName(name);
    const round = tip.round();
    if (!round) throw new HttpError(503, 'round unavailable');
    send(res, 200, { name, round, prefix: proofPrefix(genesisHash, round, name), minZeros: shareZeros, genesisHash });
  }

  async function handleShare(req, res) {
    if (!takeToken('share', clientKeyOf(req))) throw new HttpError(429, 'rate limited');
    const raw = await readBody(req, MAX_BODY_BYTES);
    const { name, round, nonce } = parseShare(raw);
    // Without a signed challenge the name is checked again here, so a hidden or blocked
    // name earns nothing.
    checkPoolName(name);
    if (!tip.accepts(round)) throw new HttpError(410, 'round over');

    // Re-verify the work: never trust a client-supplied hash.
    const hash = sha256hex(proofPrefix(genesisHash, round, name) + String(nonce));
    const zeros = leadingHexZeros(hash);
    if (zeros < shareZeros) throw new HttpError(422, 'hash misses target');

    const result = insertProof.run(name, round.height, round.hash, nonce, hash, zeros, now());
    if (result.changes === 0) throw new HttpError(409, 'duplicate proof');
    send(res, 200, { accepted: true, hash, zeros, difficulty: hashDifficulty(hash), round });
  }

  function handleLeaderboard(res) {
    const round = tip.round();
    send(res, 200, { genesisHash, round: round ? { ...round, rows: leaderboardRows(round) } : null, allTime: leaderboardRows(null) });
  }

  async function serveStatic(url, req, res) {
    let decoded;
    try {
      decoded = decodeURIComponent(url.pathname);
    } catch {
      return send(res, 400, { error: 'bad path' });
    }
    if (decoded.includes('\0')) return send(res, 400, { error: 'bad path' });
    const rootReal = await realpath(staticRoot);
    const candidate = path.resolve(rootReal, `.${path.sep}${decoded}`);
    const inside = (p) => p === rootReal || p.startsWith(rootReal + path.sep);
    if (!inside(candidate)) return send(res, 404, { error: 'not found' });

    let file = null;
    try {
      const real = await realpath(candidate);
      if (inside(real) && (await stat(real)).isFile()) file = real;
    } catch {
      file = null;
    }
    if (!file) file = path.join(rootReal, 'index.html');

    let data;
    try {
      data = await readFile(file);
    } catch {
      return send(res, 404, { error: 'not found' });
    }
    res.writeHead(200, {
      'content-type': CONTENT_TYPES[path.extname(file).toLowerCase()] ?? 'application/octet-stream',
      'content-length': data.length,
      'x-content-type-options': 'nosniff',
    });
    res.end(req.method === 'HEAD' ? undefined : data);
  }

  async function route(req, res) {
    const url = new URL(req.url ?? '/', 'http://localhost');
    const { pathname } = url;

    if (pathname === '/api' || pathname.startsWith('/api/')) {
      const allowed = applyCors(req, res);
      if (req.method === 'OPTIONS') {
        if (!allowed) return send(res, 403, { error: 'origin not allowed' });
        res.writeHead(204, {
          'access-control-allow-methods': 'GET, POST, OPTIONS',
          'access-control-allow-headers': 'content-type',
          'access-control-max-age': '600',
        });
        return res.end();
      }
      if (pathname === '/api/health') {
        if (req.method !== 'GET') throw new HttpError(405, 'method not allowed');
        return send(res, 200, { ok: true });
      }
      if (pathname === '/api/challenge') {
        if (req.method !== 'GET') throw new HttpError(405, 'method not allowed');
        return handleChallenge(url, req, res);
      }
      if (pathname === '/api/shares') {
        if (req.method !== 'POST') throw new HttpError(405, 'method not allowed');
        return handleShare(req, res);
      }
      if (pathname === '/api/leaderboard') {
        if (req.method !== 'GET') throw new HttpError(405, 'method not allowed');
        return handleLeaderboard(res);
      }
      throw new HttpError(404, 'not found');
    }

    if (staticRoot && (req.method === 'GET' || req.method === 'HEAD')) return serveStatic(url, req, res);
    throw new HttpError(404, 'not found');
  }

  return async function handler(req, res) {
    const started = now();
    try {
      await route(req, res);
    } catch (err) {
      const status = err instanceof HttpError ? err.status : 500;
      if (status === 500 && log) log(`${new Date(now()).toISOString()} internal error: ${err?.message ?? err}`);
      if (res.headersSent) {
        res.destroy();
        return;
      }
      const headers = {};
      if (status === 413) {
        headers.connection = 'close';
        req.resume();
      }
      if (status === 405) headers.allow = req.url?.startsWith('/api/shares') ? 'POST, OPTIONS' : 'GET, OPTIONS';
      send(res, status, { error: status === 500 ? 'internal error' : err.message }, headers);
    } finally {
      if (log) {
        // One line per request: time, method, path (no query string), status, duration. Never the client address.
        const pathOnly = (req.url ?? '/').split('?')[0];
        log(`${new Date(started).toISOString()} ${req.method} ${pathOnly} ${res.statusCode} ${now() - started}ms`);
      }
    }
  };
}
