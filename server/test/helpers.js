import http from 'node:http';
import { DatabaseSync } from 'node:sqlite';
import { createApp, sha256hex, leadingHexZeros } from '../src/app.js';

export const SECRET = 'synthetic-test-secret-0123456789abcdef0123456789abcdef';
export const T0 = Date.UTC(2026, 0, 15, 12, 0, 0);

export async function startServer(options = {}) {
  const clock = { t: options.startAt ?? T0 };
  const db = options.db ?? new DatabaseSync(':memory:');
  const lines = [];
  const handler = createApp({
    db,
    secret: SECRET,
    now: () => clock.t,
    allowedOrigins: options.allowedOrigins ?? ['https://proofofwork.fyi'],
    staticDir: options.staticDir,
    // Low difficulty keeps in-test mining to a few hundred hashes, so the event loop
    // shared with the server is never blocked for long. Production default stays 4.
    shareZeros: options.shareZeros ?? 1,
    log: (line) => lines.push(line),
  });
  const server = http.createServer(handler);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address();
  const base = `http://127.0.0.1:${port}`;
  return {
    db,
    clock,
    lines,
    base,
    port,
    async close() {
      server.closeAllConnections();
      await new Promise((resolve) => server.close(resolve));
    },
  };
}

export async function getChallenge(srv, name, headers = {}) {
  const res = await fetch(`${srv.base}/api/challenge?name=${encodeURIComponent(name)}`, { headers });
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

export function stripChallenge({ id, name, zeros, expiresAt, sig }) {
  return { id, name, zeros, expiresAt, sig };
}

/** Find a nonce whose hash has at least `min` (and, if given, exactly `exact`) leading hex zeros. */
export function mine(prefix, { min = 1, exact, start = 0 } = {}) {
  for (let nonce = start; ; nonce += 1) {
    const hash = sha256hex(prefix + String(nonce));
    const z = leadingHexZeros(hash);
    if (z >= min && (exact === undefined || z === exact)) return { nonce, hash, zeros: z };
  }
}

/** Find a nonce whose hash misses the target of `zeros` leading hex zeros. */
export function miss(prefix, zeros) {
  for (let nonce = 0; ; nonce += 1) {
    const hash = sha256hex(prefix + String(nonce));
    if (leadingHexZeros(hash) < zeros) return { nonce, hash };
  }
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
