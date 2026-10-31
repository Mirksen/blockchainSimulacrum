// Builds the proofofwork.fyi genesis block in Bitcoin's byte format and writes it to
// shared/genesis.json and the server's copy (the server container sees only server/).
//
//   node shared/mine-genesis.mjs --anchor <bitcoin height|tip> --memo "<text>" --template
//   node shared/mine-genesis.mjs --anchor <bitcoin height> --memo "<text>" --extra-nonce <n> --nonce <n>
//
// The anchor's hash and time are read once from mempool.space and checked like the server
// checks rounds (its header hashes to its id with real proof of work). The genesis header
// takes the anchor as previous block and the anchor's time, so the block cannot predate it;
// bits are 0x1d00ffff (difficulty 1), like Satoshi's block 0. The coinbase pays 3.125 BTC to
// Hal Finney's key from block 170 and carries the memo in its scriptSig (shared/bitcoin-block.mjs).
//
// --template prints the coinbase split around its extraNonce and the header fields, the input
// of the GPU best-hash search; --extra-nonce/--nonce rebuild a found block, check it meets its
// bits target and write it.
import { createHash } from 'node:crypto';
import { writeFileSync } from 'node:fs';
import { parseArgs } from 'node:util';
import { blockProblem } from '../server/src/bitcoinHeader.js';
import { buildBlock, coinbaseParts, leadingZeroBits, targetOf } from './bitcoin-block.mjs';

const SHARED = new URL('./genesis.json', import.meta.url);
const SERVER_COPY = new URL('../server/src/genesis.json', import.meta.url);
const API = 'https://mempool.space/api';

export const HAL_FINNEY = '04ae1a62fe09c5f51b13905f07f06b99a2f7159b2225f374cd378d71302fa28414e7aab37397f554a7df5f142c21c1b7303b8a0626f1baded5c72a704f7e6cd84c';
const BITS = 0x1d00ffff;

export const sha256d = hex => createHash('sha256').update(createHash('sha256').update(Buffer.from(hex, 'hex')).digest()).digest('hex');

export async function anchorAt(height) {
  const hash = (await (await fetch(`${API}/block-height/${height}`)).text()).trim();
  if (!/^[0-9a-f]{64}$/.test(hash)) throw new Error(`no block at height ${height}`);
  const block = await (await fetch(`${API}/block/${hash}`)).json();
  if (block.height !== height || block.id !== hash) throw new Error('unreadable block');
  const problem = blockProblem(block);
  if (problem) throw new Error(`anchor ${height}: ${problem}`);
  return { chain: 'bitcoin', height, hash, time: block.timestamp };
}

/** The genesis fields for an anchor and memo, before extraNonce and nonce are known. */
export function genesisFields(anchor, memo) {
  return {
    status: 'final',
    format: 'bitcoin',
    anchor,
    header: { version: 1, time: anchor.time, bits: BITS, nonce: 0 },
    coinbase: { recipient: 'Hal Finney', amount: 3.125, value: 312500000, pubkey: HAL_FINNEY, memo, extraNonce: 0, extraNonceBytes: 8 },
  };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const { values } = parseArgs({ options: {
    anchor: { type: 'string' }, memo: { type: 'string' }, template: { type: 'boolean' },
    'extra-nonce': { type: 'string' }, nonce: { type: 'string' },
  } });
  if (!values.anchor || !values.memo) throw new Error('--anchor and --memo are required');
  const height = values.anchor === 'tip'
    ? Number((await (await fetch(`${API}/blocks/tip/height`)).text()).trim()) : Number(values.anchor);
  const genesis = genesisFields(await anchorAt(height), values.memo);
  if (values.template) {
    const { prefix, suffix } = coinbaseParts({ bits: BITS, ...genesis.coinbase });
    console.log(JSON.stringify({ anchor: genesis.anchor, ...genesis.header, extraNonceBytes: 8, prefix, suffix }, null, 2));
    process.exit(0);
  }
  for (const key of ['extra-nonce', 'nonce']) if (!/^\d+$/.test(values[key] ?? '')) throw new Error(`--${key} must be a non-negative integer`);
  genesis.coinbase.extraNonce = Number(values['extra-nonce']);
  genesis.header.nonce = Number(values.nonce);
  const block = buildBlock(genesis, sha256d);
  if (BigInt(`0x${block.hash}`) > targetOf(BITS)) throw new Error(`hash ${block.hash} misses its bits target`);
  const result = { ...genesis, txid: block.txid, coinbaseHex: block.coinbaseHex, headerHex: block.headerHex, hash: block.hash };
  const text = `${JSON.stringify(result, null, 2)}\n`;
  writeFileSync(SHARED, text);
  writeFileSync(SERVER_COPY, text);
  console.log(`genesis on Bitcoin ${height}: hash ${block.hash} (${leadingZeroBits(block.hash)} leading zero bits)`);
}
