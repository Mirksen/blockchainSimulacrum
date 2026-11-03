import { bitsOfZeros, targetOf } from '../../../../shared/bitcoin-block.mjs';
import { colorOf } from './minerColors';

// Figures of the miner details (MinerDetails.jsx), apart so the components file exports only components.

// A miner's share of `miners`' hashpower in whole percent: its chance to find the next block.
export const shareOf = (miner, miners) => {
  const total = miners.reduce((sum, m) => sum + (Number(m.hashpower) || 0), 0);
  return total > 0 ? Math.round((Number(miner.hashpower) || 0) / total * 100) : 0;
};
// A CSS color for a miner: an explicit `color`, else its color key, else its name.
export const minerColor = miner => miner.color ?? colorOf(miner.colorKey ?? miner.name) ?? 'var(--text-3)';
// Attempts per second: the current rate the race measures, else the average so far; 0 before any.
export const rateOf = progress => progress?.rate ?? (progress?.iterations && progress.elapsedMs ? progress.iterations / (progress.elapsedMs / 1000) : 0);
// Attempts a hash needs on average to meet the target of `zeros` leading zeros.
export const expectedAttempts = zeros => Number((2n ** 256n) / (targetOf(bitsOfZeros(zeros)) + 1n));
// A rough duration for an expected time: seconds, minutes, hours or days.
export function duration(seconds) {
  if (!Number.isFinite(seconds)) return '–';
  if (seconds < 90) return `${seconds.toFixed(seconds < 10 ? 1 : 0)} s`;
  if (seconds < 5400) return `${(seconds / 60).toFixed(1)} min`;
  if (seconds < 172800) return `${(seconds / 3600).toFixed(1)} h`;
  return `${Math.round(seconds / 86400).toLocaleString('en-US')} days`;
}

