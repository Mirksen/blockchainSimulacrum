// The pool's proof of work, recomputable by anyone (same rule as server/src/app.js):
// SHA256("proofofwork.fyi|<genesis hash>|<bitcoin height>:<bitcoin hash>|<name>|<nonce>").
// The genesis hash ties the work to this chain, the newest Bitcoin block to its round,
// the name to the person who did it.
import SHA256 from 'crypto-js/sha256';
import genesis from '../../../shared/genesis.json';

export const GENESIS = genesis;

export function proofPrefix(genesisHash, round, name) {
  return `proofofwork.fyi|${genesisHash}|${round.height}:${round.hash}|${name}|`;
}

export const proofHash = (prefix, nonce) => SHA256(prefix + String(nonce)).toString();

export function leadingZeros(hex) {
  const match = /^0*/.exec(hex);
  return match ? match[0].length : 0;
}

// Bitcoin-style difficulty relative to one leading hex zero: 2^252 / (hash + 1).
export function hashDifficulty(hex) {
  return Number((2n ** 252n * 100n) / (BigInt(`0x${hex}`) + 1n)) / 100;
}

// Recomputes a leaderboard row from its public fields; true when the stored hash matches.
export function verifyRow(row, genesisHash = GENESIS.hash) {
  const preimage = proofPrefix(genesisHash, row.round, row.name) + String(row.nonce);
  const hash = SHA256(preimage).toString();
  return { preimage, hash, matches: hash === row.bestHash };
}

// 1234 → "1,234"; 2.5e9 → "2.5 B": difficulty grows by 16 per zero, so large values abbreviate.
export function formatDifficulty(value) {
  if (!Number.isFinite(value)) return '—';
  const units = [[1e12, 'T'], [1e9, 'B'], [1e6, 'M']];
  for (const [size, unit] of units) if (value >= size) return `${(value / size).toFixed(value / size >= 100 ? 0 : 1)} ${unit}`;
  return value.toLocaleString('en-US', { maximumFractionDigits: value < 10 ? 2 : 0 });
}
