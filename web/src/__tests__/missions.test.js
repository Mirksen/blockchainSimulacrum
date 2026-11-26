import { describe, expect, it } from 'vitest';
import {
  CHAPTERS, MISSIONS, PROGRESS_VERSION, STORAGE_KEY, activeMission, activeStep, earnedBadges, initialProgress,
  load, missionStatus, reduce, save, skip, textOf, totalXp
} from '../lib/missions';

const hex = char => char.repeat(64);

// Event sequences that complete each mission from its first step.
const COMPLETE = {
  'copy-problem': [{ type: 'copy_tried', kind: 'photo' }, { type: 'copy_tried', kind: 'double-spend' },
    { type: 'copy_tried', kind: 'rejected' }],
  'see-a-fingerprint': [{ type: 'fingerprint_made', hash: hex('1') }, { type: 'fingerprint_made', hash: hex('2') },
    { type: 'fingerprint_made', hash: hex('1') }],
  'change-one-letter': [{ type: 'fingerprints_compared', changed: 31, right: hex('a') },
    { type: 'fingerprints_compared', changed: 35, right: hex('b') }, { type: 'fingerprints_compared', changed: 28, right: hex('c') },
    { type: 'fingerprints_compared', changed: 33, right: hex('d') }],
  'why-guess': [{ type: 'draw_finished', winner: 'Writer A', rolls: 12 }, { type: 'draw_finished', winner: 'Writer B', rolls: 3 },
    { type: 'draw_finished', winner: 'Writer A', rolls: 40 }],
  'sealed-pages': [
    { type: 'seals_checked', valid: false, edited: true, page: 1, zeros: 0, pageOneBroken: true },
    { type: 'seals_repaired', zeros: 0, hashes: 3, valid: true, pageOneWasBroken: true },
    { type: 'seals_checked', valid: false, edited: true, page: 1, zeros: 3, pageOneBroken: true },
    { type: 'seals_repaired', zeros: 3, hashes: 4096, valid: true, pageOneWasBroken: true }
  ],
  'get-payment-in': [
    { type: 'fee_market_checked', chainValid: true, waiting: [{ txid: 'a'.repeat(64), reason: 'full', rate: 1 }] },
    { type: 'fee_market_checked', chainValid: true, packages: [{ parent: 'a'.repeat(64), child: 'b'.repeat(64), higherFee: true, selected: true }] },
    { type: 'fee_market_checked', chainValid: true, acceptedBlock: 'c'.repeat(64), confirmed: ['a'.repeat(64), 'b'.repeat(64)] }
  ],
  'prove-a-payment': [
    { type: 'merkle_checked', root: 'a'.repeat(64), txid: 'b'.repeat(64), valid: true, editedSibling: false },
    { type: 'merkle_checked', root: 'a'.repeat(64), txid: 'b'.repeat(64), valid: false, malformed: false, editedSibling: true, failedAt: 1 }
  ],
  'test-a-signature': [
    { type: 'block_tampered', blockIndex: 2, signed: true, newest: true },
    { type: 'block_remined', blockIndex: 2, chainValid: false, hashesAndLinksValid: true, signatureInvalid: true, editPresent: true }
  ],
  'change-fingerprint': [{ type: 'manual_hash_found', hash: '0' + 'a'.repeat(63) }],
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
const ALL_EVENTS = MISSIONS.flatMap(mission => COMPLETE[mission.id]);
const NOISE = [null, undefined, 42, 'hash_changed', {}, { type: 7 }, { type: 'unknown' }, { type: 'reset' }, { type: 'lesson_reset' }];
const BASICS = ['copy-problem', 'see-a-fingerprint', 'change-one-letter', 'change-fingerprint', 'why-guess', 'sealed-pages'];
// The track order of progress version 1, frozen here independently of the module.
const V1_ORDER = ['change-fingerprint', 'earn-proof-of-work', 'send-first-coin', 'win-mining-race', 'change-the-past',
  'forge-a-block', 'survive-halving', 'beat-difficulty-adjustment', 'follow-stronger-chain', 'get-payment-in',
  'prove-a-payment', 'test-a-signature'];

const apply = (progress, events) => events.reduce(reduce, progress);
const byId = id => MISSIONS.find(mission => mission.id === id);
const reach = id => apply(initialProgress(), MISSIONS.slice(0, MISSIONS.findIndex(mission => mission.id === id))
  .flatMap(mission => COMPLETE[mission.id]));
const variants = value => typeof value === 'string' ? [value] : [value.plain, value.technical];
const memoryStorage = (initial = {}) => {
  const items = { ...initial };
  return { items, getItem: key => key in items ? items[key] : null, setItem: (key, value) => { items[key] = String(value); } };
};
const stored = value => load(memoryStorage({ [STORAGE_KEY]: JSON.stringify(value) }));
const progressOf = (completed, skipped = []) => ({ version: PROGRESS_VERSION, completed, skipped, step: 0, data: {} });

describe('mission track', () => {
  it('lists the seventeen missions in four chapters with steps, targets and rewards', () => {
    expect(MISSIONS.map(mission => mission.id)).toEqual([...BASICS, 'earn-proof-of-work', 'change-the-past',
      'send-first-coin', 'win-mining-race', 'forge-a-block', 'survive-halving', 'beat-difficulty-adjustment',
      'follow-stronger-chain', 'get-payment-in', 'prove-a-payment', 'test-a-signature']);
    expect(MISSIONS.map(mission => textOf(mission.title))).toEqual([
      'The copy problem', 'Take a fingerprint', 'One letter, everything changes', 'Guess a fingerprint',
      'Why would anyone guess?', 'Sealed pages', 'Earn a proof of work', 'Change the past', 'Send your first coin',
      'Win a mining race', 'Forge a block without getting caught', 'Survive a halving', 'Beat the difficulty adjustment',
      'Follow the stronger chain', 'Get your payment in', 'Prove a payment', 'Try to steal a coin'
    ]);
    expect(MISSIONS.map(mission => mission.view)).toEqual([...Array(6).fill('basics'), 'hash-lab', 'chain-lab', 'workbench',
      'workbench', 'workbench', 'workbench', 'workbench', 'chain-lab', 'workbench', 'chain-lab', 'workbench']);
    expect(MISSIONS.map(mission => mission.chapter)).toEqual([...Array(6).fill('basics'), 'proof-of-work', 'proof-of-work',
      ...Array(5).fill('simulator'), ...Array(4).fill('deeper')]);
    expect(CHAPTERS).toEqual([{ id: 'basics', title: 'Basics' }, { id: 'proof-of-work', title: 'Proof of work' },
      { id: 'simulator', title: 'The simulator' }, { id: 'deeper', title: 'Going deeper' }]);
    expect(Object.isFrozen(CHAPTERS) && Object.isFrozen(CHAPTERS[0])).toBe(true);
    for (const mission of MISSIONS) {
      expect(CHAPTERS.map(chapter => chapter.id)).toContain(mission.chapter);
      expect(mission.steps.length).toBeGreaterThan(0);
      for (const text of [mission.title, mission.hint, mission.result, ...mission.steps.map(step => step.text)]) {
        for (const variant of variants(text)) expect(variant).toMatch(/\S/);
      }
      expect(mission.reward.xp).toBeGreaterThan(0);
      for (const step of mission.steps) expect(step.target.startsWith(`${mission.view}.`)).toBe(true);
    }
    expect(BASICS.map(id => byId(id).reward)).toEqual([{ xp: 10 }, { xp: 10 }, { xp: 10 }, { xp: 20 }, { xp: 20 },
      { xp: 30, badge: 'Basics' }]);
    expect(Object.isFrozen(MISSIONS[0].steps[0])).toBe(true);
    expect(Object.isFrozen(byId('change-fingerprint').steps[0].text)).toBe(true);
  });

  it('gives Basics texts in a plain and a technical tone', () => {
    const guess = byId('change-fingerprint');
    expect(guess.steps.map(step => step.id)).toEqual(['change-message']);
    expect(textOf(guess.steps[0].text, 'plain')).toBe('Roll until the fingerprint starts with 0: add a number to your text and keep changing it.');
    expect(textOf(guess.steps[0].text, 'technical')).toBe('Find a text whose SHA-256 hash starts with 0: append a number and increment it.');
    expect(textOf(guess.steps[0].text)).toBe(textOf(guess.steps[0].text, 'technical'));
    expect(textOf(guess.hint, 'plain')).toBe(textOf(guess.hint, 'technical'));
    expect(textOf(byId('copy-problem').hint, 'plain')).toBe('A file never leaves your device when you send it. You send a copy.');
    expect(textOf(byId('sealed-pages').result, 'technical')).toMatch(/^A hash chain alone is tamper-evident/);
  });

  it('resolves a text for a tone and falls back to the other variant', () => {
    expect(textOf('Same text', 'plain')).toBe('Same text');
    expect(textOf('Same text', 'technical')).toBe('Same text');
    expect(textOf('Same text')).toBe('Same text');
    const both = { plain: 'Simple words', technical: 'Precise words' };
    expect(textOf(both, 'plain')).toBe('Simple words');
    expect(textOf(both, 'technical')).toBe('Precise words');
    expect(textOf(both)).toBe('Precise words');
    expect(textOf({ plain: 'Only plain' }, 'technical')).toBe('Only plain');
    expect(textOf({ technical: 'Only technical' }, 'plain')).toBe('Only technical');
  });

  it('stays honest about the simulation', () => {
    const copy = MISSIONS.flatMap(mission => [mission.title, mission.hint, mission.result, ...mission.steps.map(step => step.text)])
      .flatMap(variants).join(' ');
    expect(copy).not.toMatch(/real money(?! moves)|bitcoin|\$|earn money/i);
    expect(textOf(byId('change-the-past').result, 'technical')).toContain('This toy chain shows links and work, not signatures or network consensus.');
    expect(textOf(byId('change-the-past').result, 'plain')).toContain('This toy chain shows links and work, not signatures or a network.');
    expect(textOf(byId('forge-a-block').result, 'technical')).toMatch(/redid the work.*real network.*no network/);
    for (const tone of ['plain', 'technical']) {
      expect(textOf(byId('send-first-coin').result, tone)).toContain('powfyicoin is virtual');
    }
  });

  // The plain words of the missions after the Basics course, in the course's pictures.
  // Fields not listed here stay one string for both tones.
  const LATER_PLAIN = {
    'earn-proof-of-work': {
      steps: {
        'one-zero': 'Let the computer roll for you: find a lucky number (nonce) for one leading zero.',
        'two-zeros': 'Ask for two zeros and roll again.'
      },
      hint: 'Both searches use the same message and start at lucky number 0, so only the difficulty differs.',
      result: 'The computer tried numbers for you. Each extra leading zero makes a match 16 times less likely, though the attempts needed vary from run to run.'
    },
    'change-the-past': {
      steps: {
        'edit-block': 'Change Block 1’s data. A block is the page from the course.',
        'repair-chain': 'Keep the change, then re-mine Blocks 1, 2 and 3 in order: each needs a new lucky number.'
      },
      hint: 'This is Sealed pages with real blocks: re-mining a block changes its hash (its seal), so the next block’s link breaks until you re-mine that one too.',
      result: 'The same lesson as Sealed pages, now with real block headers: a change breaks the chain, and the repair has to be paid block by block. This toy chain shows links and work, not signatures or a network.'
    },
    'send-first-coin': {
      steps: { 'new-transaction': 'Use New transaction to send coins from one wallet to another.' },
      hint: 'A wallet holds coins. The form shows which coins the payment spends; what it does not use comes back as change, and a small fee goes to the miner (the writer of the page).',
      result: 'Your payment now waits in the mempool, the waiting room for the next block. It becomes part of the chain when a miner wins the draw for that block. powfyicoin is virtual: no real money moves.'
    },
    'win-mining-race': {
      steps: {
        'back-miner': 'Pick a miner to cheer for with Back.',
        'watch-race': 'Press Mine and watch one full draw.',
        'win-block': 'Keep mining until your miner wins a block.'
      },
      hint: 'This is the draw from the course, with real blocks. A stronger miner rolls more often, but every roll is a fresh chance.',
      result: 'Your miner hit first and wrote the block. More hash power means more rolls per second, not a sure win. All miners run in your browser; there is no network.'
    },
    'forge-a-block': {
      steps: { tamper: 'Open a mined block and lower the reward its miner received (the coinbase), in a block whose coin nobody has spent.' },
      hint: 'Like Sealed pages, in the real simulator. Editing a signed payment invalidates its signature. Editing a spent coin also invalidates the payment that spends it. The miner’s payout cannot exceed the reward plus fees. Undo starts over.'
    },
    'survive-halving': {
      hint: 'Every block creates new coins as the miner’s reward. After a fixed number of blocks that reward halves, so new coins become scarcer. A shorter halving interval in Settings gets you there sooner.',
      result: 'The reward halved. Halving reduces the new coins per block without changing the difficulty. That is why the total number of coins has a limit.'
    },
    'beat-difficulty-adjustment': {
      steps: { 'change-pace': 'Mine 10 blocks clearly faster or slower than the target block time.' },
      hint: 'The chain wants a steady pace. If blocks come too fast, it asks for one more zero; too slow, one less. Lower difficulty mines faster. The target block time is in Settings.',
      result: 'The simulator adjusted difficulty to bring block times toward the target. Real mining networks can use different rules and much longer intervals.'
    },
    'follow-stronger-chain': {
      hint: 'Two versions of the notebook compete, and everyone follows the one with more work in it. Give the alternative branch more hash power. Equal work keeps the current branch.'
    },
    'get-payment-in': {
      hint: 'A block has limited room, so miners take the payments that pay the most per byte. Send a low-fee payment to a new wallet, add high-fee transfers until it waits, then spend it from that wallet at 20 sat/B: the new payment pulls the waiting one along.'
    },
    'prove-a-payment': {
      hint: 'A block’s fingerprint covers its payments through a tree of hashes. A short path through that tree can prove that one payment is included. Choose a transaction, then change one hex character (0–9 or a–f) in a sibling, keeping all 64 characters. Reset example starts over.'
    },
    'test-a-signature': {
      hint: 'Work protects the order of the pages; a signature protects each payment. Use the newest block and a transfer, not the coinbase. Re-mining repairs the hash, but only the sender’s key can sign the changed payment. Undo starts over.'
    }
  };

  it('gives every mission after the Basics course its texts in both tones', () => {
    const later = MISSIONS.filter(mission => mission.chapter !== 'basics');
    expect(later.map(mission => mission.id)).toEqual(Object.keys(LATER_PLAIN));
    for (const mission of later) {
      const plain = LATER_PLAIN[mission.id];
      const fields = [
        ['title', mission.title, undefined],
        ['hint', mission.hint, plain.hint],
        ['result', mission.result, plain.result],
        ...mission.steps.map(step => [`step ${step.id}`, step.text, plain.steps?.[step.id]])
      ];
      for (const [field, value, expected] of fields) {
        const label = `${mission.id} ${field}`;
        for (const tone of ['plain', 'technical']) {
          expect(typeof textOf(value, tone), `${label} ${tone}`).toBe('string');
          expect(textOf(value, tone), `${label} ${tone}`).toMatch(/\S/);
        }
        if (expected === undefined) {
          expect(typeof value, `${label} stays one string`).toBe('string');
        } else {
          expect(textOf(value, 'plain'), label).toBe(expected);
          expect(textOf(value, 'technical'), label).not.toBe(expected);
          expect(textOf(value), label).toBe(textOf(value, 'technical'));
        }
      }
      for (const id of Object.keys(plain.steps ?? {})) expect(mission.steps.map(step => step.id), mission.id).toContain(id);
    }
  });

  it('starts at mission 1 and unlocks untouched missions only in order', () => {
    const progress = initialProgress();
    expect(progress).toEqual({ version: 2, completed: [], skipped: [], step: 0, data: {} });
    expect(activeMission(progress).id).toBe('copy-problem');
    expect(MISSIONS.map(mission => missionStatus(progress, mission.id))).toEqual(['active', ...Array(MISSIONS.length - 1).fill('locked')]);
    // Events for later missions do nothing while mission 1 is active.
    expect(apply(progress, ALL_EVENTS.filter(event => event.type !== 'copy_tried'))).toBe(progress);
    const second = apply(progress, COMPLETE['copy-problem']);
    expect(MISSIONS.slice(0, 3).map(mission => missionStatus(second, mission.id))).toEqual(['done', 'active', 'locked']);
    expect(missionStatus(second, 'no-such-mission')).toBe('locked');
  });

  it('treats completion as a set kept in track order', () => {
    // A later mission done, an earlier one still open: the earliest open one is active.
    const gap = progressOf(['see-a-fingerprint', 'send-first-coin'], ['copy-problem']);
    expect(activeMission(gap).id).toBe('change-one-letter');
    expect(['copy-problem', 'see-a-fingerprint', 'change-one-letter', 'change-fingerprint', 'send-first-coin']
      .map(id => missionStatus(gap, id))).toEqual(['skipped', 'done', 'active', 'locked', 'done']);
    expect(totalXp(gap)).toBe(10 + 40);
    expect(earnedBadges(gap)).toEqual([]);
    const later = progressOf(['send-first-coin', 'win-mining-race']);
    const done = apply(later, COMPLETE['copy-problem']);
    expect(done.completed).toEqual(['copy-problem', 'send-first-coin', 'win-mining-race']);
    expect(done.skipped).toEqual([]);
    expect(activeMission(done).id).toBe('see-a-fingerprint');
    expect(earnedBadges(progressOf(['win-mining-race', 'earn-proof-of-work']))).toEqual(['First proof', 'Backer']);
    // Completing keeps the skipped missions.
    const skipped = skip(initialProgress(), ['copy-problem', 'why-guess']);
    const completed = apply(skipped, COMPLETE['see-a-fingerprint']);
    expect(completed).toMatchObject({ completed: ['see-a-fingerprint'], skipped: ['copy-problem', 'why-guess'], step: 0, data: {} });
    expect(activeMission(apply(completed, [...COMPLETE['change-one-letter'], ...COMPLETE['change-fingerprint']])).id).toBe('sealed-pages');
  });

  it('skips known, open missions and restarts only a changed active mission', () => {
    const fresh = initialProgress();
    expect(skip(fresh, [])).toBe(fresh);
    expect(skip(fresh, ['no-such-mission', 7, null])).toBe(fresh);
    expect(skip(fresh, 'copy-problem')).toBe(fresh);
    expect(skip(fresh, ['why-guess', 'copy-problem', 'copy-problem']).skipped).toEqual(['copy-problem', 'why-guess']);

    const midway = apply(fresh, COMPLETE['copy-problem'].slice(0, 1));
    expect(midway.step).toBe(1);
    // Skipping a later mission keeps the active one where it is.
    const later = skip(midway, ['sealed-pages']);
    expect(later).toMatchObject({ completed: [], skipped: ['sealed-pages'], step: 1, data: {} });
    expect(missionStatus(later, 'sealed-pages')).toBe('skipped');
    expect(skip(later, ['sealed-pages'])).toBe(later);
    // Skipping the active mission restarts the step of the next one.
    const seeing = apply(skip(fresh, ['copy-problem']), COMPLETE['see-a-fingerprint'].slice(0, 1));
    expect(seeing).toMatchObject({ step: 1, data: { first: hex('1') } });
    const next = skip(seeing, ['see-a-fingerprint']);
    expect(next).toEqual({ version: 2, completed: [], skipped: ['copy-problem', 'see-a-fingerprint'], step: 0, data: {} });
    expect(activeStep(next)).toMatchObject({ view: 'basics', target: 'basics.compare' });

    // Completed missions cannot be skipped.
    const done = apply(fresh, COMPLETE['copy-problem']);
    expect(skip(done, ['copy-problem'])).toBe(done);
    expect(skip(done, ['copy-problem', 'see-a-fingerprint']).skipped).toEqual(['see-a-fingerprint']);

    // Skipping the whole course lands on the first proof-of-work mission and earns nothing.
    const course = skip(fresh, BASICS);
    expect(activeMission(course).id).toBe('earn-proof-of-work');
    expect(BASICS.map(id => missionStatus(course, id))).toEqual(Array(6).fill('skipped'));
    expect(totalXp(course)).toBe(0);
    expect(earnedBadges(course)).toEqual([]);
    expect(apply(course, ALL_EVENTS.filter(event => event.type !== 'work_found'))).toBe(course);

    // Nothing left to do once every open mission is skipped.
    const all = skip(fresh, MISSIONS.map(mission => mission.id));
    expect(activeMission(all)).toBeNull();
    expect(activeStep(all)).toBeNull();
    expect(apply(all, [...ALL_EVENTS, ...NOISE])).toBe(all);
  });

  it('requires a valid manual proof and never completes on a text edit alone', () => {
    const progress = reach('change-fingerprint');
    expect(activeStep(progress)).toMatchObject({ view: 'basics', target: 'basics.guess' });
    for (const event of [{ type: 'hash_changed' }, { type: 'manual_hash_found' },
      { type: 'manual_hash_found', hash: 'a'.repeat(64) }, { type: 'manual_hash_found', hash: '0' },
      { type: 'manual_hash_found', hash: '0' + 'g'.repeat(63) }, { type: 'work_found', difficulty: 1, attempts: 2 }]) {
      expect(reduce(progress, event)).toBe(progress);
    }
    expect(missionStatus(apply(progress, COMPLETE['change-fingerprint']), 'change-fingerprint')).toBe('done');
  });

  it('completes every mission through its event sequence and derives XP and badges', () => {
    let progress = initialProgress();
    for (const mission of MISSIONS) {
      expect(activeMission(progress).id).toBe(mission.id);
      progress = apply(progress, COMPLETE[mission.id]);
      expect(missionStatus(progress, mission.id)).toBe('done');
    }
    expect(progress.completed).toEqual(MISSIONS.map(mission => mission.id));
    expect(activeMission(progress)).toBeNull();
    expect(activeStep(progress)).toBeNull();
    expect(totalXp(progress)).toBe(MISSIONS.reduce((sum, mission) => sum + mission.reward.xp, 0));
    expect(earnedBadges(progress)).toEqual(MISSIONS.map(mission => mission.reward.badge).filter(Boolean));
    expect(earnedBadges(progress)[0]).toBe('Basics');
    // A finished track ignores everything, including resets.
    expect(apply(progress, [...ALL_EVENTS, ...NOISE])).toBe(progress);
  });

  it('points the coach ring at the current step', () => {
    let progress = reach('win-mining-race');
    const race = byId('win-mining-race');
    expect(activeStep(progress)).toEqual({ mission: race, step: race.steps[0], view: 'workbench', target: 'workbench.back-miner' });
    progress = reduce(progress, { type: 'miner_backed', name: 'Minas' });
    expect(activeStep(progress).step.id).toBe('watch-race');
    expect(activeStep(progress).target).toBe('workbench.mine');
    expect(activeStep(initialProgress())).toMatchObject({ view: 'basics', target: 'basics.copy-photo' });
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

  it('restarts a lab or Basics mission on lesson_reset but not on a simulator reset', () => {
    for (const id of ['copy-problem', 'see-a-fingerprint', 'sealed-pages', 'earn-proof-of-work', 'change-the-past']) {
      const started = reach(id);
      const midway = apply(started, COMPLETE[id].slice(0, 1));
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
    expect(earnedBadges(reset)).toEqual(['Basics', 'First proof', 'Chain mender', 'Backer', 'Forger']);
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

describe('Basics missions', () => {
  it('walks the copy problem from photo to double spend to the shared list', () => {
    const start = reach('copy-problem');
    expect(activeStep(start).target).toBe('basics.copy-photo');
    // Out of order, unknown or missing kinds: ignored.
    expect(apply(start, [{ type: 'copy_tried', kind: 'double-spend' }, { type: 'copy_tried', kind: 'rejected' },
      { type: 'copy_tried', kind: 'other' }, { type: 'copy_tried' }])).toBe(start);
    const photo = reduce(start, COMPLETE['copy-problem'][0]);
    expect(activeStep(photo).target).toBe('basics.copy-coin');
    expect(apply(photo, [{ type: 'copy_tried', kind: 'photo' }, { type: 'copy_tried', kind: 'rejected' }])).toBe(photo);
    const coin = reduce(photo, COMPLETE['copy-problem'][1]);
    expect(activeStep(coin).target).toBe('basics.copy-list');
    expect(apply(coin, [{ type: 'copy_tried', kind: 'photo' }, { type: 'copy_tried', kind: 'double-spend' }])).toBe(coin);
    expect(missionStatus(reduce(coin, COMPLETE['copy-problem'][2]), 'copy-problem')).toBe('done');
  });

  it('needs a changed text before the first fingerprint returns', () => {
    const start = reach('see-a-fingerprint');
    expect(apply(start, [{ type: 'fingerprint_made' }, { type: 'fingerprint_made', hash: 'xyz' },
      { type: 'fingerprint_made', hash: 'A'.repeat(64) }])).toBe(start);
    const first = reduce(start, { type: 'fingerprint_made', hash: hex('1') });
    expect(first).toMatchObject({ step: 1, data: { first: hex('1') } });
    // The same fingerprint before any change proves nothing.
    expect(reduce(first, { type: 'fingerprint_made', hash: hex('1') })).toBe(first);
    const changed = reduce(first, { type: 'fingerprint_made', hash: hex('2') });
    expect(changed).toMatchObject({ step: 1, data: { first: hex('1'), changed: true } });
    expect(reduce(changed, { type: 'fingerprint_made', hash: hex('3') })).toBe(changed);
    expect(missionStatus(reduce(changed, { type: 'fingerprint_made', hash: hex('1') }), 'see-a-fingerprint')).toBe('done');
  });

  it('counts four distinct changed fingerprints', () => {
    const start = reach('change-one-letter');
    expect(apply(start, [{ type: 'fingerprints_compared', changed: 0, right: hex('a') },
      { type: 'fingerprints_compared', changed: 65, right: hex('a') }, { type: 'fingerprints_compared', changed: -1, right: hex('a') },
      { type: 'fingerprints_compared', changed: 1.5, right: hex('a') }, { type: 'fingerprints_compared', changed: 30, right: 'abc' },
      { type: 'fingerprints_compared', changed: '30', right: hex('a') }])).toBe(start);
    const one = reduce(start, COMPLETE['change-one-letter'][0]);
    expect(one).toMatchObject({ step: 1, data: { seen: [hex('a')] } });
    // Repeated fingerprints and unchanged comparisons do not count.
    expect(apply(one, [{ type: 'fingerprints_compared', changed: 12, right: hex('a') },
      { type: 'fingerprints_compared', changed: 0, right: hex('e') }])).toBe(one);
    const three = apply(one, COMPLETE['change-one-letter'].slice(1, 3));
    expect(three).toMatchObject({ step: 1, data: { seen: [hex('a'), hex('b'), hex('c')] } });
    expect(reduce(three, { type: 'fingerprints_compared', changed: 64, right: hex('b') })).toBe(three);
    expect(missionStatus(reduce(three, COMPLETE['change-one-letter'][3]), 'change-one-letter')).toBe('done');
  });

  it('completes the draw after three finished draws', () => {
    const start = reach('why-guess');
    expect(apply(start, [{ type: 'draw_finished', winner: '', rolls: 3 }, { type: 'draw_finished', rolls: 3 },
      { type: 'draw_finished', winner: 'Writer A', rolls: 0 }, { type: 'draw_finished', winner: 'Writer A', rolls: 1.5 },
      { type: 'draw_finished', winner: 7, rolls: 3 }])).toBe(start);
    const one = reduce(start, COMPLETE['why-guess'][0]);
    expect(one).toMatchObject({ step: 1, data: { draws: 1 } });
    expect(reduce(one, { type: 'draw_finished', winner: 'Writer A', rolls: -2 })).toBe(one);
    const two = reduce(one, COMPLETE['why-guess'][1]);
    expect(two).toMatchObject({ step: 1, data: { draws: 2 } });
    expect(missionStatus(reduce(two, COMPLETE['why-guess'][2]), 'why-guess')).toBe('done');
  });

  it('requires a broken first seal for the off repair and a new edit at three zeros before completion', () => {
    const [editOff, repairOff, editWork, repairWork] = COMPLETE['sealed-pages'];
    const start = reach('sealed-pages');
    expect(activeStep(start).target).toBe('basics.page-1');
    expect(apply(start, [
      editWork, { ...editOff, zeros: 2 }, { ...editOff, edited: false }, { ...editOff, page: 2 }, { ...editOff, pageOneBroken: false },
      { ...editOff, valid: true }, { ...editOff, valid: 'no' }, repairOff, repairWork
    ])).toBe(start);
    const broken = reduce(start, editOff);
    expect(activeStep(broken)).toMatchObject({ step: { id: 'repair-free' }, target: 'basics.repair' });
    expect(apply(broken, [
      editWork, repairWork, { ...repairOff, valid: false }, { ...repairOff, hashes: 0 },
      { ...repairOff, pageOneWasBroken: false }, editOff
    ])).toBe(broken);
    const free = reduce(broken, repairOff);
    expect(activeStep(free).step.id).toBe('repair-work');
    expect(apply(free, [
      repairWork, { ...editWork, page: 2, pageOneBroken: false }, repairWork,
      { ...editWork, zeros: 2 }, repairWork, editOff, repairWork
    ])).toBe(free);
    const edited = reduce(free, editWork);
    expect(edited.step).toBe(free.step);
    expect(apply(edited, [
      { ...repairWork, valid: false }, { ...repairWork, hashes: 0 },
      { ...repairWork, zeros: 1 }, { ...repairWork, zeros: 4 }
    ])).toBe(edited);
    expect(apply(edited, [{ ...repairWork, pageOneWasBroken: false }, repairWork])).toEqual(free);
    expect(apply(edited, [{ ...repairWork, zeros: 2 }, repairWork])).toEqual(free);
    expect(apply(edited, [{ ...editWork, pageOneBroken: false }, repairWork])).toEqual(free);
    const done = reduce(edited, repairWork);
    expect(missionStatus(done, 'sealed-pages')).toBe('done');
    expect(earnedBadges(done)).toEqual(['Basics']);
    expect(totalXp(done)).toBe(100);
    expect(activeMission(done).id).toBe('earn-proof-of-work');
  });
});

describe('mission storage', () => {
  it('saves versioned progress and restores completed rewards with a fresh active mission', () => {
    const storage = memoryStorage();
    const progress = apply(reach('forge-a-block'), COMPLETE['forge-a-block'].slice(0, 2));
    expect(save(storage, progress)).toBe(true);
    expect(JSON.parse(storage.items[STORAGE_KEY])).toEqual({ version: PROGRESS_VERSION, completed: progress.completed,
      skipped: [], step: 2, data: { tampered: 2, next: 3 } });
    expect(PROGRESS_VERSION).toBe(2);
    expect(load(storage)).toEqual(reach('forge-a-block'));
    expect(totalXp(load(storage))).toBe(totalXp(progress));
    expect(earnedBadges(load(storage))).toEqual(earnedBadges(progress));
    const done = apply(initialProgress(), ALL_EVENTS);
    save(storage, done);
    expect(load(storage)).toEqual(done);
  });

  it('round-trips skipped missions', () => {
    const storage = memoryStorage();
    const progress = apply(skip(initialProgress(), ['copy-problem', 'see-a-fingerprint', 'change-one-letter', 'sealed-pages']),
      [...COMPLETE['change-fingerprint'], ...COMPLETE['why-guess'], COMPLETE['earn-proof-of-work'][0]]);
    expect(progress).toMatchObject({ completed: ['change-fingerprint', 'why-guess'], step: 1 });
    expect(save(storage, progress)).toBe(true);
    expect(JSON.parse(storage.items[STORAGE_KEY])).toEqual({ version: 2, completed: ['change-fingerprint', 'why-guess'],
      skipped: ['copy-problem', 'see-a-fingerprint', 'change-one-letter', 'sealed-pages'], step: 1, data: { attempts: { 1: 7 } } });
    expect(load(storage)).toEqual({ ...progress, step: 0, data: {} });
    expect(missionStatus(load(storage), 'sealed-pages')).toBe('skipped');
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
      JSON.stringify({ version: 0, completed: ['change-fingerprint'], step: 0, data: {} }),
      JSON.stringify({ version: '2', completed: ['copy-problem'], skipped: [], step: 0, data: {} }),
      JSON.stringify({ version: 3, completed: ['copy-problem'], skipped: [], step: 0, data: {} }),
      JSON.stringify({ version: 1, completed: 'all', step: 0, data: {} }),
      JSON.stringify({ version: PROGRESS_VERSION, completed: 'all', skipped: [], step: 0, data: {} })]) {
      expect(load(memoryStorage({ [STORAGE_KEY]: raw }))).toEqual(fresh);
    }
    expect(save(undefined, fresh)).toBe(false);
    expect(save({ setItem() { throw new Error('QuotaExceededError'); } }, fresh)).toBe(false);
  });

  it('migrates version 1: keeps the valid in-order prefix of the old order and discards saved active steps', () => {
    const v1 = (completed, step = 0, data = {}) => stored({ version: 1, completed, step, data });
    const twoDone = ['change-fingerprint', 'earn-proof-of-work'];
    const course = ['copy-problem', 'see-a-fingerprint', 'change-one-letter', 'why-guess', 'sealed-pages'];
    // Missions after a gap in the old order do not count.
    expect(v1(['change-fingerprint', 'send-first-coin'])).toEqual(progressOf(['change-fingerprint'],
      ['copy-problem', 'see-a-fingerprint', 'change-one-letter']));
    expect(activeMission(v1(['change-fingerprint', 'send-first-coin'])).id).toBe('why-guess');
    expect(v1(['earn-proof-of-work'])).toEqual(initialProgress());
    expect(v1([])).toEqual(initialProgress());
    expect(v1(twoDone, 5)).toEqual(progressOf(twoDone, course));
    expect(activeMission(v1(twoDone, 5)).id).toBe('change-the-past');
    expect(v1([...twoDone, 'send-first-coin'], 1, { backed: 'fixture-miner' }))
      .toEqual(progressOf(['change-fingerprint', 'earn-proof-of-work', 'send-first-coin'], course));
    // The old fifth mission now comes before the simulator; the set stays in track order.
    const fiveDone = V1_ORDER.slice(0, 5);
    const migrated = v1(fiveDone, 2, { tampered: 2, next: 1 });
    expect(migrated).toEqual(progressOf(['change-fingerprint', 'earn-proof-of-work', 'change-the-past', 'send-first-coin',
      'win-mining-race'], course));
    expect(v1(fiveDone, 1, 'x')).toEqual(migrated);
    expect(activeMission(migrated).id).toBe('forge-a-block');
    expect(totalXp(migrated)).toBe(20 + 40 + 60 + 40 + 60);
    expect(earnedBadges(migrated)).toEqual(['First proof', 'Chain mender', 'Backer']);
    const all = v1(V1_ORDER);
    expect(all.skipped).toEqual(course);
    expect(activeMission(all)).toBeNull();
  });

  it('loads version 2 sets, drops unknown ids and skips the Basics a returning learner passed', () => {
    const v2 = value => stored({ version: 2, step: 0, data: {}, ...value });
    expect(v2({ completed: ['sealed-pages', 'no-such-mission', 7, null, 'copy-problem', 'sealed-pages'], skipped: [] }))
      .toEqual(progressOf(['copy-problem', 'sealed-pages'], ['see-a-fingerprint', 'change-one-letter', 'change-fingerprint', 'why-guess']));
    // Stored skips: known and not completed only; a broken list counts as none.
    expect(v2({ completed: ['copy-problem'], skipped: ['test-a-signature', 'copy-problem', 'no-such-mission', 'test-a-signature'] }))
      .toEqual(progressOf(['copy-problem'], ['test-a-signature']));
    expect(v2({ completed: ['copy-problem'], skipped: 'all' })).toEqual(progressOf(['copy-problem']));
    expect(v2({ completed: ['copy-problem'] })).toEqual(progressOf(['copy-problem']));
    // A completed mission after the course skips all open Basics, but no later mission.
    const returning = v2({ completed: ['send-first-coin'], skipped: [], step: 3, data: { backed: 'fixture-miner' } });
    expect(returning).toEqual(progressOf(['send-first-coin'], BASICS));
    expect(activeMission(returning).id).toBe('earn-proof-of-work');
    expect(missionStatus(returning, 'change-the-past')).toBe('locked');
    expect(v2({ completed: ['why-guess'], skipped: ['test-a-signature'] })).toEqual(progressOf(['why-guess'],
      ['copy-problem', 'see-a-fingerprint', 'change-one-letter', 'change-fingerprint', 'test-a-signature']));
    expect(v2({ completed: [], skipped: [] })).toEqual(initialProgress());
  });
});

describe('fork mission evidence and compatibility', () => {
  it('preserves eight completed version 1 missions and unlocks the fork mission', () => {
    const old = { version: 1, completed: V1_ORDER.slice(0, 8), step: 0, data: {} };
    const restored = load(memoryStorage({ [STORAGE_KEY]: JSON.stringify(old) }));
    expect(restored.completed).toEqual(['change-fingerprint', 'earn-proof-of-work', 'change-the-past', 'send-first-coin',
      'win-mining-race', 'forge-a-block', 'survive-halving', 'beat-difficulty-adjustment']);
    expect([...restored.completed].sort()).toEqual([...old.completed].sort());
    expect(restored.skipped).toEqual(['copy-problem', 'see-a-fingerprint', 'change-one-letter', 'why-guess', 'sealed-pages']);
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
