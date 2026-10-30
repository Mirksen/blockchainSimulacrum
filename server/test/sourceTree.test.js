import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { chmod, mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { gitTreeId } from '../src/sourceTree.js';

describe('gitTreeId', () => {
  let dir;
  before(async () => {
    dir = await mkdtemp(path.join(tmpdir(), 'source-tree-'));
    await mkdir(path.join(dir, 'b'));
    await writeFile(path.join(dir, 'a.js'), 'export const a = 1;\n');
    await writeFile(path.join(dir, 'b.js'), 'b\n');
    await writeFile(path.join(dir, 'b', 'c.txt'), 'c\n');
    await writeFile(path.join(dir, 'run.sh'), '#!/bin/sh\n');
    await chmod(path.join(dir, 'run.sh'), 0o755);
  });
  after(() => rm(dir, { recursive: true, force: true }));

  // `git add` of these four files, then `git write-tree`, prints this id. The fixture has a
  // subdirectory, an executable and the ordering trap 'b.js' before 'b/'.
  test('equals git write-tree for the same files', () => {
    assert.equal(gitTreeId(dir), '05f9442bdff66e57abbcd97785f35b5d8ec75338');
  });

  test('changes with one byte of content', async () => {
    await writeFile(path.join(dir, 'b', 'c.txt'), 'C\n');
    try {
      assert.notEqual(gitTreeId(dir), '05f9442bdff66e57abbcd97785f35b5d8ec75338');
    } finally {
      await writeFile(path.join(dir, 'b', 'c.txt'), 'c\n');
    }
  });
});
