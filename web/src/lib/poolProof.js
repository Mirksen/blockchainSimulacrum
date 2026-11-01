// A leaderboard proof is a mined block in Bitcoin's byte format, recomputable by anyone
// (same rule as server/src/blockProof.js). Its coinbase ends with an OP_RETURN output holding
// SHA256("proofofwork.fyi|<genesis hash>|<bitcoin height>:<bitcoin hash>|<name>|"): the genesis
// hash ties the work to this chain, a recent Bitcoin block to its round, the name to the
// person who did it. The header commits to the coinbase through the merkle root.
import SHA256 from 'crypto-js/sha256';
import genesis from '../../../shared/genesis.json';
import { bitsOfZeros, displayHash, headerHex, merkleBranch } from '../../../shared/bitcoin-block.mjs';
import { BLOCK_VERSION, headerPrefix, sha256d } from './blockHeader';
import { opReturnScript } from './tx/script';
import { createCoinbase } from './tx/transaction';

export const GENESIS = genesis;

export function proofPrefix(genesisHash, round, name) {
  return `proofofwork.fyi|${genesisHash}|${round.height}:${round.hash}|${name}|`;
}

export const proofCommitment = (genesisHash, round, name) => SHA256(proofPrefix(genesisHash, round, name)).toString();

// What signs a block for a round the pool offered.
export function signatureOf({ name, round, prefix }) {
  return { name, round, commitment: SHA256(prefix).toString() };
}

// What the server needs of a mined block: everything that proves the hash and the signature.
export function proofOfBlock(block) {
  return { header: headerHex(block.header()), coinbase: block.transactions[0].serialize(),
    branch: merkleBranch(block.transactions.map(tx => tx.createHash()), sha256d) };
}

// A block built on the genesis that carries only its signature, for mining on the
// leaderboard page without the simulator's chain: `header` is its first 76 bytes.
export function poolCandidate(signature, { time, extraNonce, zeros }) {
  const coinbase = createCoinbase({ height: 1, value: 0, recipientScript: opReturnScript(signature.commitment), extraNonce, tag: signature.name });
  const bits = bitsOfZeros(zeros);
  return { bits, coinbase: coinbase.serialize(), header: headerPrefix({ version: BLOCK_VERSION, previousHash: genesis.hash,
    merkleRoot: coinbase.createHash(), time, bits }) };
}

export function leadingZeros(hex) {
  const match = /^0*/.exec(hex);
  return match ? match[0].length : 0;
}

// Bitcoin-style difficulty relative to one leading hex zero: 2^252 / (hash + 1).
export function hashDifficulty(hex) {
  return Number((2n ** 252n * 100n) / (BigInt(`0x${hex}`) + 1n)) / 100;
}

const MERKLE_ROOT_AT = 72; // Hex offset: 4 version bytes, 32 previous-hash bytes.

// Recomputes a leaderboard row from its public fields: true when its header hashes to the
// listed hash and commits to a coinbase that names this miner and round.
export function verifyRow(row, genesisHash = GENESIS.hash) {
  const hash = displayHash(row.header, sha256d);
  const commitment = proofCommitment(genesisHash, row.round, row.name);
  const root = row.branch.reduce((node, sibling) => sha256d(node + sibling), sha256d(row.coinbase));
  const signed = row.coinbase.endsWith(`${'00'.repeat(8)}22${opReturnScript(commitment)}${'00'.repeat(4)}`) &&
    row.header.slice(MERKLE_ROOT_AT, MERKLE_ROOT_AT + 64) === root;
  return { header: row.header, hash, commitment, signed, matches: signed && hash === row.bestHash };
}

// Special finds beside the ranking, each from what the board already says.
export function findsOf({ recent, allTime }) {
  const finds = [];
  const today = recent?.rows[0];
  if (today) finds.push({ label: 'Best today', name: today.name, value: `${today.bestZeros} zeros` });
  const busiest = allTime.reduce((most, row) => (row.proofs > (most?.proofs ?? 1) ? row : most), null);
  if (busiest) finds.push({ label: 'Most blocks', name: busiest.name, value: busiest.proofs.toLocaleString('en-US') });
  const latest = allTime.reduce((newest, row) => (row.foundAt > (newest?.foundAt ?? 0) ? row : newest), null);
  if (latest) finds.push({ label: 'Latest find', name: latest.name, value: `${latest.bestZeros} zeros` });
  return finds;
}

// 1234 → "1,234"; 2.5e9 → "2.5 B": difficulty grows by 16 per zero, so large values abbreviate.
export function formatDifficulty(value) {
  if (!Number.isFinite(value)) return '—';
  const units = [[1e12, 'T'], [1e9, 'B'], [1e6, 'M']];
  for (const [size, unit] of units) if (value >= size) return `${(value / size).toFixed(value / size >= 100 ? 0 : 1)} ${unit}`;
  return value.toLocaleString('en-US', { maximumFractionDigits: value < 10 ? 2 : 0 });
}
