import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import http from 'node:http';
import { DatabaseSync } from 'node:sqlite';
import {
  createApp,
  proofPrefix,
  hashDifficulty,
  sha256hex,
  leadingHexZeros,
  GENESIS,
  PROOF_ZEROS,
  MIN_SHARE_ZEROS,
  MAX_SHARE_ZEROS,
  LEADERBOARD_SIZE,
} from '../src/app.js';
import { createHiddenNames } from '../src/names.js';
import {
  T0,
  TEST_GENESIS,
  ROUND_A,
  ROUND_B,
  ROUND_C,
  fakeTip,
  startServer,
  getChallenge,
  postShare,
  getLeaderboard,
  mine,
  miss,
  prove,
  rawGet,
} from './helpers.js';

const countProofs = (srv) => srv.db.prepare('SELECT COUNT(*) AS n FROM proofs').get().n;

async function withApp(options, fn) {
  const server = http.createServer(createApp({ db: new DatabaseSync(':memory:'), now: () => T0, ...options }));
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  try {
    return await fn(`http://127.0.0.1:${server.address().port}`);
  } finally {
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
  }
}

describe('proofPrefix and hashDifficulty', () => {
  test('the prefix names the genesis hash, the round and the miner', () => {
    assert.equal(
      proofPrefix(TEST_GENESIS, ROUND_A, 'sample-miner'),
      `proofofwork.fyi|${TEST_GENESIS}|900001:${ROUND_A.hash}|sample-miner|`,
    );
  });

  test('difficulty is 2^252 / (hash + 1) with two decimals', () => {
    assert.equal(hashDifficulty(`0${'f'.repeat(63)}`), 1, 'the easiest one-zero hash scores 1');
    assert.equal(hashDifficulty(`00${'f'.repeat(62)}`), 16, 'the easiest two-zero hash scores 16');
    assert.equal(hashDifficulty(`1${'0'.repeat(63)}`), 0.99);
    assert.equal(hashDifficulty('f'.repeat(64)), 0.06);
    assert.equal(hashDifficulty(`8${'0'.repeat(63)}`), 0.12, 'truncated, not rounded');
    assert.ok(Math.abs(hashDifficulty('0'.repeat(64)) / 2 ** 252 - 1) < 1e-12, 'the zero hash scores 2^252');
    assert.ok(hashDifficulty(`00${'1'.repeat(62)}`) > hashDifficulty(`00${'2'.repeat(62)}`), 'smaller hash, higher difficulty');
  });
});

describe('createApp options', () => {
  test('shareZeros defaults to PROOF_ZEROS (5) and genesisHash to the shipped genesis block', async () => {
    assert.equal(PROOF_ZEROS, 5);
    assert.equal(MIN_SHARE_ZEROS, 1);
    assert.equal(MAX_SHARE_ZEROS, 8);
    await withApp({ tip: fakeTip() }, async (base) => {
      const res = await fetch(`${base}/api/challenge?name=default-miner`);
      assert.equal(res.status, 200);
      const body = await res.json();
      assert.equal(body.minZeros, 5);
      assert.equal(body.genesisHash, GENESIS.hash);
      assert.equal(body.prefix, proofPrefix(GENESIS.hash, ROUND_A, 'default-miner'));
      const lb = await (await fetch(`${base}/api/leaderboard`)).json();
      assert.equal(lb.genesisHash, GENESIS.hash);
    });
  });

  test('shareZeros is limited to 1..8', () => {
    const db = new DatabaseSync(':memory:');
    for (const bad of [0, 9, 2.5, '4', -1]) {
      assert.throws(() => createApp({ db, tip: fakeTip(), shareZeros: bad }), /shareZeros/, String(bad));
    }
    for (const ok of [1, 8]) assert.doesNotThrow(() => createApp({ db: new DatabaseSync(':memory:'), tip: fakeTip(), shareZeros: ok }));
  });

  test('db and a tip are required; genesisHash must be 64 lowercase hex characters', () => {
    const db = new DatabaseSync(':memory:');
    assert.throws(() => createApp({ tip: fakeTip() }), /db is required/);
    assert.throws(() => createApp({ db }), /tip is required/);
    assert.throws(() => createApp({ db, tip: { round: () => ROUND_A } }), /tip is required/);
    for (const bad of ['abc', 'A1'.repeat(32), 42, '']) {
      assert.throws(() => createApp({ db, tip: fakeTip(), genesisHash: bad }), /genesisHash/, String(bad));
    }
  });
});

describe('challenge endpoint', () => {
  let srv;
  before(async () => {
    srv = await startServer();
  });
  after(() => srv.close());

  test('answers the round, the prefix and the target without storing anything', async () => {
    const { status, body } = await getChallenge(srv, 'sample-miner');
    assert.equal(status, 200);
    assert.deepEqual(body, {
      name: 'sample-miner',
      round: ROUND_A,
      windowStart: ROUND_A.height - 1,
      prefix: `proofofwork.fyi|${TEST_GENESIS}|${ROUND_A.height}:${ROUND_A.hash}|sample-miner|`,
      minZeros: 1,
      genesisHash: TEST_GENESIS,
    });
    assert.equal(countProofs(srv), 0, 'challenges must not be stored');
  });

  test('rejects bad names with 400 invalid name', async () => {
    for (const name of ['ab', 'bad name', 'x'.repeat(21), 'semi;colon', 'émile', '', undefined]) {
      const { status, body } = await getChallenge(srv, name);
      assert.equal(status, 400, `name ${JSON.stringify(name)}`);
      assert.deepEqual(body, { error: 'invalid name' });
    }
  });

  test('answers 503 round unavailable while the tip is unknown', async () => {
    srv.tip.state.current = null;
    try {
      const { status, body } = await getChallenge(srv, 'early-miner');
      assert.equal(status, 503);
      assert.deepEqual(body, { error: 'round unavailable' });
      const lb = await getLeaderboard(srv);
      assert.equal(lb.status, 200);
      assert.deepEqual(lb.body, { genesisHash: TEST_GENESIS, recent: null, allTime: [] });
    } finally {
      srv.tip.state.current = ROUND_A;
    }
  });

  test('follows the tip to the next round', async () => {
    srv.tip.advance(ROUND_B);
    const { body } = await getChallenge(srv, 'sample-miner');
    assert.deepEqual(body.round, ROUND_B);
    assert.equal(body.prefix, proofPrefix(TEST_GENESIS, ROUND_B, 'sample-miner'));
  });

  test('other methods get 405', async () => {
    const res = await fetch(`${srv.base}/api/challenge?name=sample-miner`, { method: 'POST' });
    assert.equal(res.status, 405);
    assert.equal(res.headers.get('allow'), 'GET, OPTIONS');
  });
});

describe('share verification', () => {
  let srv;
  before(async () => {
    // Current round B, previous round A: both accepted.
    srv = await startServer({ tip: fakeTip({ current: ROUND_B, previous: ROUND_A }) });
  });
  after(() => srv.close());

  test('an accepted proof answers its hash, zeros, difficulty and round and is stored once', async () => {
    const proof = mine(srv.prefix('honest-miner'), { min: 1 });
    const res = await postShare(srv, { name: 'honest-miner', round: ROUND_B, nonce: proof.nonce });
    assert.equal(res.status, 200);
    assert.deepEqual(res.body, {
      accepted: true,
      hash: proof.hash,
      zeros: proof.zeros,
      difficulty: hashDifficulty(proof.hash),
      round: ROUND_B,
    });
    assert.equal(proof.hash, sha256hex(`proofofwork.fyi|${TEST_GENESIS}|${ROUND_B.height}:${ROUND_B.hash}|honest-miner|${proof.nonce}`));
    const rows = srv.db.prepare("SELECT * FROM proofs WHERE name = 'honest-miner'").all().map((row) => ({ ...row }));
    assert.deepEqual(rows, [{
      genesis_hash: TEST_GENESIS,
      name: 'honest-miner',
      round_height: ROUND_B.height,
      round_hash: ROUND_B.hash,
      nonce: proof.nonce,
      hash: proof.hash,
      zeros: proof.zeros,
      created_at: T0,
    }]);
  });

  test('an older block inside the window is still accepted', async () => {
    const { res } = await prove(srv, 'slow-miner', ROUND_A);
    assert.equal(res.status, 200);
    assert.deepEqual(res.body.round, ROUND_A);
  });

  test('the same proof again is 409 duplicate proof and stored once', async () => {
    const { nonce, res } = await prove(srv, 'dup-miner');
    assert.equal(res.status, 200);
    const again = await postShare(srv, { name: 'dup-miner', round: ROUND_B, nonce });
    assert.equal(again.status, 409);
    assert.deepEqual(again.body, { error: 'duplicate proof' });
    assert.equal(srv.db.prepare("SELECT COUNT(*) AS n FROM proofs WHERE name = 'dup-miner'").get().n, 1);
  });

  test('a nonce that misses the target is 422 hash misses target; client hash and zeros are ignored', async () => {
    const before = countProofs(srv);
    const bad = miss(srv.prefix('forger-01'), 1);
    const res = await postShare(srv, { name: 'forger-01', round: ROUND_B, nonce: bad.nonce, hash: '0'.repeat(64), zeros: 64 });
    assert.equal(res.status, 422);
    assert.deepEqual(res.body, { error: 'hash misses target' });
    assert.equal(countProofs(srv), before);
  });

  test('a proof is bound to its name and its round', async () => {
    const before = countProofs(srv);
    // Hits the target for bound-miner in round B, misses it for another name or round.
    const proof = mine(srv.prefix('bound-miner', ROUND_B), {
      min: 1,
      accept: (nonce) =>
        leadingHexZeros(sha256hex(srv.prefix('other-miner', ROUND_B) + nonce)) === 0 &&
        leadingHexZeros(sha256hex(srv.prefix('bound-miner', ROUND_A) + nonce)) === 0,
    });
    const otherName = await postShare(srv, { name: 'other-miner', round: ROUND_B, nonce: proof.nonce });
    assert.equal(otherName.status, 422);
    const otherRound = await postShare(srv, { name: 'bound-miner', round: ROUND_A, nonce: proof.nonce });
    assert.equal(otherRound.status, 422);
    assert.equal(countProofs(srv), before);
    assert.equal((await postShare(srv, { name: 'bound-miner', round: ROUND_B, nonce: proof.nonce })).status, 200);
  });

  test('an unknown block or one outside the window is 410 round over', async () => {
    const before = countProofs(srv);
    const unknown = { height: ROUND_B.height, hash: `${'0'.repeat(20)}${'d'.repeat(44)}` };
    for (const round of [ROUND_C, unknown, { height: 1, hash: ROUND_A.hash }]) {
      const proof = mine(srv.prefix('late-miner', round), { min: 1 });
      const res = await postShare(srv, { name: 'late-miner', round, nonce: proof.nonce });
      assert.equal(res.status, 410, JSON.stringify(round));
      assert.deepEqual(res.body, { error: 'round over' });
    }
    assert.equal(countProofs(srv), before);
  });

  test('malformed share bodies are rejected with 400', async () => {
    const ok = { name: 'malformed', round: ROUND_B, nonce: 1 };
    const cases = [
      ['not json', 'invalid JSON'],
      ['[]', 'invalid body'],
      ['null', 'invalid body'],
      ['"text"', 'invalid body'],
      [{}, 'invalid name'],
      [{ ...ok, name: 'no' }, 'invalid name'],
      [{ ...ok, name: 'bad name' }, 'invalid name'],
      [{ ...ok, name: 42 }, 'invalid name'],
      [{ name: 'malformed', nonce: 1 }, 'invalid round'],
      [{ ...ok, round: [ROUND_B.height, ROUND_B.hash] }, 'invalid round'],
      [{ ...ok, round: 'round-b' }, 'invalid round'],
      [{ ...ok, round: { hash: ROUND_B.hash } }, 'invalid round'],
      [{ ...ok, round: { height: -1, hash: ROUND_B.hash } }, 'invalid round'],
      [{ ...ok, round: { height: 1.5, hash: ROUND_B.hash } }, 'invalid round'],
      [{ ...ok, round: { height: '900002', hash: ROUND_B.hash } }, 'invalid round'],
      [{ ...ok, round: { height: ROUND_B.height, hash: ROUND_B.hash.toUpperCase() } }, 'invalid round'],
      [{ ...ok, round: { height: ROUND_B.height, hash: ROUND_B.hash.slice(1) } }, 'invalid round'],
      [{ ...ok, nonce: undefined }, 'invalid nonce'],
      [{ ...ok, nonce: -1 }, 'invalid nonce'],
      [{ ...ok, nonce: 1.5 }, 'invalid nonce'],
      [{ ...ok, nonce: '12' }, 'invalid nonce'],
      [{ ...ok, nonce: Number.MAX_SAFE_INTEGER + 1 }, 'invalid nonce'],
    ];
    const before = countProofs(srv);
    for (const [payload, error] of cases) {
      const res = await postShare(srv, payload);
      assert.equal(res.status, 400, JSON.stringify(payload));
      assert.deepEqual(res.body, { error }, JSON.stringify(payload));
    }
    assert.equal(countProofs(srv), before);
  });

  test('body larger than 2 KB is rejected with 413', async () => {
    const payload = JSON.stringify({ name: 'big-body', round: ROUND_B, nonce: 1, pad: 'x'.repeat(3000) });
    const res = await postShare(srv, payload);
    assert.equal(res.status, 413);
    assert.deepEqual(res.body, { error: 'body too large' });
  });

  test('other methods get 405', async () => {
    const res = await fetch(`${srv.base}/api/shares`);
    assert.equal(res.status, 405);
    assert.equal(res.headers.get('allow'), 'POST, OPTIONS');
  });
});

describe('target enforcement above one zero', () => {
  let srv;
  before(async () => {
    srv = await startServer({ shareZeros: 2 });
  });
  after(() => srv.close());

  test('a proof with fewer leading zeros than minZeros is 422; enough zeros is 200', async () => {
    const { body: ch } = await getChallenge(srv, 'near-miss');
    assert.equal(ch.minZeros, 2);
    const short = mine(ch.prefix, { exact: 1 });
    const res = await postShare(srv, { name: 'near-miss', round: ch.round, nonce: short.nonce });
    assert.equal(res.status, 422);
    assert.equal(countProofs(srv), 0);

    const enough = mine(ch.prefix, { min: 2 });
    const ok = await postShare(srv, { name: 'near-miss', round: ch.round, nonce: enough.nonce });
    assert.equal(ok.status, 200);
    assert.equal(ok.body.zeros, enough.zeros);
    assert.ok(ok.body.difficulty >= 16);
  });
});

describe('leaderboard', () => {
  let srv;
  const at = async (t, fn) => {
    srv.clock.t = t;
    return fn();
  };
  const summary = (rows) => rows.map((r) => [r.name, r.round.height, r.bestZeros, r.proofs]);
  before(async () => {
    srv = await startServer();
  });
  after(() => srv.close());

  test('starts empty', async () => {
    const { status, body } = await getLeaderboard(srv);
    assert.equal(status, 200);
    assert.deepEqual(body, { genesisHash: TEST_GENESIS, recent: { from: ROUND_A.height - 1, to: ROUND_A.height, rows: [] }, allTime: [] });
  });

  let big;
  let small;
  let deep;
  test('ranks the best hash per name: more zeros first, among equal zeros the smaller hash', async () => {
    // equal-big comes first in time, equal-small later with a smaller hash at the same zeros.
    big = mine(srv.prefix('equal-big'), { exact: 1 });
    small = mine(srv.prefix('equal-small'), { exact: 1, accept: (_, hash) => hashDifficulty(hash) > hashDifficulty(big.hash) });
    deep = mine(srv.prefix('deep-miner'), { exact: 2 });
    const worseDeep = mine(srv.prefix('deep-miner'), { exact: 1 });
    const worseBig = mine(srv.prefix('equal-big'), { exact: 1, accept: (_, hash) => hash > big.hash });
    const post = (name, proof) => postShare(srv, { name, round: ROUND_A, nonce: proof.nonce });
    for (const [t, name, proof] of [
      [T0 + 1000, 'equal-big', big],
      [T0 + 2000, 'equal-small', small],
      [T0 + 3000, 'deep-miner', deep],
      [T0 + 4000, 'deep-miner', worseDeep],
      [T0 + 5000, 'equal-big', worseBig],
    ]) {
      assert.equal((await at(t, () => post(name, proof))).status, 200, name);
    }

    const { body } = await getLeaderboard(srv);
    assert.deepEqual(body.recent.rows, body.allTime, 'one round so far: both lists agree');
    assert.deepEqual(summary(body.recent.rows), [
      ['deep-miner', ROUND_A.height, 2, 2],
      ['equal-small', ROUND_A.height, 1, 1],
      ['equal-big', ROUND_A.height, 1, 2],
    ]);
    assert.deepEqual(body.recent.rows[0], {
      name: 'deep-miner',
      round: ROUND_A,
      nonce: deep.nonce,
      bestHash: deep.hash,
      bestZeros: 2,
      difficulty: hashDifficulty(deep.hash),
      proofs: 2,
      foundAt: T0 + 3000,
    });
    assert.equal(body.recent.rows[2].bestHash, big.hash, 'the best of two proofs, not the latest');
    assert.equal(body.recent.rows[2].foundAt, T0 + 1000);
    const [d0, d1, d2] = body.recent.rows.map((r) => r.difficulty);
    assert.ok(d0 > d1 && d1 > d2, 'difficulty descends with the ranking');
  });

  test('the recent list holds the window; all-time spans every round', async () => {
    // Window of two blocks: A and B both count as recent.
    srv.tip.advance(ROUND_B);
    let { body } = await getLeaderboard(srv);
    assert.deepEqual([body.recent.from, body.recent.to], [ROUND_A.height, ROUND_B.height]);
    assert.deepEqual(body.recent.rows, body.allTime);

    const fresh = await at(T0 + 7000, () => prove(srv, 'round-b-miner', ROUND_B, { exact: 2 }));
    assert.equal(fresh.res.status, 200);
    const lateA = await at(T0 + 8000, () => prove(srv, 'late-a-miner', ROUND_A, { exact: 3 }));
    assert.equal(lateA.res.status, 200);
    ({ body } = await getLeaderboard(srv));
    assert.equal(body.recent.rows[0].name, 'late-a-miner');
    assert.deepEqual(body.recent.rows.find((r) => r.name === 'round-b-miner').round, ROUND_B);

    // One block on, A leaves the window: its proofs leave the recent list and earn nothing new.
    srv.tip.advance(ROUND_C);
    const tooLate = await prove(srv, 'equal-big', ROUND_A, { start: 1000 });
    assert.equal(tooLate.res.status, 410);
    const stillB = await prove(srv, 'equal-big', ROUND_B);
    assert.equal(stillB.res.status, 200);
    ({ body } = await getLeaderboard(srv));
    assert.deepEqual([body.recent.from, body.recent.to], [ROUND_B.height, ROUND_C.height]);
    assert.deepEqual(body.recent.rows.map((r) => r.name).sort(), ['equal-big', 'round-b-miner']);
    for (const row of body.recent.rows) assert.ok(row.round.height >= ROUND_B.height);

    const allTime = body.allTime.map((r) => r.bestHash);
    assert.deepEqual(allTime, [...allTime].sort(), 'all-time is ordered by hash');
    assert.deepEqual(
      body.allTime.map((r) => r.name).sort(),
      ['deep-miner', 'equal-big', 'equal-small', 'late-a-miner', 'round-b-miner'],
    );
    const bigRow = body.allTime.find((r) => r.name === 'equal-big');
    assert.deepEqual([bigRow.bestHash, bigRow.round, bigRow.proofs], [big.hash, ROUND_A, 3]);
  });

  test('proofs for another genesis never count', async () => {
    const other = await startServer({ db: srv.db, genesisHash: 'b2'.repeat(32), tip: srv.tip });
    try {
      const { body } = await getLeaderboard(other);
      assert.deepEqual([body.recent.rows, body.allTime], [[], []]);
      assert.equal((await prove(other, 'next-genesis', ROUND_C)).res.status, 200);
      assert.deepEqual((await getLeaderboard(other)).body.allTime.map((r) => r.name), ['next-genesis']);
      assert.ok(!(await getLeaderboard(srv)).body.allTime.some((r) => r.name === 'next-genesis'));
    } finally {
      await other.close();
    }
  });

  test('a hidden name leaves the round list and the all-time list', async () => {
    const hidden = createHiddenNames(srv.db);
    let { body } = await getLeaderboard(srv);
    const before = body.allTime.map((r) => r.name);
    hidden.hide('Equal-Smal', T0); // folds to the same name as equal-small
    srv.tip.state.window = 3;
    try {
      ({ body } = await getLeaderboard(srv));
      assert.ok(!body.recent.rows.some((r) => r.name === 'equal-small'));
      assert.deepEqual(body.allTime.map((r) => r.name), before.filter((name) => name !== 'equal-small'));
    } finally {
      hidden.unhide('equal-small');
      srv.tip.state.window = 2;
    }
  });
});

describe('leaderboard limits and ties', () => {
  let srv;
  const insert = (name, round, nonce, hash, createdAt) => srv.db
    .prepare('INSERT INTO proofs (genesis_hash, name, round_height, round_hash, nonce, hash, zeros, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
    .run(TEST_GENESIS, name, round.height, round.hash, nonce, hash, leadingHexZeros(hash), createdAt);
  before(async () => {
    srv = await startServer();
  });
  after(() => srv.close());

  test('an equal hash is ranked by the earlier proof', async () => {
    const hash = `000${'7'.repeat(61)}`;
    insert('tie-late', ROUND_A, 1, hash, T0 + 2000);
    insert('tie-early', ROUND_A, 2, hash, T0 + 1000);
    const { body } = await getLeaderboard(srv);
    assert.deepEqual(body.recent.rows.map((r) => r.name), ['tie-early', 'tie-late']);
    assert.deepEqual(body.allTime.map((r) => r.name), ['tie-early', 'tie-late']);
  });

  test(`returns at most ${LEADERBOARD_SIZE} rows`, async () => {
    for (let i = 0; i < 22; i += 1) {
      insert(`filler-${String(i).padStart(2, '0')}`, ROUND_A, i, `0${(0x100 + i).toString(16)}${'e'.repeat(60)}`, T0 + 10_000 + i);
    }
    const { body } = await getLeaderboard(srv);
    assert.equal(LEADERBOARD_SIZE, 20);
    assert.equal(body.recent.rows.length, 20);
    assert.equal(body.allTime.length, 20);
    assert.deepEqual(body.allTime.slice(0, 3).map((r) => r.name), ['tie-early', 'tie-late', 'filler-00']);
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
    const limited = await getChallenge(srv, 'rate-miner', client);
    assert.equal(limited.status, 429);
    assert.deepEqual(limited.body, { error: 'rate limited' });
    assert.equal((await getChallenge(srv, 'rate-miner', { 'cf-connecting-ip': '198.51.100.11' })).status, 200);
    srv.clock.t += 60_000;
    assert.equal((await getChallenge(srv, 'rate-miner', client)).status, 200);
  });

  test('120 share requests per minute per client, then 429', async () => {
    const client = { 'cf-connecting-ip': '198.51.100.20' };
    for (let i = 0; i < 120; i += 1) {
      assert.equal((await postShare(srv, '{}', client)).status, 400, `request ${i + 1}`);
    }
    const limited = await postShare(srv, '{}', client);
    assert.equal(limited.status, 429);
    assert.deepEqual(limited.body, { error: 'rate limited' });
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
    const good = mine(ch.prefix, { min: ch.minZeros });
    const res = await postShare(srv, { name: 'privacy-miner', round: ch.round, nonce: good.nonce }, headers);
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

    const columns = srv.db.prepare('PRAGMA table_info(proofs)').all().map((c) => c.name);
    assert.deepEqual(columns, ['genesis_hash', 'name', 'round_height', 'round_hash', 'nonce', 'hash', 'zeros', 'created_at']);
    const dump = JSON.stringify(srv.db.prepare('SELECT * FROM proofs').all());
    assert.ok(dump.includes('privacy-miner'));
    assert.ok(!dump.includes(ip));
    assert.ok(!dump.includes('127.0.0.1'));
  });
});
