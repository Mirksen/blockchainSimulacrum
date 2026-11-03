// View-model helpers of the workbench (pure, tested in src/__tests__/workbenchModel.test.js).
import { adjustedDifficulty, averagePace, checkWindowStart, isCheckHeight, nextCheckAfter, paceBand } from '../../lib/difficulty';

const REPAIRABLE = new Set(['hash-mismatch', 'link-broken']);

// The key figures of the band header and the sticky bar (web/DESIGN.md, "Key figures"):
// the pace the next difficulty check measures, its forecast, and the reward with the
// next halving. The pace counts only the blocks the check will see, never the whole chain.
export function keyFiguresOf({ blocks, difficulty, blockReward, halvingInterval, targetSeconds }) {
  const height = blocks.length - 1;
  const checkAt = nextCheckAfter(height);
  const from = checkWindowStart(checkAt);
  const seconds = height > from ? averagePace(blocks, from, height) : null;
  const { low, high } = paceBand(targetSeconds);
  const nextHalving = (Math.floor(height / halvingInterval) + 1) * halvingInterval;
  return {
    targetSeconds, difficulty, reward: blockReward, nextHalving, halvingInterval,
    pace: { seconds, blocks: Math.max(0, height - from), from, low, high },
    check: { at: checkAt, in: checkAt - height, next: adjustedDifficulty(difficulty, seconds, targetSeconds) },
    halving: { at: nextHalving, in: nextHalving - height, reward: blockReward / 2 }
  };
}

const subsidyOf = block => (Number.isFinite(block?.subsidy) ? block.subsidy / 1e8 : null);

// Where the rules changed along the chain, keyed by the first block they apply to:
// a new difficulty (from a check or set by the learner) and a halved reward. A
// difficulty changed after the newest block shows on the candidate, `height + 1`.
export function chainEventsOf({ blocks, difficulty, targetSeconds }) {
  const events = {};
  const add = (index, event) => { (events[index] ??= []).push({ index, ...event }); };
  const height = blocks.length - 1;
  for (let index = 1; index <= height + 1; index++) {
    const before = blocks[index - 1];
    const block = blocks[index];
    const to = block ? block.difficulty : difficulty;
    if (index > 1 && Number.isFinite(before?.difficulty) && Number.isFinite(to) && to > 0 && before.difficulty > 0 && to !== before.difficulty) {
      const checked = index - 1;
      const start = checkWindowStart(checked);
      const seconds = isCheckHeight(checked) ? averagePace(blocks, start, checked) : null;
      const byCheck = seconds !== null && adjustedDifficulty(before.difficulty, seconds, targetSeconds) === to;
      add(index, byCheck
        ? { kind: 'difficulty', from: before.difficulty, to, source: 'check', checked, window: { first: start + 1, last: checked, seconds } }
        : { kind: 'difficulty', from: before.difficulty, to, source: 'set' });
    }
    if (block?.halved === true) {
      const to = subsidyOf(block);
      const from = subsidyOf(before);
      add(index, { kind: 'halving', from: from ?? (to === null ? null : to * 2), to });
    }
  }
  return events;
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
