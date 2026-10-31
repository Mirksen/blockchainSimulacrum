// One mission track: the three guided lab experiments plus the workbench missions
// (web/DESIGN.md, "Existing features in the workbench" and "Mission rail").
// Pure module: no React, no DOM. Storage is only touched through the object passed
// to load() and save().
//
// Events (all plain objects with a `type`):
//   Labs:      hash_changed, work_found {difficulty, attempts},
//              chain_checked {consistent, changedFirstBlock}, lesson_reset
//   Workbench: transaction_created, miner_backed {name}, block_mined {backedWon, epoch},
//              block_tampered {blockIndex}, block_remined {blockIndex, chainValid}, edit_undone,
//              difficulty_changed {direction: 'up'|'down'} (automatic adjustment only;
//              events with manual: true are ignored), reset (simulator reset)
// Only the active mission's current step can advance. Everything else is free play
// and leaves progress untouched.

export const STORAGE_KEY = 'proofofwork-missions';
export const PROGRESS_VERSION = 1;

const freeze = value => {
  if (value && typeof value === 'object') {
    Object.values(value).forEach(freeze);
    Object.freeze(value);
  }
  return value;
};

export const MISSIONS = freeze([
  {
    id: 'change-fingerprint', title: 'Change a fingerprint', view: 'hash-lab',
    steps: [
      { id: 'change-message', text: 'Change the message. Watch which characters in its hash change.', target: 'hash-lab.message' }
    ],
    hint: 'Change one letter. See how much of the fingerprint changes.',
    result: 'A small input change produces a different fingerprint. Put the original message back and its hash returns: hashing is repeatable.',
    reward: { xp: 20 }
  },
  {
    id: 'earn-proof-of-work', title: 'Earn a proof of work', view: 'hash-lab',
    steps: [
      { id: 'one-zero', text: 'Find a nonce for one leading zero.', target: 'hash-lab.search' },
      { id: 'two-zeros', text: 'Choose two zeros and search again.', target: 'hash-lab.search' }
    ],
    hint: 'Both searches use the same message and start at nonce 0.',
    result: 'Both searches used the same message and started at nonce 0. Each extra hex zero makes a match about 16 times less likely per attempt. A single run does not guarantee a particular time or attempt ratio.',
    reward: { xp: 40, badge: 'First proof' }
  },
  {
    id: 'send-first-coin', title: 'Send your first coin', view: 'workbench',
    steps: [
      { id: 'new-transaction', text: 'Create a transaction from one wallet to another.', target: 'workbench.new-transaction' }
    ],
    hint: 'The form shows which coins it spends. What the payment does not use comes back as change, and a small fee goes to the miner.',
    result: 'Your transaction spends whole coins, pays the recipient, returns the change to the sender and leaves a fee for the miner. It waits in the mempool until a mined block includes it. powfyicoin is virtual: no real money moves.',
    reward: { xp: 40 }
  },
  {
    id: 'win-mining-race', title: 'Win a mining race', view: 'workbench',
    steps: [
      { id: 'back-miner', text: 'Back a miner.', target: 'workbench.back-miner' },
      { id: 'watch-race', text: 'Watch one full race.', target: 'workbench.mine' },
      { id: 'win-block', text: 'Win a block with your backed miner.', target: 'workbench.mine' }
    ],
    hint: 'Hash power only shifts the odds. Every try is a fresh chance.',
    result: 'Your miner found a valid hash first. More hash power means more tries per second, not a sure win. Both miners run in your browser; there is no network.',
    reward: { xp: 60, badge: 'Backer' }
  },
  {
    id: 'change-the-past', title: 'Change the past', view: 'chain-lab',
    steps: [
      { id: 'edit-block', text: 'Edit Block 1’s data.', target: 'chain-lab.block-1' },
      { id: 'repair-chain', text: 'Keep that edit, then re-mine Blocks 1, 2 and 3 in order.', target: 'chain-lab.remine' }
    ],
    hint: 'Each re-mine changes a hash, so the next block’s link breaks until you re-mine that block too.',
    result: 'Changing an earlier block invalidates the chain. Repairing its hash changes what the next block must link to, so the repair travels forward. This toy chain shows links and work, not signatures or network consensus.',
    reward: { xp: 60, badge: 'Chain mender' }
  },
  {
    id: 'forge-a-block', title: 'Forge a block without getting caught', view: 'workbench',
    steps: [
      { id: 'tamper', text: 'Lower a coinbase amount in a mined block whose coin nobody spent.', target: 'workbench.selected-block.tamper' },
      { id: 'remine-changed', text: 'Re-mine the changed block.', target: 'workbench.remine' },
      { id: 'remine-later', text: 'Re-mine every later block in order until the chain is valid.', target: 'workbench.remine' }
    ],
    hint: 'A signed transfer cannot be forged, a spent coin takes its spender down with it, and a coinbase may never claim more than reward plus fees. Undo starts over.',
    result: 'The chain is valid again, but only because you redid the work for the changed block and every block after it, and only because a coinbase has no signature and nobody had spent it. On a real network, other miners would have kept adding blocks meanwhile. This simulation has no network.',
    reward: { xp: 80, badge: 'Forger' }
  },
  {
    id: 'survive-halving', title: 'Survive a halving', view: 'workbench',
    steps: [
      { id: 'mine-block', text: 'Mine a block and note its reward.', target: 'workbench.mine' },
      { id: 'reach-halving', text: 'Keep mining until the block reward halves.', target: 'workbench.mine' }
    ],
    hint: 'The reward halves after a fixed number of blocks. A shorter halving interval in Settings gets you there sooner.',
    result: 'The block reward halved. A block still needs the same work, but it now creates fewer new powfyicoin.',
    reward: { xp: 60, badge: 'Halving survivor' }
  },
  {
    id: 'beat-difficulty-adjustment', title: 'Beat the difficulty adjustment', view: 'workbench',
    steps: [
      { id: 'change-pace', text: 'Mine 10 blocks faster or slower than the target block time.', target: 'workbench.mine' }
    ],
    hint: 'Lower difficulty mines faster, higher difficulty slower. The target block time is in Settings.',
    result: 'The difficulty adjusted to pull block times back toward the target. Real networks adjust the same way, over many more blocks.',
    reward: { xp: 100, badge: 'Pace setter' }
  },
  {
    id: 'follow-stronger-chain', title: 'Follow the stronger chain', view: 'chain-lab',
    steps: [
      { id: 'start-rewrite', text: 'Choose Rewrite history and mine a block.', target: 'chain-lab.fork-scenario' },
      { id: 'overtake-history', text: 'Let the rewritten branch overtake the original.', target: 'chain-lab.fork-mine' }
    ],
    hint: 'Change the alternative branch’s hash power. Equal work keeps the current branch; only strictly more work switches it.',
    result: 'The rewritten branch became the selected history because its valid blocks accumulated more work. This local text model does not forge signatures or move money, and more hash power never guarantees a win within twelve blocks.',
    reward: { xp: 80, badge: 'Fork watcher' }
  }
]);

const BY_ID = new Map(MISSIONS.map((mission, index) => [mission.id, index]));
const isObject = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const isIndex = value => Number.isSafeInteger(value) && value >= 0;
const isCount = value => Number.isSafeInteger(value) && value > 0;

// Per mission: advance(stepIndex, data, event) returns the next {step, data} or null to
// ignore the event. step === steps.length completes the mission.
const RULES = {
  'change-fingerprint': {
    advance: (step, data, event) => event.type === 'hash_changed' ? { step: 1, data } : null
  },
  'earn-proof-of-work': {
    advance(step, data, event) {
      const difficulty = step + 1;
      if (event.type !== 'work_found' || event.difficulty !== difficulty || !isCount(event.attempts)) return null;
      return { step: step + 1, data: { attempts: { ...data.attempts, [difficulty]: event.attempts } } };
    }
  },
  'send-first-coin': {
    advance: (step, data, event) => event.type === 'transaction_created' ? { step: 1, data } : null
  },
  'win-mining-race': {
    advance(step, data, event) {
      if (event.type === 'miner_backed' && typeof event.name === 'string' && event.name.trim()) {
        // Re-backing is free play: remember the latest choice, advance only from step 0.
        if (step > 0 && data.backed === event.name) return null;
        return { step: step === 0 ? 1 : step, data: { ...data, backed: event.name } };
      }
      if (event.type !== 'block_mined' || typeof event.backedWon !== 'boolean') return null;
      if (step === 1) return { step: 2, data };
      if (step === 2 && event.backedWon) return { step: 3, data };
      return null;
    }
  },
  'change-the-past': {
    advance(step, data, event) {
      if (event.type !== 'chain_checked' || event.changedFirstBlock !== true) return null;
      if (step === 0 && event.consistent === false) return { step: 1, data };
      if (step === 1 && event.consistent === true) return { step: 2, data };
      return null;
    }
  },
  'forge-a-block': {
    advance(step, data, event) {
      // Undoing every edit leaves nothing to forge: start the mission over.
      if (event.type === 'edit_undone') return step > 0 ? { step: 0, data: {} } : null;
      if (event.type === 'block_tampered' && isIndex(event.blockIndex)) {
        if (step === 0) return { step: 1, data: { tampered: event.blockIndex } };
        // A new edit before the first broken block moves the repair back to that block.
        const firstBroken = step === 1 ? data.tampered : data.next;
        return event.blockIndex < firstBroken ? { step: 1, data: { tampered: event.blockIndex } } : null;
      }
      if (event.type !== 'block_remined' || !isIndex(event.blockIndex) || typeof event.chainValid !== 'boolean') return null;
      const expected = step === 1 ? data.tampered : step === 2 ? data.next : -1;
      if (event.blockIndex !== expected) return null;
      // The changed block was the newest one: re-mining it already repairs the chain.
      if (event.chainValid) return { step: 3, data };
      return { step: 2, data: { tampered: data.tampered, next: event.blockIndex + 1 } };
    }
  },
  'survive-halving': {
    advance(step, data, event) {
      if (event.type !== 'block_mined' || !isIndex(event.epoch)) return null;
      if (step === 0) return { step: 1, data: { epoch: event.epoch } };
      return event.epoch > data.epoch ? { step: 2, data } : null;
    }
  },
  'follow-stronger-chain': {
    advance(step, data, event) {
      if (event.type !== 'fork_round' || event.scenario !== 'rewrite' || !isCount(event.rounds) || event.rounds > 12 ||
        !isCount(event.originalWork) || event.originalWork < 48 || event.originalWork % 16 !== 0 ||
        !isCount(event.alternativeWork) || event.alternativeWork < 16 || event.alternativeWork % 16 !== 0 ||
        event.originalWork + event.alternativeWork !== (4 + event.rounds) * 16 ||
        !['original', 'alternative'].includes(event.selected) || typeof event.reorganized !== 'boolean') return null;
      if (step === 0) return { step: 1, data: { rounds: event.rounds } };
      return event.rounds > data.rounds && event.reorganized && event.selected === 'alternative' &&
        event.alternativeWork > event.originalWork ? { step: 2, data } : null;
    }
  },
  'beat-difficulty-adjustment': {
    advance: (step, data, event) => event.type === 'difficulty_changed' && event.manual !== true
      && (event.direction === 'up' || event.direction === 'down') ? { step: 1, data: { direction: event.direction } } : null
  }
};

/** Fresh progress: mission 1 active at its first step, nothing completed. */
export function initialProgress() {
  return { version: PROGRESS_VERSION, completed: [], step: 0, data: {} };
}

/** The mission that events can advance, or null when the whole track is done. */
export function activeMission(progress) {
  return MISSIONS[progress.completed.length] ?? null;
}

/** 'done' | 'active' | 'locked' for a mission id. Missions unlock in order. */
export function missionStatus(progress, id) {
  const index = BY_ID.get(id);
  if (index === undefined) return 'locked';
  if (index < progress.completed.length) return 'done';
  return index === progress.completed.length ? 'active' : 'locked';
}

/** Coach ring position: the active mission's current step, or null when all are done. */
export function activeStep(progress) {
  const mission = activeMission(progress);
  if (!mission) return null;
  const step = mission.steps[progress.step];
  return { mission, step, view: mission.view, target: step.target };
}

export function totalXp(progress) {
  return progress.completed.reduce((sum, id) => sum + MISSIONS[BY_ID.get(id)].reward.xp, 0);
}

export function earnedBadges(progress) {
  return progress.completed.map(id => MISSIONS[BY_ID.get(id)].reward.badge).filter(Boolean);
}

/**
 * Applies one event. Returns the same object when nothing changes, so callers can
 * skip re-renders and saves. Never throws on unknown or malformed events.
 */
export function reduce(progress, event) {
  const mission = activeMission(progress);
  if (!mission || !isObject(event) || typeof event.type !== 'string') return progress;
  const lab = mission.view !== 'workbench';
  const restart = { ...progress, step: 0, data: {} };
  if (event.type === 'fork_reset' && mission.id === 'follow-stronger-chain') return progress.step > 0 ? restart : progress;
  // A lab reset only restarts a lab mission; a simulator reset only a workbench mission.
  if (event.type === 'lesson_reset') return lab && (progress.step !== 0 || Object.keys(progress.data).length) ? restart : progress;
  if (event.type === 'reset') return !lab && (progress.step !== 0 || Object.keys(progress.data).length) ? restart : progress;
  const next = RULES[mission.id].advance(progress.step, progress.data, event);
  if (!next) return progress;
  if (next.step >= mission.steps.length) {
    return { ...progress, completed: [...progress.completed, mission.id], step: 0, data: {} };
  }
  if (next.step === progress.step && next.data === progress.data) return progress;
  return { ...progress, step: next.step, data: next.data };
}

function normalize(stored) {
  const fresh = initialProgress();
  if (!isObject(stored) || stored.version !== PROGRESS_VERSION || !Array.isArray(stored.completed)) return fresh;
  // Only an in-order prefix of the track counts as completed.
  let count = 0;
  while (count < MISSIONS.length && stored.completed[count] === MISSIONS[count].id) count += 1;
  const completed = MISSIONS.slice(0, count).map(mission => mission.id);
  // Reload creates fresh labs and a fresh simulator. Backing, edited blocks and
  // observed halving epochs no longer exist, so only completed missions survive.
  return { ...fresh, completed };
}

/** Reads progress from a Storage-like object; missing, blocked or corrupt storage starts fresh. */
export function load(storage) {
  try {
    const raw = storage?.getItem(STORAGE_KEY);
    return typeof raw === 'string' ? normalize(JSON.parse(raw)) : initialProgress();
  } catch {
    return initialProgress();
  }
}

/** Writes progress; returns false when storage is missing or refuses the write. */
export function save(storage, progress) {
  try {
    if (!storage) return false;
    const { completed, step, data } = progress;
    storage.setItem(STORAGE_KEY, JSON.stringify({ version: PROGRESS_VERSION, completed, step, data }));
    return true;
  } catch {
    return false;
  }
}
