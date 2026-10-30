// Checks a Bitcoin block as a block explorer reports it, without trusting the explorer:
// the 80-byte header is rebuilt from its fields and hashed (double SHA-256), the hash
// must be the block's id, lie below the target its own `bits` declare, and that target
// must demand real work. Faking one such block costs more than 2^MIN_WORK_BITS hashes.

import { createHash } from 'node:crypto';

// Leading zero bits a block's target must at least have. Mainnet targets in October 2026
// have 78; difficulty falls by at most 4x per adjustment (2016 blocks), so 72 survives
// three of the steepest possible falls and still costs a forger about 2^72 hashes per block.
export const MIN_WORK_BITS = 72;

const HEX64 = /^[0-9a-f]{64}$/;
const isUint32 = value => Number.isSafeInteger(value) && value >= 0 && value <= 0xffffffff;

/** The target a compact `bits` value encodes, or null for a negative or overflowing one. */
export function targetOf(bits) {
  if (!isUint32(bits)) return null;
  const exponent = bits >>> 24;
  const mantissa = bits & 0x7fffff;
  if (bits & 0x800000) return null;
  const target = exponent <= 3
    ? BigInt(mantissa >>> (8 * (3 - exponent)))
    : BigInt(mantissa) << BigInt(8 * (exponent - 3));
  return target < 1n << 256n ? target : null;
}

/** Double SHA-256 of the block header, in the byte order block explorers display. */
export function headerHash(block) {
  const header = Buffer.alloc(80);
  header.writeUInt32LE(block.version, 0);
  Buffer.from(block.previousblockhash, 'hex').reverse().copy(header, 4);
  Buffer.from(block.merkle_root, 'hex').reverse().copy(header, 36);
  header.writeUInt32LE(block.timestamp, 68);
  header.writeUInt32LE(block.bits, 72);
  header.writeUInt32LE(block.nonce, 76);
  const once = createHash('sha256').update(header).digest();
  return createHash('sha256').update(once).digest().reverse().toString('hex');
}

/**
 * Why `block` is not a proven Bitcoin block, or null when it is. `minWorkBits` lowers the
 * work floor only for synthetic test chains.
 */
export function blockProblem(block, { minWorkBits = MIN_WORK_BITS } = {}) {
  if (!block || typeof block !== 'object') return 'not a block';
  if (!Number.isSafeInteger(block.height) || block.height < 0) return 'bad height';
  for (const field of ['id', 'previousblockhash', 'merkle_root']) {
    if (typeof block[field] !== 'string' || !HEX64.test(block[field])) return `bad ${field}`;
  }
  for (const field of ['version', 'timestamp', 'bits', 'nonce']) {
    if (!isUint32(block[field])) return `bad ${field}`;
  }
  if (headerHash(block) !== block.id) return 'id is not the header hash';
  const target = targetOf(block.bits);
  if (target === null) return 'bad bits';
  if (BigInt(`0x${block.id}`) > target) return 'hash above its target';
  if (target >= 1n << BigInt(256 - minWorkBits)) return 'too little work';
  return null;
}
