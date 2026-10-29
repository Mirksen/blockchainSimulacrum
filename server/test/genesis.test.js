import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { GENESIS } from '../src/app.js';

// The server container sees only server/, so it carries a copy of shared/genesis.json.
const serverCopy = readFileSync(new URL('../src/genesis.json', import.meta.url));
const shared = readFileSync(new URL('../../shared/genesis.json', import.meta.url));

test('server/src/genesis.json equals shared/genesis.json byte for byte', () => {
  assert.ok(serverCopy.length > 0);
  assert.ok(serverCopy.equals(shared), 'run node shared/mine-genesis.mjs to write both copies');
});

test('GENESIS is the parsed server copy and names a 64-character hex hash', () => {
  assert.deepEqual(GENESIS, JSON.parse(serverCopy.toString('utf8')));
  assert.match(GENESIS.hash, /^[0-9a-f]{64}$/);
});
