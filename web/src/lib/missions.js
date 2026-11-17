// One mission track in four chapters (CHAPTERS): the six-scene Basics course
// (view 'basics'), the guided lab experiments and the workbench missions
// (web/DESIGN.md, "Existing features in the workbench" and "Mission rail").
// Pure module: no React, no DOM. Storage is only touched through the object passed
// to load() and save().
//
// Completion is a set of mission ids, not an in-order prefix. A learner may skip
// missions (skip()); the active mission is the first one in track order that is
// neither completed nor skipped. Text fields may be a string or { plain, technical }
// (textOf()).
//
// Events (all plain objects with a `type`):
//   Basics:    copy_tried {kind: 'photo'|'double-spend'|'rejected'}, fingerprint_made {hash},
//              fingerprints_compared {changed, right}, manual_hash_found {hash},
//              draw_finished {winner, rolls}, seals_checked {valid, edited},
//              seals_repaired {zeros, hashes, valid}, lesson_reset
//   Labs:      work_found {difficulty, attempts}, chain_checked {consistent, changedFirstBlock},
//              fork_round {scenario, rounds, originalWork, alternativeWork, selected, reorganized},
//              fork_reset, merkle_checked {root, txid, valid, malformed, editedSibling, failedAt},
//              lesson_reset
//   Workbench: transaction_created, miner_backed {name}, block_mined {backedWon, epoch},
//              block_tampered {blockIndex, signed, newest},
//              block_remined {blockIndex, chainValid, hashesAndLinksValid, signatureInvalid, editPresent},
//              edit_undone, fee_market_checked {chainValid, waiting, packages, acceptedBlock, confirmed},
//              difficulty_changed {direction: 'up'|'down'} (automatic adjustment only;
//              events with manual: true are ignored), reset (simulator reset)
// Only the active mission's current step can advance. Everything else is free play
// and leaves progress untouched.

export const STORAGE_KEY = 'proofofwork-missions';
export const PROGRESS_VERSION = 2;

const freeze = value => {
  if (value && typeof value === 'object') {
    Object.values(value).forEach(freeze);
    Object.freeze(value);
  }
  return value;
};

export const CHAPTERS = freeze([
  { id: 'basics', title: 'Basics' },
  { id: 'proof-of-work', title: 'Proof of work' },
  { id: 'simulator', title: 'The simulator' },
  { id: 'deeper', title: 'Going deeper' }
]);

export const MISSIONS = freeze([
  {
    id: 'copy-problem', title: 'The copy problem', chapter: 'basics', view: 'basics',
    steps: [
      { id: 'send-photo', text: 'Send the photo to Bob.', target: 'basics.copy-photo' },
      { id: 'double-spend', text: 'Send the coin to Bob, then the same coin to Carol.', target: 'basics.copy-coin' },
      { id: 'use-list', text: 'Turn on the shared list and try again.', target: 'basics.copy-list' }
    ],
    hint: {
      plain: 'A file never leaves your device when you send it. You send a copy.',
      technical: 'Sending data creates a copy. Without rules for ownership, a digital coin could be spent twice.'
    },
    result: {
      plain: 'Digital files are easy to copy. Money needs rules that prevent the same coin being spent twice. Everyone must agree on who paid whom. Next, explore who gets to write that shared list.',
      technical: 'Without a shared, ordered ledger the same coin can be spent twice. The remaining question is who may append to that ledger when nobody is in charge.'
    },
    reward: { xp: 10 }
  },
  {
    id: 'see-a-fingerprint', title: 'Take a fingerprint', chapter: 'basics', view: 'basics',
    steps: [
      { id: 'type-text', text: 'Type anything. Its fingerprint appears as you type.', target: 'basics.text' },
      { id: 'repeat-text', text: 'Change it, then type your first text again. The same fingerprint returns.', target: 'basics.text' }
    ],
    hint: 'A hash is a fingerprint of data: a short code calculated from every character.',
    result: 'The same text always gives the same fingerprint, on every computer. A SHA-256 fingerprint has 64 hexadecimal characters, whatever the length of the text.',
    reward: { xp: 10 }
  },
  {
    id: 'change-one-letter', title: 'One letter, everything changes', chapter: 'basics', view: 'basics',
    steps: [
      { id: 'change-one', text: 'Change one character on the right.', target: 'basics.compare' },
      { id: 'keep-small', text: 'Try three more small changes. Can you keep the fingerprint almost the same?', target: 'basics.compare' }
    ],
    hint: 'Add a zero, swap a letter, add a space. Watch the counter.',
    result: 'Even a tiny edit typically changes about half the fingerprint’s bits. Small edits become visible. You cannot reverse a fingerprint to recover the text, though you can test guesses.',
    reward: { xp: 10 }
  },
  {
    id: 'change-fingerprint', title: 'Guess a fingerprint', chapter: 'basics', view: 'basics',
    steps: [
      {
        id: 'change-message',
        text: {
          plain: 'Roll until the fingerprint starts with 0: add a number to your text and keep changing it.',
          technical: 'Find a text whose SHA-256 hash starts with 0: append a number and increment it.'
        },
        target: 'basics.guess'
      }
    ],
    hint: 'Each new text is a fresh roll of a 16-sided die. The same text always lands the same way.',
    result: {
      plain: 'Finding a match takes trial and error. Checking it takes one hash of the text. A valid result shows that the text meets the rule; it does not reveal how many tries it took.',
      technical: 'Finding a matching input takes trial and error; verifying it costs one hash. A valid result does not reveal the exact number of attempts.'
    },
    reward: { xp: 20 }
  },
  {
    id: 'why-guess', title: 'Why would anyone guess?', chapter: 'basics', view: 'basics',
    steps: [
      { id: 'run-draw', text: 'Run the draw for the next page.', target: 'basics.draw' },
      { id: 'run-again', text: 'Run two more draws. Does the same writer always win?', target: 'basics.draw' }
    ],
    hint: {
      plain: 'Three writers want to add the next page. Nobody is in charge, so the dice decide.',
      technical: 'Leader election without a leader: every hash is a lottery ticket, so influence follows work, not the number of identities.'
    },
    result: {
      plain: 'The work is like postage for writing a page: the first writer to find a match writes it and earns the reward. Everyone can verify the result by hashing the winning text.',
      technical: 'Proof of work picks the next writer by lottery and prices every page: writing costs work, verifying costs one hash. The same idea was first proposed as postage against e-mail spam.'
    },
    reward: { xp: 20 }
  },
  {
    id: 'sealed-pages', title: 'Sealed pages', chapter: 'basics', view: 'basics',
    steps: [
      { id: 'break-seal', text: 'Change the text on page 1. Watch the seals break.', target: 'basics.page-1' },
      { id: 'repair-free', text: 'Set Guessing to off and repair. Count the hashes.', target: 'basics.repair' },
      { id: 'repair-work', text: 'Set Guessing to 3 zeros, change page 1, then choose Repair.', target: 'basics.repair' }
    ],
    hint: 'Every seal includes the seal of the page before it, so a change travels forward.',
    result: {
      plain: 'The chain makes edits visible. Proof of work makes rewriting it expensive, because the changed page and all later pages need new valid seals.',
      technical: 'A hash chain alone is tamper-evident but cheap to recompute. Proof of work makes rewriting cost the work of every later block again.'
    },
    reward: { xp: 30, badge: 'Basics' }
  },
  {
    id: 'earn-proof-of-work', title: 'Earn a proof of work', chapter: 'proof-of-work', view: 'hash-lab',
    steps: [
      {
        id: 'one-zero',
        text: {
          plain: 'Let the computer roll for you: find a lucky number (nonce) for one leading zero.',
          technical: 'Find a nonce for one leading zero.'
        },
        target: 'hash-lab.search'
      },
      {
        id: 'two-zeros',
        text: { plain: 'Ask for two zeros and roll again.', technical: 'Choose two zeros and search again.' },
        target: 'hash-lab.search'
      }
    ],
    hint: {
      plain: 'Both searches use the same message and start at lucky number 0, so only the difficulty differs.',
      technical: 'Both searches use the same message and start at nonce 0.'
    },
    result: {
      plain: 'The computer tried numbers for you. Each extra leading zero makes a match 16 times less likely, though the attempts needed vary from run to run.',
      technical: 'Both searches used the same message and started at nonce 0. Each extra hex zero makes a match about 16 times less likely per attempt. A single run more or fewer attempts than the average a particular time or attempt ratio.'
    },
    reward: { xp: 40, badge: 'First proof' }
  },
  {
    id: 'change-the-past', title: 'Change the past', chapter: 'proof-of-work', view: 'chain-lab',
    steps: [
      {
        id: 'edit-block',
        text: { plain: 'Change Block 1’s data. A block is the page from the course.', technical: 'Edit Block 1’s data.' },
        target: 'chain-lab.block-1'
      },
      {
        id: 'repair-chain',
        text: {
          plain: 'Keep the change, then re-mine Blocks 1, 2 and 3 in order: each needs a new lucky number.',
          technical: 'Keep your edit, then re-mine Blocks 1, 2 and 3 in order.'
        },
        target: 'chain-lab.remine'
      }
    ],
    hint: {
      plain: 'This is Sealed pages with real blocks: re-mining a block changes its hash (its seal), so the next block’s link breaks until you re-mine that one too.',
      technical: 'Each re-mine changes a hash, so the next block’s link breaks until you re-mine that block too.'
    },
    result: {
      plain: 'The same lesson as Sealed pages, now with real block headers: a change breaks the chain, and the repair has to be paid block by block. This toy chain shows links and work, not signatures or a network.',
      technical: 'Changing an earlier block invalidates the chain. Repairing its hash changes what the next block must link to, so the repair travels forward. This toy chain shows links and work, not signatures or network consensus.'
    },
    reward: { xp: 60, badge: 'Chain mender' }
  },
  {
    id: 'send-first-coin', title: 'Send your first coin', chapter: 'simulator', view: 'workbench',
    steps: [
      {
        id: 'new-transaction',
        text: {
          plain: 'Use New transaction to send coins from one wallet to another.',
          technical: 'Use New transaction to queue a payment.'
        },
        target: 'workbench.new-transaction'
      }
    ],
    hint: {
      plain: 'A wallet holds coins. The form shows which coins the payment spends; what it does not use comes back as change, and a small fee goes to the miner (the writer of the page).',
      technical: 'The form shows which coins it spends. What the payment does not use comes back as change, and a small fee goes to the miner.'
    },
    result: {
      plain: 'Your payment now waits in the mempool, the waiting room for the next block. It becomes part of the chain when a miner wins the draw for that block. powfyicoin is virtual: no real money moves.',
      technical: 'Your transaction spends whole coins, pays the recipient, returns the change to the sender and leaves a fee for the miner. It waits in the mempool until a mined block includes it. powfyicoin is virtual: no real money moves.'
    },
    reward: { xp: 40 }
  },
  {
    id: 'win-mining-race', title: 'Win a mining race', chapter: 'simulator', view: 'workbench',
    steps: [
      {
        id: 'back-miner',
        text: { plain: 'Pick a miner to cheer for with Back.', technical: 'Back a miner.' },
        target: 'workbench.back-miner'
      },
      {
        id: 'watch-race',
        text: { plain: 'Press Mine and watch one full draw.', technical: 'Watch one full race.' },
        target: 'workbench.mine'
      },
      {
        id: 'win-block',
        text: { plain: 'Keep mining until your miner wins a block.', technical: 'Win a block with your backed miner.' },
        target: 'workbench.mine'
      }
    ],
    hint: {
      plain: 'This is the draw from the course, with real blocks. A stronger miner rolls more often, but every roll is a fresh chance.',
      technical: 'Hash power only shifts the odds. Every try is a fresh chance.'
    },
    result: {
      plain: 'Your miner hit first and wrote the block. More hash power means more rolls per second, not a sure win. All miners run in your browser; there is no network.',
      technical: 'Your miner found a valid hash first. More hash power means more tries per second, not a sure win. Both miners run in your browser; there is no network.'
    },
    reward: { xp: 60, badge: 'Backer' }
  },
  {
    id: 'forge-a-block', title: 'Forge a block without getting caught', chapter: 'simulator', view: 'workbench',
    steps: [
      {
        id: 'tamper',
        text: {
          plain: 'Open a mined block and lower the reward its miner received (the coinbase), in a block whose coin nobody has spent.',
          technical: 'Lower a coinbase amount in a mined block whose coin nobody spent.'
        },
        target: 'workbench.selected-block.tamper'
      },
      { id: 'remine-changed', text: 'Re-mine the changed block.', target: 'workbench.remine' },
      { id: 'remine-later', text: 'Re-mine every later block in order until the chain is valid.', target: 'workbench.remine' }
    ],
    hint: {
      plain: 'Like Sealed pages, in the real simulator. Editing a signed payment invalidates its signature. Editing a spent coin also invalidates the payment that spends it. The miner’s payout cannot exceed the reward plus fees. Undo starts over.',
      technical: 'Editing a signed transfer invalidates its signature. Editing a spent output also invalidates the transaction that spends it. A coinbase cannot claim more than the reward plus fees. Undo starts over.'
    },
    result: 'The chain is valid again, but only because you redid the work for the changed block and every block after it, and only because a coinbase has no signature and nobody had spent it. On a real network, other miners would have kept adding blocks meanwhile. This simulation has no network.',
    reward: { xp: 80, badge: 'Forger' }
  },
  {
    id: 'survive-halving', title: 'Survive a halving', chapter: 'simulator', view: 'workbench',
    steps: [
      { id: 'mine-block', text: 'Mine a block and note its reward.', target: 'workbench.mine' },
      { id: 'reach-halving', text: 'Keep mining until the block reward halves.', target: 'workbench.mine' }
    ],
    hint: {
      plain: 'Every block creates new coins as the miner’s reward. After a fixed number of blocks that reward halves, so new coins become scarcer. A shorter halving interval in Settings gets you there sooner.',
      technical: 'The reward halves after a fixed number of blocks. A shorter halving interval in Settings gets you there sooner.'
    },
    result: {
      plain: 'The reward halved. Halving reduces the new coins per block without changing the difficulty. That is why the total number of coins has a limit.',
      technical: 'The block reward halved. Halving leaves difficulty unchanged but reduces the new powfyicoin created per block.'
    },
    reward: { xp: 60, badge: 'Halving survivor' }
  },
  {
    id: 'beat-difficulty-adjustment', title: 'Beat the difficulty adjustment', chapter: 'simulator', view: 'workbench',
    steps: [
      {
        id: 'change-pace',
        text: {
          plain: 'Mine 10 blocks clearly faster or slower than the target block time.',
          technical: 'Mine 10 blocks faster or slower than the target block time.'
        },
        target: 'workbench.mine'
      }
    ],
    hint: {
      plain: 'The chain wants a steady pace. If blocks come too fast, it asks for one more zero; too slow, one less. Lower difficulty mines faster. The target block time is in Settings.',
      technical: 'Lower difficulty mines faster, higher difficulty slower. The target block time is in Settings.'
    },
    result: {
      plain: 'The simulator adjusted difficulty to bring block times toward the target. Real mining networks can use different rules and much longer intervals.',
      technical: 'The difficulty adjusted to bring block times toward the target. Real mining networks can use different adjustment rules and much longer intervals.'
    },
    reward: { xp: 100, badge: 'Pace setter' }
  },
  {
    id: 'follow-stronger-chain', title: 'Follow the stronger chain', chapter: 'deeper', view: 'chain-lab',
    steps: [
      { id: 'start-rewrite', text: 'Choose Rewrite history and mine a block.', target: 'chain-lab.fork-scenario' },
      { id: 'overtake-history', text: 'Let the rewritten branch overtake the original.', target: 'chain-lab.fork-mine' }
    ],
    hint: {
      plain: 'Two versions of the notebook compete, and everyone follows the one with more work in it. Give the alternative branch more hash power. Equal work keeps the current branch.',
      technical: 'Change the alternative branch’s hash power. Equal work keeps the current branch; only strictly more work switches it.'
    },
    result: 'The rewritten branch became the selected history because its valid blocks accumulated more work. This local text model does not forge signatures or move money, and more hash power never guarantees a win within twelve blocks.',
    reward: { xp: 80, badge: 'Fork watcher' }
  },
  {
    id: 'get-payment-in', title: 'Get your payment in', chapter: 'deeper', view: 'workbench', hintKey: 'mission.fee-market',
    steps: [
      { id: 'wait-for-space', text: 'Fill the mempool until a low-fee payment waits because the block is full.', target: 'workbench.new-transaction' },
      { id: 'pay-for-parent', text: 'Spend that pending payment in a new transfer with a higher fee rate.', target: 'workbench.new-transaction' },
      { id: 'confirm-package', text: 'Mine a block that includes both payments.', target: 'workbench.mine' }
    ],
    hint: {
      plain: 'A block has limited room, so miners take the payments that pay the most per byte. Send a low-fee payment to a new wallet, add high-fee transfers until it waits, then spend it from that wallet at 20 sat/B: the new payment pulls the waiting one along.',
      technical: 'Send a low-fee payment to a new wallet, then add high-fee transfers until it waits. From that wallet send a smaller amount at 20 sat/B. Its child fee can pull both into the block.'
    },
    result: 'Your waiting payment and its higher-fee child were mined together. Miners choose packages by fee per byte within 1,300 bytes of payment space here. This is child pays for parent: the child helps pay for its pending ancestor.',
    reward: { xp: 80, badge: 'Fee planner' }
  },
  {
    id: 'prove-a-payment', title: 'Prove a payment', chapter: 'deeper', view: 'chain-lab', hintKey: 'mission.merkle',
    steps: [
      { id: 'check-path', text: 'Choose a payment and follow its proof to the header’s Merkle root.', target: 'chain-lab.merkle-payment' },
      { id: 'change-sibling', text: 'Change one character of one sibling hash. Find the first diverging level.', target: 'chain-lab.merkle-sibling' }
    ],
    hint: {
      plain: 'A block’s fingerprint covers its payments through a tree of hashes. A short path through that tree can prove that one payment is included. Choose a transaction, then change one hex character (0–9 or a–f) in a sibling, keeping all 64 characters. Reset example starts over.',
      technical: 'Choose a transaction to check its real proof. Then replace one hex character (0–9 or a–f) in a sibling, keeping all 64 characters. Reset example starts over.'
    },
    result: 'The original path matched the header’s Merkle root. Changing one sibling changed the computed root, with the first diverging level marked. These toy payment texts prove inclusion only; they are not signed transfers.',
    reward: { xp: 60, badge: 'Proof reader' }
  },
  {
    id: 'test-a-signature', title: 'Try to steal a coin', chapter: 'deeper', view: 'workbench', hintKey: 'mission.signature',
    steps: [
      { id: 'edit-signed-payment', text: 'Mine a payment, then change a signed transfer’s amount in the newest block.', target: 'workbench.selected-block.tamper' },
      { id: 'redo-work', text: 'Choose Test proof of work anyway. See the signature stay invalid after re-mining.', target: 'workbench.signature-test' }
    ],
    hint: {
      plain: 'Work protects the order of the pages; a signature protects each payment. Use the newest block and a transfer, not the coinbase. Re-mining repairs the hash, but only the sender’s key can sign the changed payment. Undo starts over.',
      technical: 'Use the newest block, so there are no later blocks to repair. Choose a transfer, not the coinbase. Re-mining can repair its hash, but only the sender’s key can sign the changed payment. Undo starts over.'
    },
    result: 'Every stored hash meets its target and every link matches, yet the signed payment is invalid. Proof of work can be redone; the sender’s signature cannot be reused for a changed amount. This is a local experiment with virtual coins, not a network attack.',
    reward: { xp: 80, badge: 'Signature checker' }
  }
]);

const BY_ID = new Map(MISSIONS.map((mission, index) => [mission.id, index]));
const isObject = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const isIndex = value => Number.isSafeInteger(value) && value >= 0;
const isCount = value => Number.isSafeInteger(value) && value > 0;
const isHash = value => typeof value === 'string' && /^[0-9a-f]{64}$/.test(value);

// Per mission: advance(stepIndex, data, event) returns the next {step, data} or null to
// ignore the event. step === steps.length completes the mission.
const RULES = {
  'copy-problem': {
    advance(step, data, event) {
      if (event.type !== 'copy_tried') return null;
      const expected = ['photo', 'double-spend', 'rejected'][step];
      return event.kind === expected ? { step: step + 1, data } : null;
    }
  },
  'see-a-fingerprint': {
    advance(step, data, event) {
      if (event.type !== 'fingerprint_made' || !isHash(event.hash)) return null;
      if (step === 0) return { step: 1, data: { first: event.hash } };
      if (event.hash !== data.first) return data.changed ? null : { step: 1, data: { ...data, changed: true } };
      return data.changed ? { step: 2, data } : null;
    }
  },
  'change-one-letter': {
    advance(step, data, event) {
      if (event.type !== 'fingerprints_compared' || !Number.isInteger(event.changed) || event.changed < 0 ||
        event.changed > 64 || !isHash(event.right) || event.changed === 0) return null;
      if (step === 0) return { step: 1, data: { seen: [event.right] } };
      if (data.seen.includes(event.right)) return null;
      const seen = [...data.seen, event.right];
      return { step: seen.length >= 4 ? 2 : 1, data: { seen } };
    }
  },
  'why-guess': {
    advance(step, data, event) {
      if (event.type !== 'draw_finished' || typeof event.winner !== 'string' || event.winner.length === 0 ||
        !isCount(event.rolls)) return null;
      if (step === 0) return { step: 1, data: { draws: 1 } };
      const draws = data.draws + 1;
      return { step: draws >= 3 ? 2 : 1, data: { draws } };
    }
  },
  'sealed-pages': {
    advance(step, data, event) {
      if (event.type === 'seals_checked') {
        if (typeof event.valid !== 'boolean' || typeof event.edited !== 'boolean') return null;
        return step === 0 && event.edited && !event.valid ? { step: 1, data } : null;
      }
      if (event.type !== 'seals_repaired' || !Number.isInteger(event.zeros) || event.zeros < 0 || event.zeros > 3 ||
        !isCount(event.hashes) || event.valid !== true) return null;
      if (step === 1 && event.zeros === 0) return { step: 2, data };
      if (step === 2 && event.zeros >= 2 && event.hashes > 3) return { step: 3, data };
      return null;
    }
  },
  'get-payment-in': {
    advance(step, data, event) {
      if (event.type !== 'fee_market_checked' || event.chainValid !== true) return null;
      if (step === 0) {
        const waiting = Array.isArray(event.waiting) && event.waiting.find(entry => isObject(entry) && isHash(entry.txid) && entry.reason === 'full' && entry.rate > 0 && entry.rate < 2);
        return waiting ? { step: 1, data: { parent: waiting.txid } } : null;
      }
      if (step === 1) {
        if (isHash(event.acceptedBlock) && Array.isArray(event.confirmed) && event.confirmed.includes(data.parent)) return { step: 0, data: {} };
        const child = Array.isArray(event.packages) && event.packages.find(entry => isObject(entry) && entry.parent === data.parent && isHash(entry.child) && entry.higherFee === true && entry.selected === true);
        return child ? { step: 2, data: { ...data, child: child.child } } : null;
      }
      if (!isHash(event.acceptedBlock) || !Array.isArray(event.confirmed)) return null;
      if (event.confirmed.includes(data.parent) && event.confirmed.includes(data.child)) return { step: 3, data };
      return event.confirmed.includes(data.parent) ? { step: 0, data: {} } : null;
    }
  },
  'prove-a-payment': {
    advance(step, data, event) {
      if (event.type !== 'merkle_checked' || !isHash(event.root) || !isHash(event.txid)) return null;
      if (step === 0) return event.valid === true && event.editedSibling === false
        ? { step: 1, data: { root: event.root, txid: event.txid } } : null;
      return event.root === data.root && event.txid === data.txid && event.valid === false && event.malformed === false &&
        event.editedSibling === true && isCount(event.failedAt) ? { step: 2, data } : null;
    }
  },
  'test-a-signature': {
    advance(step, data, event) {
      if (event.type === 'edit_undone') return step > 0 ? { step: 0, data: {} } : null;
      if (event.type === 'block_tampered') return event.signed === true && event.newest === true && isCount(event.blockIndex)
        ? { step: 1, data: { tampered: event.blockIndex } } : step > 0 ? { step: 0, data: {} } : null;
      return step === 1 && event.type === 'block_remined' && event.blockIndex === data.tampered && event.chainValid === false &&
        event.hashesAndLinksValid === true && event.signatureInvalid === true && event.editPresent === true ? { step: 2, data } : null;
    }
  },
  'change-fingerprint': {
    advance: (step, data, event) => event.type === 'manual_hash_found' && /^0[0-9a-f]{63}$/.test(event.hash) ? { step: 1, data } : null
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

// Mission order before the Basics course (progress version 1). Version 1 stored an
// in-order prefix of exactly this list.
const V1_ORDER = Object.freeze(['change-fingerprint', 'earn-proof-of-work', 'send-first-coin', 'win-mining-race',
  'change-the-past', 'forge-a-block', 'survive-halving', 'beat-difficulty-adjustment', 'follow-stronger-chain',
  'get-payment-in', 'prove-a-payment', 'test-a-signature']);

const skippedOf = progress => progress.skipped ?? [];
// Known, unique ids in track order.
const inTrackOrder = ids => MISSIONS.filter(mission => ids.includes(mission.id)).map(mission => mission.id);

/**
 * A text field (title, step text, hint, result) is a string or { plain, technical }.
 * Returns the variant for the tone ('plain' | 'technical'); a missing variant falls
 * back to the other one, a string is returned as is.
 */
export function textOf(value, tone = 'technical') {
  if (!isObject(value)) return value;
  return tone === 'plain' ? value.plain ?? value.technical : value.technical ?? value.plain;
}

/** Fresh progress: mission 1 active at its first step, nothing completed or skipped. */
export function initialProgress() {
  return { version: PROGRESS_VERSION, completed: [], skipped: [], step: 0, data: {} };
}

/**
 * The mission that events can advance: the first in track order that is neither
 * completed nor skipped, or null when none is left.
 */
export function activeMission(progress) {
  const skipped = skippedOf(progress);
  return MISSIONS.find(mission => !progress.completed.includes(mission.id) && !skipped.includes(mission.id)) ?? null;
}

/** 'done' | 'skipped' | 'active' | 'locked' for a mission id. */
export function missionStatus(progress, id) {
  if (!BY_ID.has(id)) return 'locked';
  if (progress.completed.includes(id)) return 'done';
  if (skippedOf(progress).includes(id)) return 'skipped';
  return activeMission(progress)?.id === id ? 'active' : 'locked';
}

/** Coach ring position: the active mission's current step, or null when all are done. */
export function activeStep(progress) {
  const mission = activeMission(progress);
  if (!mission) return null;
  const step = mission.steps[progress.step];
  return { mission, step, view: mission.view, target: step.target };
}

// Funding is a prerequisite for the first payment, not a saved mission step.
export function guideFirstPayment(active, needsFunds, canStartDemo) {
  if (!needsFunds) return active;
  return canStartDemo
    ? { ...active, target: 'workbench.start-demo', instruction: 'Press Start demo to mine the first block and give the wallets coins to spend.' }
    : { ...active, target: 'workbench.mine', instruction: 'Press Mine block to earn coins that a wallet can spend.' };
}

// The Chain lab experiment each mission runs in; every other mission opens the repair.
const EXPERIMENTS = Object.freeze({ 'follow-stronger-chain': 'fork', 'prove-a-payment': 'merkle' });

/** The Chain lab experiment ('repair' | 'fork' | 'merkle') for a mission id (or none). */
export function experimentOf(missionId) {
  return Object.hasOwn(EXPERIMENTS, missionId ?? '') ? EXPERIMENTS[missionId] : 'repair';
}

const completedMissions = progress => MISSIONS.filter(mission => progress.completed.includes(mission.id));

export function totalXp(progress) {
  return completedMissions(progress).reduce((sum, mission) => sum + mission.reward.xp, 0);
}

export function earnedBadges(progress) {
  return completedMissions(progress).map(mission => mission.reward.badge).filter(Boolean);
}

/**
 * Marks the known, not completed mission ids as skipped. When that changes the active
 * mission, its step and data restart. Returns the same object when nothing changes.
 */
export function skip(progress, ids) {
  if (!Array.isArray(ids)) return progress;
  const before = skippedOf(progress);
  const added = ids.filter(id => BY_ID.has(id) && !progress.completed.includes(id) && !before.includes(id));
  if (!added.length) return progress;
  const next = { ...progress, skipped: inTrackOrder([...before, ...added]) };
  return activeMission(next) === activeMission(progress) ? next : { ...next, step: 0, data: {} };
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
  // A lab reset restarts any non-workbench mission (labs and Basics); a simulator reset only a workbench mission.
  if (event.type === 'lesson_reset') return lab && (progress.step !== 0 || Object.keys(progress.data).length) ? restart : progress;
  if (event.type === 'reset') return !lab && (progress.step !== 0 || Object.keys(progress.data).length) ? restart : progress;
  const next = RULES[mission.id].advance(progress.step, progress.data, event);
  if (!next) return progress;
  if (next.step >= mission.steps.length) {
    return { ...progress, completed: inTrackOrder([...progress.completed, mission.id]), step: 0, data: {} };
  }
  if (next.step === progress.step && next.data === progress.data) return progress;
  return { ...progress, step: next.step, data: next.data };
}

function normalize(stored) {
  const fresh = initialProgress();
  if (!isObject(stored) || (stored.version !== 1 && stored.version !== 2) || !Array.isArray(stored.completed)) return fresh;
  let completed;
  let skipped = [];
  if (stored.version === 1) {
    // Version 1 counted only an in-order prefix of the old track as completed.
    let count = 0;
    while (count < V1_ORDER.length && stored.completed[count] === V1_ORDER[count]) count += 1;
    completed = inTrackOrder(V1_ORDER.slice(0, count));
  } else {
    completed = inTrackOrder(stored.completed);
    skipped = Array.isArray(stored.skipped) ? inTrackOrder(stored.skipped.filter(id => !completed.includes(id))) : [];
  }
  // A returning learner is never thrown back into the course: every Basics mission
  // before a completed mission that is not completed itself counts as skipped.
  const last = Math.max(-1, ...completed.map(id => BY_ID.get(id)));
  const passed = MISSIONS.filter((mission, index) => mission.chapter === 'basics' && index < last &&
    !completed.includes(mission.id)).map(mission => mission.id);
  // Reload creates fresh labs and a fresh simulator. Backing, edited blocks and
  // observed halving epochs no longer exist, so only completed and skipped missions survive.
  return { ...fresh, completed, skipped: inTrackOrder([...skipped, ...passed]) };
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
    const skipped = skippedOf(progress);
    storage.setItem(STORAGE_KEY, JSON.stringify({ version: PROGRESS_VERSION, completed, skipped, step, data }));
    return true;
  } catch {
    return false;
  }
}
