// The arrival tour of the workbench (components/workbench/WorkbenchTour.jsx): five stops that
// name each region once, in the words of the Basics course. Pure module: no React, no DOM.
// Storage is only touched through the object passed to seen() and markSeen().
// With its extension: the browser acceptance (scripts/tour.acceptance.mjs) loads it in Node.
import { textOf } from './missions.js';

export const TOUR_KEY = 'proofofwork-tour-seen';

// `id` is the region's `data-tour` attribute on the workbench (components/workbench/Workbench.jsx).
// Title and text are a string or { plain, technical } (lib/missions.js, textOf).
export const STOPS = Object.freeze([
  {
    id: 'chain',
    title: { plain: 'The notebook', technical: 'The chain' },
    text: {
      plain: 'Every tile is a page, sealed together with the seal of the page before it. Bitcoin calls them blocks. The first one, Genesis, is already written.',
      technical: 'Every tile is a block that commits to its predecessor’s hash. Genesis is already mined.'
    }
  },
  {
    id: 'block',
    title: { plain: 'One page, opened', technical: 'The selected block' },
    text: {
      plain: 'Hash is this block’s seal, Previous is the seal before it, and Nonce is the lucky number that made the seal start with zeros.',
      technical: 'The header of the selected block: hash, previous hash, nonce and merkle root.'
    }
  },
  {
    id: 'next',
    title: { plain: 'The draw', technical: 'The next block' },
    text: {
      plain: 'Here the next block is drawn. The miners roll, the first hit writes the block and earns the reward. Start demo runs your first draw.',
      technical: 'The candidate block and the miner race for it. Start demo mines block #1.'
    }
  },
  {
    id: 'mempool',
    title: { plain: 'The waiting room', technical: 'The mempool' },
    text: {
      plain: 'Payments wait here until a miner writes them into a block.',
      technical: 'Pending transactions, in the order the next block would take them.'
    }
  },
  {
    id: 'wallets',
    title: { plain: 'Who owns what', technical: 'Wallets' },
    text: {
      plain: 'Each wallet’s coins, counted from the chain itself. Miners earn theirs block by block.',
      technical: 'Balances derived from the chain’s unspent outputs.'
    }
  }
].map(stop => Object.freeze({ ...stop, title: Object.freeze(stop.title), text: Object.freeze(stop.text) })));

/** The stops with title and text in one tone ('plain' | 'technical'). */
export function stopsFor(tone) {
  return STOPS.map(stop => ({ id: stop.id, title: textOf(stop.title, tone), text: textOf(stop.text, tone) }));
}

/** Whether this browser has seen the tour; missing or blocked storage has not. */
export function seen(storage) {
  try {
    return storage?.getItem(TOUR_KEY) === '1';
  } catch {
    return false;
  }
}

/** Remembers that the tour was seen; returns false when storage is missing or refuses. */
export function markSeen(storage) {
  try {
    if (!storage) return false;
    storage.setItem(TOUR_KEY, '1');
    return true;
  } catch {
    return false;
  }
}
