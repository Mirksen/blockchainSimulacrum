import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { DatabaseSync } from 'node:sqlite';
import { startServer, getChallenge, postShare, stripChallenge, mine } from './helpers.js';

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

  const board = async () => (await (await fetch(`${srv.base}/api/leaderboard`)).json()).map((row) => row.name);

  test('hide removes the name from the leaderboard and refuses challenges and shares; unhide restores', async () => {
    const { body: first } = await getChallenge(srv, 'loud-miner');
    const share = mine(first.prefix, { min: first.zeros });
    assert.equal((await postShare(srv, { challenge: stripChallenge(first), nonce: share.nonce })).status, 200);
    const { body: other } = await getChallenge(srv, 'calm-miner');
    const otherShare = mine(other.prefix, { min: other.zeros });
    assert.equal((await postShare(srv, { challenge: stripChallenge(other), nonce: otherShare.nonce })).status, 200);
    const { body: old } = await getChallenge(srv, 'loud-miner');
    const oldShare = mine(old.prefix, { min: old.zeros });
    assert.deepEqual((await board()).sort(), ['calm-miner', 'loud-miner']);

    // A different spelling of the same folded name hides it too.
    const hidden = await admin('hide', 'Loud-M1ner');
    assert.equal(hidden.stdout, 'hidden: Loud-M1ner (folded: loudminer)\n');
    assert.equal((await admin('hide', 'loud-miner')).stdout, 'already hidden: loud-miner (folded: loudminer)\n');
    assert.match((await admin('list-hidden')).stdout, /^loudminer\t\d{4}-\d{2}-\d{2}T[\d:.]+Z\n$/);

    assert.deepEqual(await board(), ['calm-miner']);
    for (const name of ['loud-miner', 'LOUD-MINER', 'l0ud-miner']) {
      const refused = await getChallenge(srv, name);
      assert.equal(refused.status, 400, name);
      assert.deepEqual(refused.body, { error: 'name unavailable' });
    }
    const late = await postShare(srv, { challenge: stripChallenge(old), nonce: oldShare.nonce });
    assert.equal(late.status, 403);
    assert.deepEqual(late.body, { error: 'name unavailable' });
    assert.equal(srv.db.prepare("SELECT COUNT(*) AS n FROM shares WHERE name = 'loud-miner'").get().n, 1);

    assert.equal((await admin('unhide', 'loud-miner')).stdout, 'unhidden: loud-miner (folded: loudminer)\n');
    assert.equal((await admin('unhide', 'loud-miner')).stdout, 'not hidden: loud-miner (folded: loudminer)\n');
    assert.equal((await admin('list-hidden')).stdout, 'no hidden names\n');
    assert.deepEqual((await board()).sort(), ['calm-miner', 'loud-miner']);
    assert.equal((await getChallenge(srv, 'loud-miner')).status, 200);
    assert.equal((await postShare(srv, { challenge: stripChallenge(old), nonce: oldShare.nonce })).status, 200);
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
