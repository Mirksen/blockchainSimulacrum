import { describe, expect, it } from 'vitest';
import {
  MISSIONS, PROGRESS_VERSION, STORAGE_KEY, activeMission, activeStep, earnedBadges, initialProgress,
  load, missionStatus, reduce, save, totalXp
} from '../lib/missions';

// Event sequences that complete each mission from its first step.
const COMPLETE = {
  'change-fingerprint': [{ type: 'hash_changed' }],
  'earn-proof-of-work': [{ type: 'work_found', difficulty: 1, attempts: 7 }, { type: 'work_found', difficulty: 2, attempts: 301 }],
  'send-first-coin': [{ type: 'transaction_created' }],
  'win-mining-race': [{ type: 'miner_backed', name: 'Minas' }, { type: 'block_mined', backedWon: false, epoch: 0 },
    { type: 'block_mined', backedWon: true, epoch: 0 }],
  'change-the-past': [{ type: 'chain_checked', consistent: false, changedFirstBlock: true },
    { type: 'chain_checked', consistent: true, changedFirstBlock: true }],
  'forge-a-block': [{ type: 'block_tampered', blockIndex: 2 }, { type: 'block_remined', blockIndex: 2, chainValid: false },
    { type: 'block_remined', blockIndex: 3, chainValid: false }, { type: 'block_remined', blockIndex: 4, chainValid: true }],
  'survive-halving': [{ type: 'block_mined', backedWon: false, epoch: 0 }, { type: 'block_mined', backedWon: true, epoch: 0 },
    { type: 'block_mined', backedWon: false, epoch: 1 }],
  'beat-difficulty-adjustment': [{ type: 'difficulty_changed', direction: 'up' }],
  'follow-stronger-chain': [
    { type: 'fork_round', scenario: 'rewrite', rounds: 1, originalWork: 48, alternativeWork: 32, selected: 'original', reorganized: false },
    { type: 'fork_round', scenario: 'rewrite', rounds: 3, originalWork: 48, alternativeWork: 64, selected: 'alternative', reorganized: true }
  ]
};
const ALL_EVENTS = Object.values(COMPLETE).flat();
const NOISE = [null, undefined, 42, 'hash_changed', {}, { type: 7 }, { type: 'unknown' }, { type: 'reset' }, { type: 'lesson_reset' }];

const apply = (progress, events) => events.reduce(reduce, progress);
const reach = id => apply(initialProgress(), MISSIONS.slice(0, MISSIONS.findIndex(mission => mission.id === id))
  .flatMap(mission => COMPLETE[mission.id]));
const memoryStorage = (initial = {}) => {
  const items = { ...initial };
  return { items, getItem: key => key in items ? items[key] : null, setItem: (key, value) => { items[key] = String(value); } };
};

describe('mission track', () => {
  it('lists the nine missions in the design order with steps, targets and rewards', () => {
    expect(MISSIONS.map(mission => mission.title)).toEqual([
      'Change a fingerprint', 'Earn a proof of work', 'Send your first coin', 'Win a mining race', 'Change the past',
      'Forge a block without getting caught', 'Survive a halving', 'Beat the difficulty adjustment', 'Follow the stronger chain'
    ]);
    expect(MISSIONS.map(mission => mission.view)).toEqual(['hash-lab', 'hash-lab', 'workbench', 'workbench', 'chain-lab',
      'workbench', 'workbench', 'workbench', 'chain-lab']);
    for (const mission of MISSIONS) {
      expect(mission.steps.length).toBeGreaterThan(0);
      expect(mission.hint).toMatch(/\S/);
      expect(mission.reward.xp).toBeGreaterThan(0);
      for (const step of mission.steps) {
        expect(step.text).toMatch(/\S/);
        expect(step.target.startsWith(`${mission.view}.`)).toBe(true);
      }
    }
    expect(Object.isFrozen(MISSIONS[0].steps[0])).toBe(true);
  });

  it('stays honest about the simulation', () => {
    const copy = MISSIONS.flatMap(mission => [mission.title, mission.hint, mission.result, ...mission.steps.map(step => step.text)]).join(' ');
    expect(copy).not.toMatch(/real money(?! moves)|bitcoin|\$|earn money/i);
    expect(MISSIONS.find(mission => mission.id === 'change-the-past').result)
      .toContain('This toy chain shows links and work, not signatures or network consensus.');
    expect(MISSIONS.find(mission => mission.id === 'forge-a-block').result).toMatch(/redid the work.*real network.*no network/);
    expect(MISSIONS.find(mission => mission.id === 'send-first-coin').result).toContain('powfyicoin is virtual');
  });

  it('starts at mission 1 and unlocks missions only in order', () => {
    const progress = initialProgress();
    expect(activeMission(progress).id).toBe('change-fingerprint');
    expect(MISSIONS.map(mission => missionStatus(progress, mission.id))).toEqual(['active', ...Array(8).fill('locked')]);
    // Events for later missions do nothing while mission 1 is active.
    expect(apply(progress, ALL_EVENTS.filter(event => event.type !== 'hash_changed'))).toBe(progress);
    const second = reduce(progress, { type: 'hash_changed' });
    expect(MISSIONS.slice(0, 3).map(mission => missionStatus(second, mission.id))).toEqual(['done', 'active', 'locked']);
    expect(missionStatus(second, 'no-such-mission')).toBe('locked');
  });

  it('completes every mission through its event sequence and derives XP and badges', () => {
    let progress = initialProgress();
    for (const mission of MISSIONS) {
      expect(activeMission(progress).id).toBe(mission.id);
      progress = apply(progress, COMPLETE[mission.id]);
      expect(missionStatus(progress, mission.id)).toBe('done');
    }
    expect(activeMission(progress)).toBeNull();
    expect(activeStep(progress)).toBeNull();
    expect(totalXp(progress)).toBe(MISSIONS.reduce((sum, mission) => sum + mission.reward.xp, 0));
    expect(earnedBadges(progress)).toEqual(MISSIONS.map(mission => mission.reward.badge).filter(Boolean));
    // A finished track ignores everything, including resets.
    expect(apply(progress, [...ALL_EVENTS, ...NOISE])).toBe(progress);
  });

  it('points the coach ring at the current step', () => {
    let progress = reach('win-mining-race');
    expect(activeStep(progress)).toEqual({ mission: MISSIONS[3], step: MISSIONS[3].steps[0], view: 'workbench', target: 'workbench.back-miner' });
    progress = reduce(progress, { type: 'miner_backed', name: 'Minas' });
    expect(activeStep(progress).step.id).toBe('watch-race');
    expect(activeStep(progress).target).toBe('workbench.mine');
    expect(activeStep(initialProgress())).toMatchObject({ view: 'hash-lab', target: 'hash-lab.message' });
  });

  it('ignores irrelevant and malformed events without changing progress', () => {
    for (const mission of MISSIONS) {
      const progress = reach(mission.id);
      const others = ALL_EVENTS.filter(event => !COMPLETE[mission.id].some(own => own.type === event.type));
      expect(apply(progress, [...others, ...NOISE])).toEqual(progress);
    }
    const proof = reach('earn-proof-of-work');
    expect(apply(proof, [
      { type: 'work_found', difficulty: 2, attempts: 5 }, // wrong step order
      { type: 'work_found', difficulty: 1, attempts: 0 },
      { type: 'work_found', difficulty: 1, attempts: 1.5 },
      { type: 'work_found', difficulty: 3, attempts: 9 }
    ])).toBe(proof);
    const race = reach('win-mining-race');
    expect(apply(race, [{ type: 'miner_backed', name: ' ' }, { type: 'block_mined', backedWon: true, epoch: 0 }])).toBe(race);
    const past = reach('change-the-past');
    expect(apply(past, [{ type: 'chain_checked', consistent: true, changedFirstBlock: false },
      { type: 'chain_checked', consistent: false, changedFirstBlock: false }])).toBe(past);
    const pace = reach('beat-difficulty-adjustment');
    expect(apply(pace, [{ type: 'difficulty_changed', direction: 'sideways' },
      { type: 'difficulty_changed', direction: 'up', manual: true }])).toBe(pace);
  });

  it('records lab results and advances only the current step', () => {
    const proof = apply(reach('earn-proof-of-work'), [{ type: 'work_found', difficulty: 1, attempts: 7 }]);
    expect(proof.step).toBe(1);
    expect(proof.data).toEqual({ attempts: { 1: 7 } });
    const race = apply(reach('win-mining-race'), [{ type: 'miner_backed', name: 'Lars' }, { type: 'block_mined', backedWon: true, epoch: 0 }]);
    // The first race is only watched, even when the backed miner wins it.
    expect(activeStep(race).step.id).toBe('win-block');
    expect(reduce(race, { type: 'miner_backed', name: 'Lars' })).toBe(race);
    expect(reduce(race, { type: 'miner_backed', name: 'Minas' })).toMatchObject({ step: 2, data: { backed: 'Minas' } });
    expect(missionStatus(reduce(race, { type: 'block_mined', backedWon: false, epoch: 0 }), 'win-mining-race')).toBe('active');
  });

  it('restarts a lab mission on lesson_reset but not on a simulator reset', () => {
    for (const [id, events] of [['earn-proof-of-work', COMPLETE['earn-proof-of-work'].slice(0, 1)],
      ['change-the-past', COMPLETE['change-the-past'].slice(0, 1)]]) {
      const started = reach(id);
      const midway = apply(started, events);
      expect(midway.step).toBe(1);
      expect(reduce(midway, { type: 'reset' })).toBe(midway);
      expect(reduce(midway, { type: 'lesson_reset' })).toEqual(started);
    }
    // After a lesson reset the experiment has to be done again, e.g. the chain edited again.
    const past = apply(reach('change-the-past'), [COMPLETE['change-the-past'][0], { type: 'lesson_reset' },
      { type: 'chain_checked', consistent: true, changedFirstBlock: true }]);
    expect(missionStatus(past, 'change-the-past')).toBe('active');
  });

  it('restarts a workbench mission on a simulator reset and keeps completed rewards', () => {
    const halving = apply(reach('survive-halving'), COMPLETE['survive-halving'].slice(0, 1));
    expect(halving.step).toBe(1);
    expect(reduce(halving, { type: 'lesson_reset' })).toBe(halving);
    const reset = reduce(halving, { type: 'reset' });
    expect(reset).toEqual(reach('survive-halving'));
    expect(totalXp(reset)).toBe(totalXp(halving));
    expect(earnedBadges(reset)).toEqual(['First proof', 'Backer', 'Chain mender', 'Forger']);
  });

  it('requires a halving after the first observed block', () => {
    const halving = apply(reach('survive-halving'), [{ type: 'block_mined', backedWon: false, epoch: 1 },
      { type: 'block_mined', backedWon: false, epoch: 1 }, { type: 'block_mined', backedWon: false, epoch: 0 }]);
    expect(halving).toMatchObject({ step: 1, data: { epoch: 1 } });
    expect(missionStatus(reduce(halving, { type: 'block_mined', backedWon: false, epoch: 2 }), 'survive-halving')).toBe('done');
  });

  it('requires the forged block and every later block to be re-mined in order', () => {
    const tampered = reduce(reach('forge-a-block'), { type: 'block_tampered', blockIndex: 2 });
    expect(activeStep(tampered).target).toBe('workbench.remine');
    // Out of order or for another block: ignored.
    expect(apply(tampered, [{ type: 'block_remined', blockIndex: 3, chainValid: true },
      { type: 'block_remined', blockIndex: 2 }, { type: 'block_tampered', blockIndex: 4 }])).toBe(tampered);
    const repairing = reduce(tampered, { type: 'block_remined', blockIndex: 2, chainValid: false });
    expect(repairing).toMatchObject({ step: 2, data: { tampered: 2, next: 3 } });
    expect(reduce(repairing, { type: 'block_remined', blockIndex: 4, chainValid: true })).toBe(repairing);
    // Breaking an already repaired block sends the repair back to it.
    expect(reduce(repairing, { type: 'block_tampered', blockIndex: 1 })).toMatchObject({ step: 1, data: { tampered: 1 } });
    expect(reduce(repairing, { type: 'block_tampered', blockIndex: 5 })).toBe(repairing);
    // Forging the newest block: one re-mine already makes the chain valid.
    const newest = apply(reach('forge-a-block'), [{ type: 'block_tampered', blockIndex: 4 }, { type: 'block_remined', blockIndex: 4, chainValid: true }]);
    expect(missionStatus(newest, 'forge-a-block')).toBe('done');
  });

  it('starts the forge over when the edit is undone', () => {
    const repairing = apply(reach('forge-a-block'), COMPLETE['forge-a-block'].slice(0, 2));
    expect(reduce(repairing, { type: 'edit_undone' })).toMatchObject({ step: 0, data: {} });
    const idle = reach('forge-a-block');
    expect(reduce(idle, { type: 'edit_undone' })).toBe(idle);
  });
});

describe('mission storage', () => {
  it('saves versioned progress and restores completed rewards with a fresh active mission', () => {
    const storage = memoryStorage();
    const progress = apply(reach('forge-a-block'), COMPLETE['forge-a-block'].slice(0, 2));
    expect(save(storage, progress)).toBe(true);
    expect(JSON.parse(storage.items[STORAGE_KEY])).toEqual({ version: PROGRESS_VERSION, completed: progress.completed, step: 2,
      data: { tampered: 2, next: 3 } });
    expect(load(storage)).toEqual(reach('forge-a-block'));
    expect(totalXp(load(storage))).toBe(totalXp(progress));
    expect(earnedBadges(load(storage))).toEqual(earnedBadges(progress));
    const done = apply(initialProgress(), ALL_EVENTS);
    save(storage, done);
    expect(load(storage)).toEqual(done);
  });

  it.each(MISSIONS.map(mission => [mission.id]))('restarts unfinished %s steps after reload without losing rewards', id => {
    const storage = memoryStorage();
    const started = reach(id);
    for (let count = 0; count < COMPLETE[id].length; count += 1) {
      const midway = apply(started, COMPLETE[id].slice(0, count));
      save(storage, midway);
      const restored = load(storage);
      expect(restored).toEqual(started);
      expect(totalXp(restored)).toBe(totalXp(midway));
      expect(earnedBadges(restored)).toEqual(earnedBadges(midway));
      // The mission is still completable through new evidence from the new run.
      expect(missionStatus(apply(restored, COMPLETE[id]), id)).toBe('done');
    }
  });

  it('starts fresh for missing, blocked or corrupt storage', () => {
    const fresh = initialProgress();
    expect(load(undefined)).toEqual(fresh);
    expect(load(memoryStorage())).toEqual(fresh);
    expect(load({ getItem() { throw new Error('SecurityError'); } })).toEqual(fresh);
    for (const raw of ['{not json', 'null', '[]', '"text"', JSON.stringify({ version: 99, completed: [], step: 0, data: {} }),
      JSON.stringify({ version: PROGRESS_VERSION, completed: 'all', step: 0, data: {} })]) {
      expect(load(memoryStorage({ [STORAGE_KEY]: raw }))).toEqual(fresh);
    }
    expect(save(undefined, fresh)).toBe(false);
    expect(save({ setItem() { throw new Error('QuotaExceededError'); } }, fresh)).toBe(false);
  });

  it('keeps only a valid in-order prefix and discards saved active steps', () => {
    const stored = value => load(memoryStorage({ [STORAGE_KEY]: JSON.stringify({ version: PROGRESS_VERSION, ...value }) }));
    // Skipped missions do not count.
    expect(stored({ completed: ['change-fingerprint', 'send-first-coin'], step: 0, data: {} }).completed).toEqual(['change-fingerprint']);
    const twoDone = ['change-fingerprint', 'earn-proof-of-work'];
    expect(stored({ completed: twoDone, step: 5, data: {} })).toEqual(reach('send-first-coin'));
    expect(stored({ completed: [...twoDone, 'send-first-coin'], step: 1, data: {} })).toEqual(reach('win-mining-race'));
    expect(stored({ completed: [...twoDone, 'send-first-coin'], step: 1, data: { backed: 'fixture-miner' } })).toEqual(reach('win-mining-race'));
    const fiveDone = MISSIONS.slice(0, 5).map(mission => mission.id);
    expect(stored({ completed: fiveDone, step: 2, data: { tampered: 2, next: 1 } })).toEqual(reach('forge-a-block'));
    expect(stored({ completed: fiveDone, step: 1, data: 'x' })).toEqual(reach('forge-a-block'));
  });
});

describe('fork mission evidence and compatibility', () => {
  it('preserves eight completed missions and unlocks the new one without a storage migration', () => {
    const old = { version: 1, completed: MISSIONS.slice(0, 8).map(mission => mission.id), step: 0, data: {} };
    const restored = load(memoryStorage({ [STORAGE_KEY]: JSON.stringify(old) }));
    expect(restored.completed).toEqual(old.completed);
    expect(activeMission(restored).id).toBe('follow-stronger-chain');
  });

  it('requires an actual later greater-work rewrite switch in the same experiment', () => {
    const fresh = reach('follow-stronger-chain');
    const [start, switched] = COMPLETE['follow-stronger-chain'];
    const midway = reduce(fresh, start);
    expect(midway.step).toBe(1);
    for (const event of [
      { ...switched, scenario: 'competition' }, { ...switched, reorganized: false },
      { ...switched, selected: 'original' }, { ...switched, rounds: 1 },
      { ...switched, alternativeWork: 48, rounds: 2 }, { ...switched, originalWork: 0 }
    ]) expect(reduce(midway, event)).toBe(midway);
    expect(missionStatus(reduce(midway, switched), 'follow-stronger-chain')).toBe('done');
    // A reset discards the causal start; a switch alone can only start a new step.
    const reset = reduce(midway, { type: 'fork_reset' });
    expect(reset).toEqual(fresh);
    expect(reduce(reset, switched).completed).toEqual(fresh.completed);
    const storage = memoryStorage();
    save(storage, midway);
    expect(load(storage)).toEqual(fresh);
  });
});
