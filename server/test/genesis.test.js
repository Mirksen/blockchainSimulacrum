import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { GENESIS } from '../src/app.js';
import { headerHash, targetOf } from '../src/bitcoinHeader.js';

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

// Checked with the server's own Bitcoin header code, independent of shared/bitcoin-block.mjs.
test('the genesis is a Bitcoin-format block on its anchor that meets its bits', () => {
  const sha256d = (bytes) => createHash('sha256').update(createHash('sha256').update(bytes).digest()).digest();
  const coinbase = Buffer.from(GENESIS.coinbaseHex, 'hex');
  const txid = Buffer.from(sha256d(coinbase)).reverse().toString('hex');
  assert.equal(txid, GENESIS.txid);
  assert.ok(coinbase.includes(Buffer.from(GENESIS.coinbase.memo, 'utf8')), 'coinbase carries the memo');
  assert.ok(coinbase.includes(Buffer.from(GENESIS.coinbase.pubkey, 'hex')), 'coinbase pays the stored key');
  const { version, time, bits, nonce } = GENESIS.header;
  const block = { version, previousblockhash: GENESIS.anchor.hash, merkle_root: txid, timestamp: time, bits, nonce };
  assert.equal(headerHash(block), GENESIS.hash);
  assert.ok(BigInt(`0x${GENESIS.hash}`) <= targetOf(bits));
  assert.equal(time, GENESIS.anchor.time);
});
