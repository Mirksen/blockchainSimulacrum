import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { readFile, realpath, stat } from 'node:fs/promises';
import path from 'node:path';
import { NAME_RE, checkName, createHiddenNames, foldName, loadNameLists, prepareNameLists } from './names.js';

export const CHALLENGE_ZEROS = 4;
export const MIN_SHARE_ZEROS = 1;
export const MAX_SHARE_ZEROS = 6;
export const CHALLENGE_TTL_MS = 10 * 60 * 1000;
export const MAX_BODY_BYTES = 2048;
export const LEADERBOARD_SIZE = 20;
export const RATE_LIMITS = Object.freeze({ challenge: 30, share: 120 });
const RATE_WINDOW_MS = 60 * 1000;

const ID_RE = /^[0-9a-f]{32}$/;
const SIG_RE = /^[0-9a-f]{64}$/;

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

export function challengePrefix(id, name) {
  return `proofofwork.fyi|${id}|${name}|`;
}

export function signChallenge(secret, { id, name, zeros, expiresAt }) {
  return createHmac('sha256', secret).update(`${id}|${name}|${zeros}|${expiresAt}`, 'utf8').digest('hex');
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
  const { challenge, nonce } = body;
  if (!challenge || typeof challenge !== 'object' || Array.isArray(challenge)) {
    throw new HttpError(400, 'invalid challenge');
  }
  const { id, name, zeros, expiresAt, sig } = challenge;
  if (typeof id !== 'string' || !ID_RE.test(id)) throw new HttpError(400, 'invalid challenge id');
  if (typeof name !== 'string' || !NAME_RE.test(name)) throw new HttpError(400, 'invalid name');
  if (!Number.isInteger(zeros) || zeros < 1 || zeros > 64) throw new HttpError(400, 'invalid zeros');
  if (!Number.isSafeInteger(expiresAt) || expiresAt < 0) throw new HttpError(400, 'invalid expiresAt');
  if (typeof sig !== 'string' || !SIG_RE.test(sig)) throw new HttpError(400, 'invalid sig');
  if (!Number.isSafeInteger(nonce) || nonce < 0) throw new HttpError(400, 'invalid nonce');
  return { challenge: { id, name, zeros, expiresAt, sig }, nonce };
}

export function createApp({
  db,
  secret,
  now = Date.now,
  allowedOrigins = ['https://proofofwork.fyi'],
  staticDir,
  log,
  shareZeros = CHALLENGE_ZEROS,
  // Folded blocked/reserved/allowed name lists; defaults to the term files in server/data/.
  nameLists,
} = {}) {
  if (!db) throw new Error('createApp: db is required');
  if (typeof secret !== 'string' || secret.length === 0) throw new Error('createApp: secret is required');
  if (!Number.isInteger(shareZeros) || shareZeros < MIN_SHARE_ZEROS || shareZeros > MAX_SHARE_ZEROS) {
    throw new Error(`createApp: shareZeros must be an integer from ${MIN_SHARE_ZEROS} to ${MAX_SHARE_ZEROS}`);
  }
  const origins = new Set(allowedOrigins);
  const takeToken = createRateLimiter(now);
  const staticRoot = staticDir ? path.resolve(staticDir) : null;
  const names = nameLists ? prepareNameLists(nameLists) : loadNameLists();

  db.exec(`
    CREATE TABLE IF NOT EXISTS shares (
      challenge_id TEXT NOT NULL,
      nonce INTEGER NOT NULL,
      name TEXT NOT NULL,
      hash TEXT NOT NULL,
      zeros INTEGER NOT NULL,
      points INTEGER NOT NULL,
      created_at INTEGER NOT NULL,
      UNIQUE (challenge_id, nonce)
    );
    CREATE INDEX IF NOT EXISTS shares_name ON shares (name);
  `);
  const hiddenNames = createHiddenNames(db);
  // Lets the leaderboard compare stored names with hidden_names.folded in SQL.
  db.function('fold_name', { deterministic: true }, (name) => foldName(name));
  const insertShare = db.prepare(
    `INSERT INTO shares (challenge_id, nonce, name, hash, zeros, points, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT (challenge_id, nonce) DO NOTHING`,
  );
  const selectLeaderboard = db.prepare(`
    WITH best AS (
      SELECT name, hash, zeros,
             ROW_NUMBER() OVER (PARTITION BY name ORDER BY zeros DESC, created_at ASC, rowid ASC) AS rn
      FROM shares
    ),
    totals AS (
      SELECT name, SUM(points) AS points, COUNT(*) AS shares, MIN(created_at) AS first_at
      FROM shares
      GROUP BY name
    )
    SELECT t.name AS name, t.points AS points, t.shares AS shares, b.hash AS bestHash, b.zeros AS bestZeros
    FROM totals t
    JOIN best b ON b.name = t.name AND b.rn = 1
    WHERE NOT EXISTS (SELECT 1 FROM hidden_names h WHERE h.folded = fold_name(t.name))
    ORDER BY t.points DESC, t.first_at ASC, t.name ASC
    LIMIT ${LEADERBOARD_SIZE}
  `);

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

  function handleChallenge(url, req, res) {
    if (!takeToken('challenge', clientKeyOf(req))) throw new HttpError(429, 'rate limited');
    const name = url.searchParams.get('name');
    const verdict = checkName(name, names);
    if (!verdict.ok && verdict.reason === 'format') throw new HttpError(400, 'invalid name');
    if (!verdict.ok || hiddenNames.isHidden(name)) throw new HttpError(400, 'name unavailable');
    const id = randomBytes(16).toString('hex');
    const zeros = shareZeros;
    const expiresAt = now() + CHALLENGE_TTL_MS;
    const sig = signChallenge(secret, { id, name, zeros, expiresAt });
    send(res, 200, { id, name, zeros, expiresAt, sig, prefix: challengePrefix(id, name) });
  }

  async function handleShare(req, res) {
    if (!takeToken('share', clientKeyOf(req))) throw new HttpError(429, 'rate limited');
    const raw = await readBody(req, MAX_BODY_BYTES);
    const { challenge, nonce } = parseShare(raw);

    const expected = Buffer.from(signChallenge(secret, challenge), 'hex');
    const given = Buffer.from(challenge.sig, 'hex');
    if (given.length !== expected.length || !timingSafeEqual(given, expected)) {
      throw new HttpError(403, 'bad signature');
    }
    // A challenge issued before the operator hid its name earns nothing more.
    if (hiddenNames.isHidden(challenge.name)) throw new HttpError(403, 'name unavailable');
    if (now() > challenge.expiresAt) throw new HttpError(410, 'challenge expired');

    // Re-verify the work: never trust a client-supplied hash.
    const hash = sha256hex(challengePrefix(challenge.id, challenge.name) + String(nonce));
    const z = leadingHexZeros(hash);
    if (z < challenge.zeros) throw new HttpError(422, 'hash misses target');

    // Pool rule: a share is worth its target's expected work (16^zeros), not the
    // luck of a hash that happens to exceed it; bestHash shows that luck separately.
    const points = 16 ** challenge.zeros;
    const result = insertShare.run(challenge.id, nonce, challenge.name, hash, z, points, now());
    if (result.changes === 0) throw new HttpError(409, 'duplicate share');
    send(res, 200, { accepted: true, zeros: z, points });
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
        return send(res, 200, selectLeaderboard.all().map((row) => ({ ...row })));
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
