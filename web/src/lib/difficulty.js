export const MIN_DIFFICULTY = 1;
export const MAX_DIFFICULTY = 10;

// The difficulty adjustment (web/DESIGN.md, "Key figures"): after every tenth mined
// block the pace of the last ten is checked against the target block time. Faster
// than 70 % of the target adds a leading zero, slower than 150 % removes one; inside
// that band the difficulty stays. App applies it, the key figures forecast it.
export const CHECK_EVERY = 10;
export const FASTER_THAN = 0.7;
export const SLOWER_THAN = 1.5;

/** The band of average block times that keeps the difficulty, in seconds. */
export function paceBand(targetSeconds) {
  return { low: targetSeconds * FASTER_THAN, high: targetSeconds * SLOWER_THAN };
}

/** True when mining block `height` ends with a difficulty check. */
export function isCheckHeight(height) {
  return height >= CHECK_EVERY && height % CHECK_EVERY === 0;
}

/** The next check at or after block `height + 1`. */
export function nextCheckAfter(height) {
  return Math.max(CHECK_EVERY, (Math.floor(Math.max(0, height) / CHECK_EVERY) + 1) * CHECK_EVERY);
}

// The blocks the check at `checkHeight` measures: from the block ten before it, but
// from block #1 at the earliest, since the genesis time is a fixed launch moment.
export function checkWindowStart(checkHeight) {
  return Math.max(1, checkHeight - CHECK_EVERY);
}

/**
 * Average seconds per block from block `from` to block `to` (header times), or null
 * when the range holds no interval.
 */
export function averagePace(blocks, from, to) {
  if (to <= from || !blocks[from] || !blocks[to]) return null;
  const seconds = (blocks[to].time - blocks[from].time) / (to - from);
  return Number.isFinite(seconds) ? seconds : null;
}

/** The difficulty after a check that measured `seconds` per block. */
export function adjustedDifficulty(current, seconds, targetSeconds) {
  if (seconds === null || !Number.isFinite(seconds)) return current;
  const { low, high } = paceBand(targetSeconds);
  if (seconds < low && current < MAX_DIFFICULTY) return current + 1;
  if (seconds > high && current > MIN_DIFFICULTY) return current - 1;
  return current;
}
