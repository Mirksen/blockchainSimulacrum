import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { createApp } from '../src/app.js';
import {
  DEFAULT_DATA_DIR,
  checkName,
  foldName,
  loadNameLists,
  loadTermFile,
  parseTermList,
} from '../src/names.js';
import { fakeTip } from './helpers.js';

// Synthetic placeholder terms only: no real blocked word appears in this file.
const LONG = 'zorblax';
const SHORT = 'qux';
const lists = { blocked: [LONG, SHORT], reserved: ['sysop'], allowed: [] };
const unavailable = { ok: false, reason: 'unavailable' };
const ok = { ok: true };

describe('foldName', () => {
  test('folds case, accents, leetspeak, hyphens and repeated letters', () => {
    assert.equal(foldName('ZorBLAX'), 'zorblax');
    assert.equal(foldName('zörblàx'), 'zorblax');
    assert.equal(foldName('z0rbl4x'), 'zorblax');
    assert.equal(foldName('01345789@$'), 'oieastbgas');
    assert.equal(foldName('zor-bl-ax'), 'zorblax');
    assert.equal(foldName('zzoorrrbbllaaxx'), 'zorblax');
    assert.equal(foldName('Ｚｏｒｂｌａｘ'), 'zorblax', 'NFKD folds full-width letters');
  });

  test('keeps digits without a letter equivalent', () => {
    assert.equal(foldName('miner-26'), 'miner26');
  });
});

describe('checkName with injected synthetic terms', () => {
  test('rejects case, accent, leetspeak, hyphen and repeated-letter variants of a blocked term', () => {
    for (const name of ['zorblax', 'ZORBLAX', 'ZorBlax', 'z0rbl4x', 'Z0RBL4X', 'zor-blax', 'z-o-r-b-l-a-x', 'zzorrblaax', 'zz0rr-bl44x']) {
      assert.deepEqual(checkName(name, lists), unavailable, name);
    }
  });

  test('a blocked term written with accents or symbols matches the plain spelling', () => {
    const accented = { blocked: ['zörblàx', 'gl@$$y'] };
    for (const name of ['zorblax', 'Zorblax', 'glasy', 'Gl4ssy']) {
      assert.deepEqual(checkName(name, accented), unavailable, name);
    }
    assert.deepEqual(checkName('zörblax', accented), { ok: false, reason: 'format' }, 'names themselves stay ASCII');
  });

  test('rejects a blocked term of four or more letters inside a longer name', () => {
    for (const name of ['mega-zorblax', 'zorblax99', 'the-z0rblax-fan', 'xZorBlaxx']) {
      assert.deepEqual(checkName(name, lists), unavailable, name);
    }
    assert.deepEqual(checkName('zorbla-fan', lists), ok, 'a partial term is not a match');
  });

  test('a term shorter than four letters only matches the whole folded name', () => {
    for (const name of ['qux', 'QUX', 'q-u-x', 'quux', 'qqux']) {
      assert.deepEqual(checkName(name, lists), unavailable, name);
    }
    for (const name of ['quxer', 'aqux', 'qux-miner', 'squxa']) {
      assert.deepEqual(checkName(name, lists), ok, name);
    }
  });

  test('rejects reserved names only on exact folded match', () => {
    for (const name of ['sysop', 'SysOp', 'sys-op', '5y5op', 'sysoop']) {
      assert.deepEqual(checkName(name, lists), unavailable, name);
    }
    assert.deepEqual(checkName('sysop-fan', lists), ok);
  });

  test('accepts an allow list entry despite a blocked term, and only that exact folded name', () => {
    const withAllowed = { ...lists, allowed: ['zorblaxian', 'Q-U-X', 'sysop'] };
    for (const name of ['zorblaxian', 'Zorblaxian', 'zorblax-ian', 'qux', 'sysop']) {
      assert.deepEqual(checkName(name, withAllowed), ok, name);
    }
    for (const name of ['zorblaxians', 'zorblax']) {
      assert.deepEqual(checkName(name, withAllowed), unavailable, name);
    }
  });

  test('reports format errors separately', () => {
    for (const name of ['ab', 'bad name', 'x'.repeat(21), 'émile', '', null, undefined, 42]) {
      assert.deepEqual(checkName(name, lists), { ok: false, reason: 'format' }, String(name));
    }
    assert.deepEqual(checkName('ordinary-miner', lists), ok);
  });
});

describe('German spellings of blocked terms', () => {
  // Synthetic placeholder with ß and umlauts; a name can only spell them with plain letters.
  const german = { blocked: ['grüßöl'], reserved: ['sysop'], allowed: [] };
  test('ß is ss and an umlaut matches both its plain and its transliterated spelling', () => {
    for (const name of ['gruessoel', 'grussol', 'Gruss-Oel', 'gru55o3l', 'xgruessoelx']) {
      assert.deepEqual(checkName(name, german), unavailable, name);
    }
    assert.deepEqual(checkName('grusotter', german), ok);
  });
});

describe('term files', () => {
  let dir;
  before(async () => {
    dir = await mkdtemp(path.join(tmpdir(), 'pow-names-'));
  });
  after(() => rm(dir, { recursive: true, force: true }));

  test('parses one term per line with comments and blank lines', () => {
    assert.deepEqual(parseTermList('# header\n\nzorblax\n  qux  # reason\r\ntwo words\n'), ['zorblax', 'qux', 'twowords']);
  });

  test('an empty term file throws instead of passing every name', async () => {
    const empty = path.join(dir, 'empty.txt');
    await writeFile(empty, '# only a comment\n\n   \n');
    assert.throws(() => loadTermFile(empty), /no terms/);
    const hyphens = path.join(dir, 'hyphens.txt');
    await writeFile(hyphens, '---\n');
    assert.throws(() => loadTermFile(hyphens), /no terms/, 'terms that fold to nothing do not count');
    assert.deepEqual(loadTermFile(empty, { allowEmpty: true }), []);
    assert.throws(() => loadTermFile(path.join(dir, 'missing.txt')), /ENOENT/);
  });

  test('startup fails when the blocked or reserved list is empty; an empty allow list is fine', async () => {
    const write = (blocked, reserved, allowed) => Promise.all([
      writeFile(path.join(dir, 'blocked-names.txt'), blocked),
      writeFile(path.join(dir, 'reserved-names.txt'), reserved),
      writeFile(path.join(dir, 'allowed-names.txt'), allowed),
    ]);
    await write('zorblax\n', 'sysop\n', '# none\n');
    assert.deepEqual(checkName('zorblax', loadNameLists(dir)), unavailable);
    await write('# none\n', 'sysop\n', '');
    assert.throws(() => loadNameLists(dir), /blocked-names\.txt contains no terms/);
    await write('zorblax\n', '', '');
    assert.throws(() => loadNameLists(dir), /reserved-names\.txt contains no terms/);
  });

  test('createApp loads the shipped term files by default', () => {
    assert.doesNotThrow(() => createApp({ db: new DatabaseSync(':memory:'), tip: fakeTip() }));
  });
});

describe('shipped term files', () => {
  const real = loadNameLists();
  const blocked = loadTermFile(path.join(DEFAULT_DATA_DIR, 'blocked-names.txt'));
  const reserved = loadTermFile(path.join(DEFAULT_DATA_DIR, 'reserved-names.txt'));
  const allowed = loadTermFile(path.join(DEFAULT_DATA_DIR, 'allowed-names.txt'), { allowEmpty: true });

  test('every reserved name and its variants are refused', () => {
    assert.ok(reserved.length >= 17);
    for (const name of reserved) {
      for (const variant of [name, name.toUpperCase(), `${name.slice(0, 2)}-${name.slice(2)}`]) {
        assert.deepEqual(checkName(variant, real), unavailable, `reserved entry ${reserved.indexOf(name) + 1}`);
      }
    }
  });

  test('blocked entries that fit the name format are refused, alone, in variants and embedded', () => {
    let checked = 0;
    blocked.forEach((term, index) => {
      const name = term.replace(/[^A-Za-z0-9-]/g, '');
      if (name !== term || !/^[A-Za-z0-9-]{3,16}$/.test(name)) return;
      if (real.allowed.has(foldName(name))) return;
      const label = `blocked-names.txt entry ${index + 1}`;
      assert.deepEqual(checkName(name, real), unavailable, label);
      assert.deepEqual(checkName(name.toUpperCase(), real), unavailable, `${label} uppercase`);
      if ([...foldName(name)].length >= 4) assert.deepEqual(checkName(`x-${name}-1`, real), unavailable, `${label} embedded`);
      checked += 1;
    });
    assert.ok(checked > 300, `checked ${checked} entries`);
  });

  test('every allow list entry is accepted and carries a reason', async () => {
    for (const name of allowed) assert.deepEqual(checkName(name, real), ok, name);
    const entries = (await readFile(path.join(DEFAULT_DATA_DIR, 'allowed-names.txt'), 'utf8'))
      .split('\n').filter((line) => line.trim() !== '' && !line.trimStart().startsWith('#'));
    assert.equal(entries.length, allowed.length);
    for (const line of entries) assert.match(line, /#\s*\S/, `allow list entry without a reason: ${line}`);
  });
});
