import { test } from 'node:test';
import assert from 'node:assert/strict';
import { startServer, fakeTip, ROUND_A, ROUND_B, ROUND_C, TEST_GENESIS, T0 } from './helpers.js';
import { createHiddenNames } from '../src/names.js';

const hash = digit => digit.repeat(64);
test('finished rounds are bounded, scoped, ranked and counted from retained visible rows', async () => {
  const srv = await startServer({ tip: fakeTip({ current: ROUND_C, previous: ROUND_B, window: 2 }) });
  try {
    const insert = srv.db.prepare('INSERT INTO blocks VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)');
    const add = (name, round, best, count = 1, genesis = TEST_GENESIS) => insert.run(genesis, name, round.height, round.hash, '00'.repeat(80), '0100', '[]', best, 1, count, T0);
    add('test-alpha', ROUND_A, hash('2'), 3);
    add('test-beta', ROUND_A, hash('1'), 4);
    add('test-hidden', ROUND_A, hash('0'), 99);
    createHiddenNames(srv.db).hide('test-hidden', T0);
    add('test-window', ROUND_B, hash('0'));
    add('test-other', ROUND_A, hash('0'), 1, hash('b'));
    const url = `${srv.base}/api/rounds`;
    const res = await fetch(url, { headers: { origin: 'https://proofofwork.fyi' } });
    assert.equal(res.status, 200);
    assert.equal(res.headers.get('access-control-allow-origin'), 'https://proofofwork.fyi');
    assert.deepEqual((await res.json()).rounds, [{ round: ROUND_A, name: 'test-beta', bestHash: hash('1'), bestZeros: 1, proofs: 7, miners: 2 }]);
    for (const limit of ['', '0', '-1', '21', '1.5', 'abc', '01']) {
      assert.equal((await fetch(`${url}?limit=${encodeURIComponent(limit)}`)).status, 400, limit);
    }
    assert.equal((await fetch(url, { method: 'POST' })).status, 405);
    assert.equal((await fetch(url, { headers: { origin: 'https://foreign.example' } })).headers.get('access-control-allow-origin'), null);
    // Add older rounds: the newest finished ones are shown, never window rounds.
    for (let n = 1; n <= 25; n++) add('test-alpha', { height: ROUND_A.height - n, hash: n.toString(16).padStart(64, '0') }, hash('3'));
    const rows = (await (await fetch(url)).json()).rounds;
    assert.equal(rows.length, 20);
    assert.equal(rows[0].round.height, ROUND_A.height);
    assert.equal(rows.at(-1).round.height, ROUND_A.height - 19);
    assert.equal((await (await fetch(`${url}?limit=1`)).json()).rounds.length, 1);
    for (let n = 0; n < 30; n++) await fetch(url);
    assert.equal((await fetch(url)).status, 429);
  } finally { await srv.close(); }
});

test('no known Bitcoin tip cannot label rounds finished', async () => {
  const srv = await startServer({ tip: fakeTip({ current: null }) });
  try { assert.equal((await fetch(`${srv.base}/api/rounds`)).status, 503); }
  finally { await srv.close(); }
});
