import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { hashDifficulty, leadingHexZeros, MINER_ROUNDS } from '../src/app.js';
import { createHiddenNames } from '../src/names.js';
import { T0, TEST_GENESIS, ROUND_A, ROUND_B, ROUND_C, fakeTip, startServer, getLeaderboard, prove } from './helpers.js';

const OTHER_GENESIS = 'b2'.repeat(32);
// Synthetic hashes: fixed-length lowercase hex, so they sort by value.
const hashOf = (start, fill = 'e') => `${start}${fill.repeat(64 - start.length)}`;

async function getMiner(srv, name, init = {}) {
  const query = name === undefined ? '' : `?name=${encodeURIComponent(name)}`;
  const res = await fetch(`${srv.base}/api/miner${query}`, init);
  return { status: res.status, headers: res.headers, body: await res.json() };
}

function insert(srv, { genesis = TEST_GENESIS, name, round, hash, createdAt, proofs = 1 }) {
  srv.db
    .prepare(`INSERT INTO blocks (genesis_hash, name, round_height, round_hash, header, coinbase, branch, hash, zeros, proofs, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
    .run(genesis, name, round.height, round.hash, '00'.repeat(80), '0100', '[]', hash, leadingHexZeros(hash), proofs, createdAt);
}

describe('miner profile', () => {
  let srv;
  before(async () => {
    // A window of two blocks: B and C are in it, A is a finished round.
    srv = await startServer({ tip: fakeTip({ current: ROUND_C, previous: ROUND_B, window: 2 }) });
    insert(srv, { name: 'profile-miner', round: ROUND_A, hash: hashOf('0001'), createdAt: T0 + 1000 });
    insert(srv, { name: 'profile-miner', round: ROUND_B, hash: hashOf('05'), createdAt: T0 + 2000, proofs: 5 });
    insert(srv, { name: 'profile-miner', round: ROUND_C, hash: hashOf('03'), createdAt: T0 + 3000, proofs: 2 });
    insert(srv, { name: 'old-leader', round: ROUND_A, hash: hashOf('0000a'), createdAt: T0 + 500 });
    insert(srv, { name: 'window-leader', round: ROUND_C, hash: hashOf('02'), createdAt: T0 + 4000 });
    // Same letters, other case: another name on the board, not a round of profile-miner.
    insert(srv, { name: 'Profile-Miner', round: ROUND_B, hash: hashOf('01'), createdAt: T0 + 5000 });
    // A better block for another genesis never shows.
    insert(srv, { genesis: OTHER_GENESIS, name: 'profile-miner', round: ROUND_C, hash: hashOf('00000'), createdAt: T0 + 6000 });
  });
  after(() => srv.close());

  test('answers every round of the name, newest first, with both ranks', async () => {
    const { status, headers, body } = await getMiner(srv, 'profile-miner');
    assert.equal(status, 200);
    assert.equal(headers.get('cache-control'), 'no-store');
    assert.equal(body.name, 'profile-miner');
    assert.deepEqual(body.summary, { allTime: { bestHash: hashOf('0001'), bestZeros: 3, proofs: 8, rounds: 3 }, window: { bestHash: hashOf('03'), bestZeros: 1, proofs: 7, rounds: 2 } });
    assert.deepEqual(body.rank, { window: 3, allTime: 2 });
    assert.deepEqual(body.blocks.map((b) => [b.round.height, b.bestHash, b.proofs, b.inWindow]), [
      [ROUND_C.height, hashOf('03'), 2, true],
      [ROUND_B.height, hashOf('05'), 5, true],
      [ROUND_A.height, hashOf('0001'), 1, false],
    ]);
    assert.deepEqual(body.blocks[0], {
      round: ROUND_C,
      header: '00'.repeat(80),
      coinbase: '0100',
      branch: [],
      bestHash: hashOf('03'),
      bestZeros: 1,
      difficulty: hashDifficulty(hashOf('03')),
      proofs: 2,
      foundAt: T0 + 3000,
      rank: 2,
      inWindow: true,
    });
  });

  test('ranks are the places on the leaderboard', async () => {
    const { body: board } = await getLeaderboard(srv);
    for (const name of ['profile-miner', 'old-leader', 'window-leader', 'Profile-Miner']) {
      const { body } = await getMiner(srv, name);
      const recent = board.recent.rows.findIndex((row) => row.name === name);
      const allTime = board.allTime.findIndex((row) => row.name === name);
      assert.deepEqual(body.rank, { window: recent === -1 ? null : recent + 1, allTime: allTime === -1 ? null : allTime + 1 }, name);
    }
    assert.deepEqual((await getMiner(srv, 'old-leader')).body.rank, { window: null, allTime: 1 });
    assert.deepEqual((await getMiner(srv, 'Profile-Miner')).body.blocks.map((b) => b.round.height), [ROUND_B.height]);
  });

  test('a block of the current round answers what the server stored', async () => {
    // Its own database, so the mined hash cannot move the ranks of the other tests.
    const own = await startServer({ tip: srv.tip, startAt: T0 + 9000 });
    let body;
    let proof;
    try {
      proof = await prove(own, 'fresh-miner', ROUND_C);
      assert.equal(proof.res.status, 200);
      ({ body } = await getMiner(own, 'fresh-miner'));
    } finally {
      await own.close();
    }
    assert.deepEqual(body.rank, { window: 1, allTime: 1 });
    assert.deepEqual(body.blocks, [{
      round: ROUND_C,
      ...proof.block,
      bestHash: proof.hash,
      bestZeros: proof.zeros,
      difficulty: hashDifficulty(proof.hash),
      proofs: 1,
      foundAt: T0 + 9000,
      rank: 1,
      inWindow: true,
    }]);
  });

  test('without a known tip no round is in the window', async () => {
    const blind = await startServer({ db: srv.db, tip: fakeTip({ current: null }) });
    try {
      const { status, body } = await getMiner(blind, 'profile-miner');
      assert.equal(status, 200);
      assert.deepEqual(body.rank, { window: null, allTime: 2 });
      assert.ok(body.blocks.every((b) => b.inWindow === false));
    } finally {
      await blind.close();
    }
  });

  test('another genesis only sees its own blocks', async () => {
    const other = await startServer({ db: srv.db, genesisHash: OTHER_GENESIS, tip: srv.tip });
    try {
      const { body } = await getMiner(other, 'profile-miner');
      assert.deepEqual(body.blocks.map((b) => b.bestHash), [hashOf('00000')]);
      assert.deepEqual(body.rank, { window: 1, allTime: 1 });
      assert.equal((await getMiner(other, 'old-leader')).status, 404);
    } finally {
      await other.close();
    }
  });

  test('a malformed name is 400 invalid name', async () => {
    for (const name of [undefined, '', 'ab', 'bad name', 'x'.repeat(21), 'emoji-☃']) {
      const { status, body } = await getMiner(srv, name);
      assert.equal(status, 400, String(name));
      assert.deepEqual(body, { error: 'invalid name' });
    }
  });

  test('an unknown and a hidden name get the same 404', async () => {
    const unknown = await getMiner(srv, 'nobody-here');
    assert.equal(unknown.status, 404);
    assert.deepEqual(unknown.body, { error: 'unknown name' });
    const hidden = createHiddenNames(srv.db);
    hidden.hide('Window-Leadder', T0); // folds to the same name as window-leader
    try {
      const answer = await getMiner(srv, 'window-leader');
      assert.equal(answer.status, unknown.status);
      assert.deepEqual(answer.body, unknown.body);
      // Hidden names leave the ranking for everyone else too, as on the leaderboard.
      assert.deepEqual((await getMiner(srv, 'profile-miner')).body.rank, { window: 2, allTime: 2 });
    } finally {
      hidden.unhide('window-leader');
    }
  });

  test(`lists at most ${MINER_ROUNDS} rounds, the newest`, async () => {
    for (let i = 1; i <= MINER_ROUNDS + 5; i += 1) {
      insert(srv, { name: 'many-rounds', round: { height: 800000 + i, hash: i.toString(16).padStart(64, '0') }, hash: hashOf('7'), createdAt: T0 + i });
    }
    const { body } = await getMiner(srv, 'many-rounds');
    assert.equal(MINER_ROUNDS, 200);
    assert.equal(body.blocks.length, MINER_ROUNDS);
    assert.equal(body.summary.allTime.rounds, MINER_ROUNDS + 5);
    assert.equal(body.summary.allTime.proofs, MINER_ROUNDS + 5);
    assert.deepEqual([body.blocks[0].round.height, body.blocks.at(-1).round.height], [800000 + MINER_ROUNDS + 5, 800006]);
  });

  test('other methods get 405', async () => {
    const res = await fetch(`${srv.base}/api/miner?name=profile-miner`, { method: 'POST' });
    assert.equal(res.status, 405);
    assert.equal(res.headers.get('allow'), 'GET, OPTIONS');
    assert.deepEqual(await res.json(), { error: 'method not allowed' });
  });

  test('CORS: an allowed origin is named, a foreign one is not, and preflight works', async () => {
    const allowed = await getMiner(srv, 'profile-miner', { headers: { origin: 'https://proofofwork.fyi' } });
    assert.equal(allowed.headers.get('access-control-allow-origin'), 'https://proofofwork.fyi');
    assert.equal(allowed.headers.get('vary'), 'Origin');
    const foreign = await getMiner(srv, 'profile-miner', { headers: { origin: 'https://attacker.example' } });
    assert.equal(foreign.status, 200);
    assert.equal(foreign.headers.get('access-control-allow-origin'), null);
    const notFound = await getMiner(srv, 'nobody-here', { headers: { origin: 'https://proofofwork.fyi' } });
    assert.equal(notFound.headers.get('access-control-allow-origin'), 'https://proofofwork.fyi');
    const preflight = await fetch(`${srv.base}/api/miner?name=profile-miner`, {
      method: 'OPTIONS',
      headers: { origin: 'https://proofofwork.fyi', 'access-control-request-method': 'GET' },
    });
    assert.equal(preflight.status, 204);
    assert.match(preflight.headers.get('access-control-allow-methods'), /GET/);
  });
});
