import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import http from 'node:http';
import { DatabaseSync } from 'node:sqlite';
import { createApp, challengePrefix, signChallenge, CHALLENGE_TTL_MS } from '../src/app.js';
import {
  SECRET,
  T0,
  startServer,
  getChallenge,
  postShare,
  stripChallenge,
  mine,
  miss,
  rawGet,
} from './helpers.js';

describe('challenge endpoint', () => {
  let srv;
  before(async () => {
    srv = await startServer();
  });
  after(() => srv.close());

  test('issues a signed, stateless challenge', async () => {
    const { status, body } = await getChallenge(srv, 'sample-miner');
    assert.equal(status, 200);
    assert.match(body.id, /^[0-9a-f]{32}$/);
    assert.equal(body.name, 'sample-miner');
    assert.equal(body.zeros, 1, 'challenge zeros follow the configured shareZeros');
    assert.equal(body.expiresAt, T0 + CHALLENGE_TTL_MS);
    assert.equal(body.prefix, `proofofwork.fyi|${body.id}|sample-miner|`);
    assert.equal(body.sig, signChallenge(SECRET, body));
    const count = srv.db.prepare('SELECT COUNT(*) AS n FROM shares').get().n;
    assert.equal(count, 0, 'challenges must not be stored');
  });

  test('shareZeros defaults to 4 and is limited to 1..6', async () => {
    const db = new DatabaseSync(':memory:');
    const handler = createApp({ db, secret: SECRET, now: () => T0 });
    const server = http.createServer(handler);
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
    try {
      const res = await fetch(`http://127.0.0.1:${server.address().port}/api/challenge?name=default-zeros`);
      const body = await res.json();
      assert.equal(res.status, 200);
      assert.equal(body.zeros, 4);
      assert.equal(body.sig, signChallenge(SECRET, body));
    } finally {
      server.closeAllConnections();
      await new Promise((resolve) => server.close(resolve));
    }
    for (const bad of [0, 7, 2.5, '4']) {
      assert.throws(() => createApp({ db, secret: SECRET, shareZeros: bad }), /shareZeros/);
    }
  });

  test('rejects bad names with 400', async () => {
    for (const name of ['ab', 'bad name', 'x'.repeat(21), 'semi;colon', 'émile', '']) {
      const { status } = await getChallenge(srv, name);
      assert.equal(status, 400, `name ${JSON.stringify(name)}`);
    }
    const res = await fetch(`${srv.base}/api/challenge`);
    assert.equal(res.status, 400);
  });
});

describe('share verification', () => {
  let srv;
  before(async () => {
    srv = await startServer();
  });
  after(() => srv.close());

  test('forged hash/nonce that misses the target is rejected with 422', async () => {
    const { body: ch } = await getChallenge(srv, 'forger-01');
    const bad = miss(ch.prefix, ch.zeros);
    const res = await postShare(srv, {
      challenge: stripChallenge(ch),
      nonce: bad.nonce,
      hash: '0'.repeat(64),
      zeros: 64,
    });
    assert.equal(res.status, 422);
    const n = srv.db.prepare('SELECT COUNT(*) AS n FROM shares').get().n;
    assert.equal(n, 0);
  });

  test('tampered signature or challenge fields are rejected with 403', async () => {
    const { body: ch } = await getChallenge(srv, 'tamper-01');
    const good = mine(ch.prefix, { min: ch.zeros });
    const flipped = ch.sig.slice(0, -1) + (ch.sig.endsWith('0') ? '1' : '0');
    const variants = [
      { ...stripChallenge(ch), sig: flipped },
      { ...stripChallenge(ch), name: 'tamper-02' },
      { ...stripChallenge(ch), zeros: ch.zeros + 1 },
      { ...stripChallenge(ch), expiresAt: ch.expiresAt + 1 },
    ];
    for (const challenge of variants) {
      const res = await postShare(srv, { challenge, nonce: good.nonce });
      assert.equal(res.status, 403, JSON.stringify(challenge));
    }
  });

  test('expired challenge is rejected with 410', async () => {
    const { body: ch } = await getChallenge(srv, 'late-miner');
    const good = mine(ch.prefix, { min: ch.zeros });
    srv.clock.t = ch.expiresAt + 1;
    try {
      const res = await postShare(srv, { challenge: stripChallenge(ch), nonce: good.nonce });
      assert.equal(res.status, 410);
    } finally {
      srv.clock.t = T0;
    }
  });

  test('accepted share earns 16^target points; duplicate is 409 and counted once', async () => {
    const { body: ch } = await getChallenge(srv, 'dup-miner');
    const good = mine(ch.prefix, { min: ch.zeros });
    const first = await postShare(srv, { challenge: stripChallenge(ch), nonce: good.nonce });
    assert.equal(first.status, 200);
    assert.deepEqual(first.body, { accepted: true, zeros: good.zeros, points: 16 ** ch.zeros });

    const second = await postShare(srv, { challenge: stripChallenge(ch), nonce: good.nonce });
    assert.equal(second.status, 409);

    const lb = await (await fetch(`${srv.base}/api/leaderboard`)).json();
    const row = lb.find((r) => r.name === 'dup-miner');
    assert.equal(row.shares, 1);
    assert.equal(row.points, 16 ** ch.zeros);
    assert.equal(row.bestHash, good.hash);
    assert.equal(row.bestZeros, good.zeros);
  });

  test('malformed share bodies are rejected with 400', async () => {
    const { body: ch } = await getChallenge(srv, 'malformed');
    const c = stripChallenge(ch);
    const bodies = [
      'not json',
      '[]',
      { nonce: 1 },
      { challenge: c },
      { challenge: c, nonce: -1 },
      { challenge: c, nonce: 1.5 },
      { challenge: c, nonce: '12' },
      { challenge: c, nonce: Number.MAX_SAFE_INTEGER + 1 },
      { challenge: { ...c, id: 'xyz' }, nonce: 1 },
      { challenge: { ...c, name: 'no' }, nonce: 1 },
      { challenge: { ...c, sig: 'abc' }, nonce: 1 },
      { challenge: { ...c, expiresAt: 'soon' }, nonce: 1 },
    ];
    for (const b of bodies) {
      const res = await postShare(srv, b);
      assert.equal(res.status, 400, JSON.stringify(b));
    }
  });

  test('body larger than 2 KB is rejected with 413', async () => {
    const { body: ch } = await getChallenge(srv, 'big-body');
    const payload = JSON.stringify({ challenge: stripChallenge(ch), nonce: 1, pad: 'x'.repeat(3000) });
    const res = await postShare(srv, payload);
    assert.equal(res.status, 413);
  });
});

describe('target enforcement above one zero', () => {
  let srv;
  before(async () => {
    srv = await startServer({ shareZeros: 2 });
  });
  after(() => srv.close());

  test('share with fewer leading zeros than the challenge demands is rejected with 422', async () => {
    const { body: ch } = await getChallenge(srv, 'near-miss');
    assert.equal(ch.zeros, 2);
    const short = mine(ch.prefix, { exact: 1 });
    const res = await postShare(srv, { challenge: stripChallenge(ch), nonce: short.nonce });
    assert.equal(res.status, 422);
    assert.equal(srv.db.prepare('SELECT COUNT(*) AS n FROM shares').get().n, 0);

    const enough = mine(ch.prefix, { min: 2 });
    const ok = await postShare(srv, { challenge: stripChallenge(ch), nonce: enough.nonce });
    assert.equal(ok.status, 200);
    assert.deepEqual(ok.body, { accepted: true, zeros: enough.zeros, points: 16 ** ch.zeros });

    // A lucky hash beyond the target earns the same points; only bestZeros shows it.
    const lucky = mine(ch.prefix, { min: 3, start: enough.nonce + 1 });
    const extra = await postShare(srv, { challenge: stripChallenge(ch), nonce: lucky.nonce });
    assert.equal(extra.status, 200);
    assert.equal(extra.body.points, 16 ** ch.zeros);
    assert.ok(extra.body.zeros >= 3);
  });
});

describe('leaderboard', () => {
  let srv;
  before(async () => {
    srv = await startServer({ shareZeros: 2 });
  });
  after(() => srv.close());

  async function submit(name, at) {
    srv.clock.t = at;
    const { body: ch } = await getChallenge(srv, name);
    const share = mine(ch.prefix, { exact: 2 });
    const res = await postShare(srv, { challenge: stripChallenge(ch), nonce: share.nonce });
    assert.equal(res.status, 200);
    assert.equal(res.body.points, 256);
    return share;
  }

  test('orders by points desc, then earliest created_at', async () => {
    await submit('tie-late', T0 + 3000);
    await submit('tie-early', T0 + 1000);
    await submit('top-miner', T0 + 2000);
    await submit('top-miner', T0 + 4000);

    const res = await fetch(`${srv.base}/api/leaderboard`);
    assert.equal(res.status, 200);
    const lb = await res.json();
    assert.deepEqual(
      lb.map((r) => [r.name, r.points, r.shares, r.bestZeros]),
      [
        ['top-miner', 512, 2, 2],
        ['tie-early', 256, 1, 2],
        ['tie-late', 256, 1, 2],
      ],
    );
    for (const row of lb) {
      assert.deepEqual(Object.keys(row).sort(), ['bestHash', 'bestZeros', 'name', 'points', 'shares']);
      assert.match(row.bestHash, /^00[1-9a-f][0-9a-f]{61}$/);
    }
  });

  test('returns at most 20 rows', async () => {
    for (let i = 0; i < 22; i += 1) {
      const name = `filler-${String(i).padStart(2, '0')}`;
      const id = `${'ab'.repeat(15)}${String(i).padStart(2, '0')}`;
      const prefix = challengePrefix(id, name);
      const share = mine(prefix, { min: 0 });
      srv.db
        .prepare('INSERT INTO shares (challenge_id, nonce, name, hash, zeros, points, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
        .run(id, share.nonce, name, share.hash, share.zeros, 1, T0 + 10_000 + i);
    }
    const lb = await (await fetch(`${srv.base}/api/leaderboard`)).json();
    assert.equal(lb.length, 20);
    assert.equal(lb[0].name, 'top-miner');
  });
});

describe('rate limiting', () => {
  let srv;
  before(async () => {
    srv = await startServer();
  });
  after(() => srv.close());

  test('30 challenge requests per minute per client, then 429', async () => {
    const client = { 'cf-connecting-ip': '198.51.100.10' };
    for (let i = 0; i < 30; i += 1) {
      assert.equal((await getChallenge(srv, 'rate-miner', client)).status, 200, `request ${i + 1}`);
    }
    assert.equal((await getChallenge(srv, 'rate-miner', client)).status, 429);
    assert.equal((await getChallenge(srv, 'rate-miner', { 'cf-connecting-ip': '198.51.100.11' })).status, 200);
    srv.clock.t += 60_000;
    assert.equal((await getChallenge(srv, 'rate-miner', client)).status, 200);
  });

  test('120 share requests per minute per client, then 429', async () => {
    const client = { 'cf-connecting-ip': '198.51.100.20' };
    for (let i = 0; i < 120; i += 1) {
      assert.equal((await postShare(srv, '{}', client)).status, 400, `request ${i + 1}`);
    }
    assert.equal((await postShare(srv, '{}', client)).status, 429);
  });
});

describe('CORS', () => {
  let srv;
  before(async () => {
    srv = await startServer({ allowedOrigins: ['https://proofofwork.fyi', 'http://localhost:5173'] });
  });
  after(() => srv.close());

  test('allowed origin gets Access-Control-Allow-Origin', async () => {
    const res = await fetch(`${srv.base}/api/health`, { headers: { origin: 'https://proofofwork.fyi' } });
    assert.equal(res.status, 200);
    assert.deepEqual(await res.json(), { ok: true });
    assert.equal(res.headers.get('access-control-allow-origin'), 'https://proofofwork.fyi');
  });

  test('foreign origin gets no Access-Control-Allow-Origin', async () => {
    const res = await fetch(`${srv.base}/api/health`, { headers: { origin: 'https://attacker.example' } });
    assert.equal(res.headers.get('access-control-allow-origin'), null);
  });

  test('preflight for POST with content-type', async () => {
    const ok = await fetch(`${srv.base}/api/shares`, {
      method: 'OPTIONS',
      headers: {
        origin: 'http://localhost:5173',
        'access-control-request-method': 'POST',
        'access-control-request-headers': 'content-type',
      },
    });
    assert.equal(ok.status, 204);
    assert.equal(ok.headers.get('access-control-allow-origin'), 'http://localhost:5173');
    assert.match(ok.headers.get('access-control-allow-methods'), /POST/);
    assert.match(ok.headers.get('access-control-allow-headers'), /content-type/i);

    const foreign = await fetch(`${srv.base}/api/shares`, {
      method: 'OPTIONS',
      headers: { origin: 'https://attacker.example', 'access-control-request-method': 'POST' },
    });
    assert.equal(foreign.status, 403);
    assert.equal(foreign.headers.get('access-control-allow-origin'), null);
  });
});

describe('static serving', () => {
  let srv;
  let dir;
  const MARKER = 'SYNTHETIC-OUTSIDE-MARKER-7f3a';
  before(async () => {
    dir = await mkdtemp(path.join(tmpdir(), 'pow4-static-'));
    const pub = path.join(dir, 'public');
    await mkdir(path.join(pub, 'assets'), { recursive: true });
    await writeFile(path.join(dir, 'package.json'), JSON.stringify({ marker: MARKER }));
    await writeFile(path.join(pub, 'index.html'), '<!doctype html><title>spa-index</title>');
    await writeFile(path.join(pub, 'assets', 'app.js'), 'console.log("asset");');
    srv = await startServer({ staticDir: pub });
  });
  after(async () => {
    await srv.close();
    await rm(dir, { recursive: true, force: true });
  });

  test('serves files and falls back to index.html', async () => {
    const asset = await rawGet(srv.port, '/assets/app.js');
    assert.equal(asset.status, 200);
    assert.match(asset.headers['content-type'], /javascript/);
    assert.equal(asset.body, 'console.log("asset");');

    for (const p of ['/', '/leaderboard', '/deep/spa/route']) {
      const res = await rawGet(srv.port, p);
      assert.equal(res.status, 200, p);
      assert.match(res.headers['content-type'], /text\/html/);
      assert.match(res.body, /spa-index/);
    }
  });

  test('does not serve files outside staticDir', async () => {
    for (const p of ['/../package.json', '/%2e%2e/package.json', '/..%2fpackage.json', '/assets/../../package.json', '/%2e%2e%2f%2e%2e%2fpackage.json']) {
      const res = await rawGet(srv.port, p);
      assert.ok(!res.body.includes(MARKER), `${p} leaked outside file (status ${res.status})`);
    }
  });

  test('unknown /api paths are not answered by the SPA fallback', async () => {
    const res = await rawGet(srv.port, '/api/nope');
    assert.equal(res.status, 404);
    assert.doesNotMatch(res.body, /spa-index/);
  });
});

describe('privacy: no client address in logs or database', () => {
  let srv;
  before(async () => {
    srv = await startServer();
  });
  after(() => srv.close());

  test('log lines and stored rows never contain the client key', async () => {
    const ip = '203.0.113.77';
    const headers = { 'cf-connecting-ip': ip };
    await fetch(`${srv.base}/api/health`, { headers });
    const { body: ch } = await getChallenge(srv, 'privacy-miner', headers);
    const good = mine(ch.prefix, { min: ch.zeros });
    const res = await postShare(srv, { challenge: stripChallenge(ch), nonce: good.nonce }, headers);
    assert.equal(res.status, 200);
    await fetch(`${srv.base}/api/leaderboard`); // no cf-connecting-ip: socket address path

    assert.equal(srv.lines.length, 4, 'one log line per request');
    const lineRe = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z (GET|POST) \/[A-Za-z0-9/_.-]* \d{3} \d+ms$/;
    assert.equal(srv.lines[0], `${new Date(T0).toISOString()} GET /api/health 200 0ms`);
    for (const line of srv.lines) {
      assert.match(line, lineRe);
      for (const needle of [ip, '127.0.0.1', '::1', 'privacy-miner']) {
        assert.ok(!line.includes(needle), `log line leaks ${needle}: ${line}`);
      }
    }

    const columns = srv.db.prepare('PRAGMA table_info(shares)').all().map((c) => c.name);
    assert.deepEqual(columns, ['challenge_id', 'nonce', 'name', 'hash', 'zeros', 'points', 'created_at']);
    const dump = JSON.stringify(srv.db.prepare('SELECT * FROM shares').all());
    assert.ok(!dump.includes(ip));
    assert.ok(!dump.includes('127.0.0.1'));
  });
});
