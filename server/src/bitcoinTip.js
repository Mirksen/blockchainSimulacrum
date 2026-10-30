// The pool's round is a recent Bitcoin block. Its hash goes into every proof, so a
// proof cannot be computed before that block existed. A proof stays valid while its
// block is one of the last WINDOW_BLOCKS (144, about a day): work cannot be stockpiled
// for longer than that. Anyone can look the block up and recompute a proof with one SHA-256.
//
// The explorer is not trusted: every block it reports must pass blockProblem() (its header
// hashes to its id with real proof of work) and link to the block below it, so a wrong or
// compromised explorer can only make the pool unavailable, not invent rounds.

import { blockProblem, MIN_WORK_BITS } from './bitcoinHeader.js';

export const TIP_API = 'https://mempool.space/api';
export const TIP_POLL_MS = 60 * 1000;
export const TIP_TIMEOUT_MS = 10 * 1000;
export const WINDOW_BLOCKS = 144;

const HASH_RE = /^[0-9a-f]{64}$/;

export function isRound(round) {
  return Boolean(round) && Number.isSafeInteger(round.height) && round.height >= 0 &&
    typeof round.hash === 'string' && HASH_RE.test(round.hash);
}

export function createTipTracker({ fetchImpl = fetch, api = TIP_API, pollMs = TIP_POLL_MS, windowBlocks = WINDOW_BLOCKS, minWorkBits = MIN_WORK_BITS, log } = {}) {
  // height → { hash, prev } of the last `windowBlocks` blocks, each checked and linked.
  const known = new Map();
  let tip = null;
  let timer = null;

  // A page of up to 15 consecutive blocks, newest first, from `start` (the tip when omitted).
  async function page(start) {
    const path = start === undefined ? '/v1/blocks' : `/v1/blocks/${start}`;
    const res = await fetchImpl(`${api}${path}`, { signal: AbortSignal.timeout(TIP_TIMEOUT_MS) });
    if (!res.ok) throw new Error(`${path} answered ${res.status}`);
    const blocks = await res.json();
    if (!Array.isArray(blocks) || blocks.length === 0) throw new Error('unreadable blocks');
    blocks.forEach((block, index) => {
      const problem = blockProblem(block, { minWorkBits });
      if (problem) throw new Error(`block ${block?.height}: ${problem}`);
      const below = blocks[index + 1];
      if (below && (below.height !== block.height - 1 || below.id !== block.previousblockhash)) {
        throw new Error(`block ${block.height} does not link to the block below`);
      }
    });
    return blocks.map(block => ({ height: block.height, hash: block.id, prev: block.previousblockhash }));
  }

  // Forgets every block below the first broken link under the tip; true if it found one.
  function dropUnlinked(from) {
    for (let height = tip.height; height > from; height -= 1) {
      const block = known.get(height);
      const below = known.get(height - 1);
      if (block && below && block.prev !== below.hash) {
        for (const stale of [...known.keys()]) if (stale < height) known.delete(stale);
        return true;
      }
    }
    return false;
  }

  async function poll() {
    try {
      // The newest page overwrites its heights, which also follows a reorganisation.
      const newest = await page();
      for (const block of newest) known.set(block.height, block);
      tip = { height: newest[0].height, hash: newest[0].hash };
      const from = Math.max(0, tip.height - windowBlocks + 1);
      for (const height of [...known.keys()]) if (height < from || height > tip.height) known.delete(height);
      // A reorganisation deeper than the newest page leaves stale blocks below it.
      dropUnlinked(from);
      // Fill older gaps of the window, one page at a time.
      for (let height = tip.height; height >= from; height -= 1) {
        if (known.has(height)) continue;
        for (const block of await page(height)) if (block.height >= from) known.set(block.height, block);
      }
      if (dropUnlinked(from)) throw new Error('the window does not link up');
    } catch (error) {
      log?.(`bitcoin tip unavailable: ${error?.message ?? error}`);
    }
  }

  return {
    poll,
    start() {
      void poll();
      timer = setInterval(poll, pollMs);
      timer.unref?.();
    },
    stop() {
      clearInterval(timer);
      timer = null;
    },
    round: () => tip,
    // The oldest block height a proof may still name, or null before the first poll.
    windowStart: () => (tip ? Math.max(0, tip.height - windowBlocks + 1) : null),
    accepts(round) {
      return isRound(round) && known.get(round.height)?.hash === round.hash;
    },
  };
}
