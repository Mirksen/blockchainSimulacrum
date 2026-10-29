// Pure helpers for the chain band and the chain timeline: short hashes, one
// view model per block, link states and the chain health summary.
// No React, no simulation calls; everything comes from the snapshot
// (blocks, blockStatus, participants, tamperedEdits) of useBlockchain.

import { GENESIS } from '../../lib/poolProof';

const BROKEN_STATUSES = new Set(['hash-mismatch', 'signature-invalid', 'link-broken']);
const KNOWN_MINERS = new Set(['lars', 'minas', 'alice', 'bob', 'chris']);

// First 6 + last 2 characters with "…" (web/DESIGN.md, "Chain band").
export function shortHash(hash) {
  if (typeof hash !== 'string' || hash.length === 0) return '';
  if (hash.length <= 8) return hash;
  return `${hash.slice(0, 6)}…${hash.slice(-2)}`;
}

// Number of leading "0" characters of a hash.
export function zerosOf(hash) {
  if (typeof hash !== 'string') return 0;
  const match = hash.match(/^0*/);
  return match ? match[0].length : 0;
}

// "7.1 s"; null when there is no duration (Genesis, unknown timestamps).
export function formatSeconds(seconds) {
  if (seconds === null || seconds === undefined || !Number.isFinite(seconds)) return null;
  return `${Math.max(0, seconds).toFixed(1)} s`;
}

const ORDINALS = ['first', 'second', 'third', 'fourth', 'fifth', 'sixth', 'seventh', 'eighth', 'ninth', 'tenth'];
export function ordinal(position) {
  return ORDINALS[position - 1] ?? `number ${position}`;
}

// "#3 and #4", "#3, #4 and #5"
export function listBlocks(indices) {
  const names = indices.map(index => `#${index}`);
  if (names.length <= 1) return names.join('');
  return `${names.slice(0, -1).join(', ')} and ${names.at(-1)}`;
}

function minerOf(block, participants) {
  const coinbase = (block.transactions ?? []).find(tx => tx && tx.sender === null);
  if (!coinbase) return null;
  return (participants ?? []).find(p => p.publicKey === coinbase.recipient) ?? null;
}

// One view model per block, oldest first.
export function buildBlockViews({ blocks = [], blockStatus = [], participants = [], tamperedEdits = [] } = {}) {
  return blocks.map((block, index) => {
    const check = blockStatus[index] ?? {};
    const isGenesis = index === 0;
    const miner = isGenesis ? null : minerOf(block, participants);
    const minerName = isGenesis ? 'Genesis' : (miner?.name ?? 'Unknown miner');
    const minerKey = isGenesis ? 'genesis' : (KNOWN_MINERS.has(minerName.toLowerCase()) ? minerName.toLowerCase() : 'other');
    const previous = blocks[index - 1];
    // The genesis block has a fixed launch time, so block #1 has no mining interval.
    const seconds = index > 1 && Number.isFinite(block.timestamp) && Number.isFinite(previous?.timestamp)
      ? (block.timestamp - previous.timestamp) / 1000 : null;
    const storedHash = check.storedHash ?? block.hash ?? '';
    const computedHash = check.computedHash ?? storedHash;
    const difficulty = Number.isFinite(block.difficulty) ? block.difficulty : 0;
    const status = check.status ?? 'valid';
    const edits = tamperedEdits
      .filter(edit => edit.blockIndex === index)
      .map(({ txIndex, from, to }) => ({ txIndex, from, to }));
    return {
      index,
      isGenesis,
      minerName,
      minerKey,
      txCount: (block.transactions ?? []).length,
      seconds,
      storedHash,
      computedHash,
      prevHash: isGenesis ? null : (block.previousHash ?? ''),
      // The genesis block is built on a Bitcoin block of its launch day.
      anchor: isGenesis && block.previousHash === GENESIS.anchor.hash ? { height: GENESIS.anchor.height, hash: block.previousHash } : null,
      difficulty,
      // zeros the hash as it is now shows, against the zeros its target needs
      zerosNow: zerosOf(computedHash),
      hashMatches: check.hashMatches ?? true,
      meetsTarget: check.meetsTarget ?? true,
      linkIntact: check.linkIntact ?? true,
      signaturesValid: check.signaturesValid ?? true,
      status,
      edits,
      edited: edits.length > 0
    };
  });
}

export function isBrokenStatus(status) {
  return BROKEN_STATUSES.has(status);
}

// Tile/row state class for a block view.
export function stateOf(view) {
  if (view.status === 'built-on-broken') return 'dependent';
  if (isBrokenStatus(view.status)) return 'broken';
  return 'ok';
}

// Text status of a block, never color alone.
export function statusLabel(status) {
  switch (status) {
    case 'hash-mismatch': return 'Hash mismatch';
    case 'signature-invalid': return 'Signature invalid';
    case 'link-broken': return 'Link broken';
    case 'built-on-broken': return 'Built on a broken block';
    default: return 'Valid';
  }
}

// Whether the hash as it is now starts with the zeros its target needs.
export function hashChecksOut(view) {
  return view.hashMatches && view.meetsTarget;
}

// The link from block view.index - 1 into `view`. `previous` is the view before it.
// ok: intact (neutral); broken: the stored previous hash differs (red);
// dependent: the stored previous hash is the predecessor's hash *as mined*,
// but the predecessor changed afterwards (amber, "Link unchanged").
export function linkInto(view, previous) {
  const k = view.index;
  const p = k - 1;
  if (!view.linkIntact || view.status === 'link-broken') {
    return {
      state: 'broken', title: 'Link broken',
      text: `#${k} stores ${shortHash(view.prevHash)}, not the hash of #${p}`,
      label: `Link broken: block ${k} does not store the hash of block ${p}`
    };
  }
  if (previous && previous.status === 'hash-mismatch') {
    return {
      state: 'dependent', title: 'Link unchanged',
      text: `#${k} still stores ${shortHash(view.prevHash)}, #${p} as mined`,
      label: `Link unchanged: block ${k} still stores ${shortHash(view.prevHash)}, the hash of block ${p} as mined`
    };
  }
  return {
    state: 'ok', title: 'Link intact',
    text: `#${k} stores the hash of #${p}`,
    label: `Link intact: block ${k} stores the hash of block ${p}`
  };
}

// Link from the newest block to the candidate (not mined yet).
export function pendingLink(candidateIndex, state) {
  const p = candidateIndex - 1;
  if (state === 'mining') {
    return { state: 'pending', title: 'Being mined', text: `#${candidateIndex} will store the hash of #${p}`,
      label: `Not linked yet: block ${candidateIndex} is being mined and will store the hash of block ${p}` };
  }
  if (state === 'paused') {
    return { state: 'pending', title: 'Paused', text: `#${candidateIndex} waits until the chain is valid`,
      label: `Not linked yet: block ${candidateIndex} waits until the chain is valid` };
  }
  return { state: 'pending', title: 'Not mined yet', text: `#${candidateIndex} will store the hash of #${p}`,
    label: `Not linked yet: block ${candidateIndex} will store the hash of block ${p}` };
}

// The zeros mined blocks need, when they all share one target ("00"); else null.
export function sharedTarget(views) {
  const mined = views.filter(view => !view.isGenesis);
  if (mined.length === 0) return null;
  const difficulty = mined[0].difficulty;
  if (difficulty <= 0 || mined.some(view => view.difficulty !== difficulty)) return null;
  return '0'.repeat(difficulty);
}

// Chain health summary computed from the views (Genesis has no target and no link,
// so hashes and links count the mined blocks only).
export function healthSummary(views) {
  const mined = views.filter(view => !view.isGenesis);
  const valid = views.every(view => view.status === 'valid');
  const hashOk = mined.filter(hashChecksOut).length;
  const linkOk = mined.filter(view => view.linkIntact).length;
  const target = sharedTarget(views);
  const hashPhrase = target ? `hashes start with ${target}` : 'hashes meet their target';

  const issues = [];
  const byStatus = status => views.filter(view => view.status === status).map(view => view.index);
  const changed = byStatus('hash-mismatch');
  const unsigned = byStatus('signature-invalid');
  const unlinked = byStatus('link-broken');
  const dependents = byStatus('built-on-broken');
  if (changed.length) issues.push(`${listBlocks(changed)} changed after mining`);
  if (unsigned.length) issues.push(`${listBlocks(unsigned)} ${unsigned.length > 1 ? 'have' : 'has'} a signature that no longer matches`);
  for (const index of unlinked) issues.push(`#${index} does not store the hash of #${index - 1}`);
  if (dependents.length) {
    const roots = changed.length + unsigned.length + unlinked.length;
    issues.push(`${listBlocks(dependents)} ${dependents.length > 1 ? 'are' : 'is'} unchanged but built on ${roots === 1 ? 'it' : 'a broken block'}`);
  }

  return {
    valid,
    minedCount: mined.length,
    hashOk,
    linkOk,
    target,
    hashPhrase,
    issues,
    firstBroken: views.find(view => view.status !== 'valid')?.index ?? null
  };
}

// Visible window of the band per container tier (see ChainBand.css):
// a: < 1114 px, b: 1114-1239 px, c: >= 1240 px. `full` blocks fit without the
// "‹ N earlier" control; with the control `withEarlier` blocks stay visible.
export const BAND_TIERS = Object.freeze({
  a: { full: 3, withEarlier: 3 },
  b: { full: 5, withEarlier: 4 },
  c: { full: 5, withEarlier: 5 }
});

export function bandWindow(count) {
  const result = {};
  for (const [tier, { full, withEarlier }] of Object.entries(BAND_TIERS)) {
    const hidden = count > full ? count - withEarlier : 0;
    result[tier] = { hidden, visible: count - hidden };
  }
  return result;
}

// Text of the candidate in each state.
export function candidateCopy(candidate) {
  const { index, txCount = 0, state = 'idle', elapsedMs, attempts } = candidate;
  const tx = `${txCount} tx`;
  switch (state) {
    case 'mining': {
      const elapsed = formatSeconds((elapsedMs ?? 0) / 1000);
      const tries = Number.isFinite(attempts) ? attempts.toLocaleString('en-US') : null;
      return { tag: 'mining', time: elapsed, what: tx, tries, down: 'Race below',
        label: `Candidate block ${index}, being mined for ${elapsed.replace(' s', ' seconds')}, ${txCount} transactions${tries ? `, ${tries} tries so far` : ''}` };
    }
    case 'paused':
      return { tag: 'paused', time: 'not mined', what: `${tx} waiting`, down: 'Repair below',
        label: `Candidate block ${index}, paused while the chain is invalid, ${txCount} transactions waiting` };
    case 'fresh':
      return { tag: 'next', time: 'not mined', what: 'demo not set up', down: 'Start the demo below',
        label: `Candidate block ${index}, not mined yet, the demo is not set up` };
    default:
      return { tag: 'next', time: 'not mined', what: `${tx} waiting`, down: 'Mine it below',
        label: `Candidate block ${index}, not mined yet, ${txCount} transactions waiting` };
  }
}

// Root cause a dependent block sits on: the nearest broken block before it.
export function brokenBefore(views, index) {
  for (let i = index - 1; i >= 0; i--) {
    if (views[i] && stateOf(views[i]) === 'broken') return views[i].index;
  }
  return null;
}
