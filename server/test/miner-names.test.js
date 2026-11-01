import { test } from 'node:test';
import assert from 'node:assert/strict';
import { generateMinerName, isGeneratedName, MINER_NAME_BASES } from '../../shared/miner-names.mjs';
import { checkName, loadNameLists, NAME_RE } from '../src/names.js';

const lists = loadNameLists();

test('every generated name fits the pool name rule, and the moderation lists rarely refuse one', () => {
  // Digits fold to letters, so a few numbers spell a blocked word (Not-Satoshi-7);
  // the browser then draws another name. Every base must stay usable.
  let refused = 0;
  for (const base of MINER_NAME_BASES) {
    assert.deepEqual(checkName(`${base}-4`, lists), { ok: true }, base);
    for (let number = 1; number <= 999; number += 1) {
      const name = `${base}-${number}`;
      assert.match(name, NAME_RE);
      assert.equal(isGeneratedName(name), true, name);
      if (!checkName(name, lists).ok) refused += 1;
    }
  }
  assert.ok(refused / (MINER_NAME_BASES.length * 999) < 0.01, `${refused} generated names refused`);
});

test('the generator covers its bases and numbers and stays inside them', () => {
  assert.equal(generateMinerName(() => 0), `${MINER_NAME_BASES[0]}-1`);
  assert.equal(generateMinerName(() => 0.999999), `${MINER_NAME_BASES.at(-1)}-999`);
});

test('a chosen name is not taken for a generated one', () => {
  for (const name of ['Mirko', 'Not-Satoshi', 'Not-Satoshi-0', 'Not-Satoshi-1000', 'Satoshi-4', '', null, undefined]) {
    assert.equal(isGeneratedName(name), false, String(name));
  }
});
