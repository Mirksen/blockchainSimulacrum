// View-model helpers of the workbench (pure, tested in src/__tests__/workbenchModel.test.js).

const REPAIRABLE = new Set(['hash-mismatch', 'link-broken']);

// The quiet stat line in the band header.
export function keyFiguresOf({ blocks, difficulty, blockReward, halvingInterval, targetSeconds }) {
  // Intervals between mined blocks; the fixed genesis time does not count as mining.
  const times = blocks.slice(2).map((block, i) => (block.timestamp - blocks[i + 1].timestamp) / 1000).filter(Number.isFinite);
  const height = blocks.length - 1;
  return {
    avgSeconds: times.length ? times.reduce((sum, t) => sum + t, 0) / times.length : null,
    targetSeconds, difficulty, reward: blockReward,
    nextHalving: (Math.floor(height / halvingInterval) + 1) * halvingInterval
  };
}

// Where the chain needs work: the first broken block, the re-mine order (that
// block and every later one) and whether only undoing an edit helps. Re-mining never
// changes a transaction, so a broken ledger rule ends the repair as soon as it shows:
// `next` is then the edited block, `stuck` the block that breaks the rule.
export function repairOf(blockStatus, tamperedEdits = []) {
  const first = blockStatus.find(check => check.status !== 'valid');
  if (!first) return null;
  const broken = blockStatus.find(check => check.issue);
  if (broken) {
    const next = tamperedEdits[0]?.blockIndex ?? broken.index;
    return { next, order: [next], undoOnly: true, stuck: broken.index, reason: broken.issue.reason };
  }
  if (!REPAIRABLE.has(first.status)) return { next: first.index, order: [first.index], undoOnly: true };
  const last = blockStatus.length - 1;
  return { next: first.index, order: Array.from({ length: last - first.index + 1 }, (_, i) => first.index + i), undoOnly: false };
}

// Hashes per second of one miner's last progress report.
export function rateOf(progress) {
  if (!progress?.iterations || !progress.elapsedMs) return undefined;
  return Math.round(progress.iterations / (progress.elapsedMs / 1000));
}
