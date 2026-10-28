import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { DatabaseSync } from 'node:sqlite';
import { ROUND_A, startServer, getChallenge, postShare, prove, mine } from './helpers.js';

const ADMIN = fileURLToPath(new URL('../src/admin.js', import.meta.url));
const run = promisify(execFile);

// Synthetic placeholder terms only: no real blocked word appears in this file.
const syntheticLists = { blocked: ['zorblax', 'qux'], reserved: ['sysop'], allowed: [] };

describe('challenge refuses unavailable names', () => {
  let srv;
  before(async () => {
    srv = await startServer({ nameLists: syntheticLists });
  });
  after(() => srv.close());

  test('blocked and reserved names get 400 name unavailable; format errors keep their answer', async () => {
    for (const name of ['zorblax', 'Z0RBL4X', 'my-zorblax-rig', 'qux', 'sysop', 'Sys-0p']) {
      const { status, body } = await getChallenge(srv, name);
      assert.equal(status, 400, name);
      assert.deepEqual(body, { error: 'name unavailable' }, name);
    }
    const format = await getChallenge(srv, 'ab');
    assert.equal(format.status, 400);
    assert.deepEqual(format.body, { error: 'invalid name' });
    assert.equal((await getChallenge(srv, 'qux-miner')).status, 200);
  });

  test('a share for a blocked or reserved name is 400 name unavailable and not stored', async () => {
    for (const name of ['zorblax', 'Z0RBL4X', 'my-zorblax-rig', 'qux', 'sysop']) {
      const proof = mine(srv.prefix(name), { min: 1 });
      const res = await postShare(srv, { name, round: ROUND_A, nonce: proof.nonce });
      assert.equal(res.status, 400, name);
      assert.deepEqual(res.body, { error: 'name unavailable' }, name);
    }
    assert.equal(srv.db.prepare('SELECT COUNT(*) AS n FROM proofs').get().n, 0);
    assert.equal((await prove(srv, 'qux-miner')).res.status, 200);
  });
});

describe('default term files', () => {
  let srv;
  before(async () => {
    srv = await startServer();
  });
  after(() => srv.close());

  test('reserved names from server/data are refused', async () => {
    for (const name of ['Admin', 'r00t', 'Pro0f-of-Work']) {
      const { status, body } = await getChallenge(srv, name);
      assert.equal(status, 400, name);
      assert.deepEqual(body, { error: 'name unavailable' }, name);
    }
  });
});

describe('operator hides a name with src/admin.js', () => {
  let srv;
  let dir;
  let dbPath;
  const admin = (...args) => run(process.execPath, [ADMIN, ...args], { env: { ...process.env, DB_PATH: dbPath } });

  before(async () => {
    dir = await mkdtemp(path.join(tmpdir(), 'pow-admin-'));
    dbPath = path.join(dir, 'leaderboard.sqlite');
    srv = await startServer({ db: new DatabaseSync(dbPath), nameLists: syntheticLists });
  });
  after(async () => {
    await srv.close();
    srv.db.close();
    await rm(dir, { recursive: true, force: true });
  });

  const board = async () => {
    const body = await (await fetch(`${srv.base}/api/leaderboard`)).json();
    return { round: body.round.rows.map((row) => row.name).sort(), allTime: body.allTime.map((row) => row.name).sort() };
  };

  test('hide removes the name from both leaderboards and refuses challenges and shares; unhide restores', async () => {
    assert.equal((await prove(srv, 'loud-miner')).res.status, 200);
    assert.equal((await prove(srv, 'calm-miner')).res.status, 200);
    // A second proof of loud-miner, mined but held back until the name is hidden.
    const held = mine(srv.prefix('loud-miner'), { min: 1, start: 1000 });
    const both = ['calm-miner', 'loud-miner'];
    assert.deepEqual(await board(), { round: both, allTime: both });

    // A different spelling of the same folded name hides it too.
    const hidden = await admin('hide', 'Loud-M1ner');
    assert.equal(hidden.stdout, 'hidden: Loud-M1ner (folded: loudminer)\n');
    assert.equal((await admin('hide', 'loud-miner')).stdout, 'already hidden: loud-miner (folded: loudminer)\n');
    assert.match((await admin('list-hidden')).stdout, /^loudminer\t\d{4}-\d{2}-\d{2}T[\d:.]+Z\n$/);

    assert.deepEqual(await board(), { round: ['calm-miner'], allTime: ['calm-miner'] });
    for (const name of ['loud-miner', 'LOUD-MINER', 'l0ud-miner']) {
      const refused = await getChallenge(srv, name);
      assert.equal(refused.status, 400, name);
      assert.deepEqual(refused.body, { error: 'name unavailable' });
    }
    const late = await postShare(srv, { name: 'loud-miner', round: ROUND_A, nonce: held.nonce });
    assert.equal(late.status, 400);
    assert.deepEqual(late.body, { error: 'name unavailable' });
    assert.equal(srv.db.prepare("SELECT COUNT(*) AS n FROM proofs WHERE name = 'loud-miner'").get().n, 1);

    assert.equal((await admin('unhide', 'loud-miner')).stdout, 'unhidden: loud-miner (folded: loudminer)\n');
    assert.equal((await admin('unhide', 'loud-miner')).stdout, 'not hidden: loud-miner (folded: loudminer)\n');
    assert.equal((await admin('list-hidden')).stdout, 'no hidden names\n');
    assert.deepEqual(await board(), { round: both, allTime: both });
    assert.equal((await getChallenge(srv, 'loud-miner')).status, 200);
    assert.equal((await postShare(srv, { name: 'loud-miner', round: ROUND_A, nonce: held.nonce })).status, 200);
  });

  test('bad usage exits with status 1 and a usage line', async () => {
    for (const args of [[], ['hide'], ['hide', 'a b'], ['hide', 'ab'], ['unhide'], ['list-hidden', 'extra'], ['hide', 'x-miner', 'extra'], ['purge']]) {
      const failure = await admin(...args).then(() => null, (error) => error);
      assert.ok(failure, `expected failure for ${JSON.stringify(args)}`);
      assert.equal(failure.code, 1, JSON.stringify(args));
      assert.match(failure.stderr, /usage: node src\/admin\.js hide <name> \| unhide <name> \| list-hidden/);
      assert.equal(failure.stdout, '');
    }
  });
});
