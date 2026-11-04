// The pool's round is a recent Bitcoin block. Its hash goes into every proof, so a
// proof cannot be computed before that block existed. A proof stays valid while its
// block is one of the last WINDOW_BLOCKS (144, about a day): work cannot be stockpiled
// for longer than that. Anyone can look the block up and recompute a proof with one SHA-256.
//
// The explorer is not trusted: every block it reports must pass blockProblem() (its header
// hashes to its id with real proof of work) and link to the block below it, so a wrong or
// compromised explorer can only make the pool unavailable, not invent rounds. That makes a
// second explorer safe: each page comes from the first one that answers with valid blocks.

import { blockProblem, MIN_WORK_BITS } from './bitcoinHeader.js';

// Both serve Esplora block pages, newest first: mempool.space 15 blocks, blockstream.info 10.
export const TIP_SOURCES = [
  { api: 'https://mempool.space/api', blocks: '/v1/blocks' },
  { api: 'https://blockstream.info/api', blocks: '/blocks' },
];
export const TIP_POLL_MS = 60 * 1000;
export const TIP_TIMEOUT_MS = 10 * 1000;
export const WINDOW_BLOCKS = 144;

const HASH_RE = /^[0-9a-f]{64}$/;

export function isRound(round) {
  return Boolean(round) && Number.isSafeInteger(round.height) && round.height >= 0 &&
    typeof round.hash === 'string' && HASH_RE.test(round.hash);
}

export function createTipTracker({ fetchImpl = fetch, sources = TIP_SOURCES, pollMs = TIP_POLL_MS, windowBlocks = WINDOW_BLOCKS, minWorkBits = MIN_WORK_BITS, log } = {}) {
  // height → { hash, prev } of the last `windowBlocks` blocks, each checked and linked.
  let known = new Map();
  let tip = null;
  let timer = null;
  let pending = null;

  // A page of consecutive blocks from one source, newest first, from `start` (the tip when omitted).
  async function pageFrom({ api, blocks: blocksPath }, start, expectedHash, signal) {
    signal.throwIfAborted();
    const path = start === undefined ? blocksPath : `${blocksPath}/${start}`;
    const res = await fetchImpl(`${api}${path}`, { signal: AbortSignal.any([signal, AbortSignal.timeout(TIP_TIMEOUT_MS)]) });
    if (!res.ok) throw new Error(`${path} answered ${res.status}`);
    const blocks = await res.json();
    signal.throwIfAborted();
    if (!Array.isArray(blocks) || blocks.length === 0) throw new Error('unreadable blocks');
    blocks.forEach((block, index) => {
      const problem = blockProblem(block, { minWorkBits });
      if (problem) throw new Error(`block ${block?.height}: ${problem}`);
      const below = blocks[index + 1];
      if (below && (below.height !== block.height - 1 || below.id !== block.previousblockhash)) {
        throw new Error(`block ${block.height} does not link to the block below`);
      }
    });
    if (start !== undefined && blocks[0].height !== start) {
      throw new Error(`page starts at height ${blocks[0].height} instead of ${start}`);
    }
    if (expectedHash !== undefined && blocks[0].id !== expectedHash) {
      throw new Error(`block ${start} does not link to the block above`);
    }
    return blocks.map(block => ({ height: block.height, hash: block.id, prev: block.previousblockhash }));
  }

  // The page from the first source that answers with valid blocks.
  async function page(start, expectedHash, signal) {
    const failures = [];
    for (const source of sources) {
      try {
        const blocks = await pageFrom(source, start, expectedHash, signal);
        if (failures.length) log?.(`bitcoin blocks from ${source.api} after ${failures.join('; ')}`);
        return blocks;
      } catch (error) {
        if (signal.aborted) throw error;
        failures.push(`${source.api}: ${error?.message ?? error}`);
      }
    }
    throw new Error(failures.join('; '));
  }

  async function refresh(signal) {
    try {
      // Keep public round/accepts on the previous complete snapshot until every page links.
      const newest = await page(undefined, undefined, signal);
      const next = new Map(known);
      for (const block of newest) next.set(block.height, block);
      const nextTip = { height: newest[0].height, hash: newest[0].hash };
      const from = Math.max(0, nextTip.height - windowBlocks + 1);
      for (const height of next.keys()) if (height < from || height > nextTip.height) next.delete(height);
      for (let height = nextTip.height; height >= from; height -= 1) {
        const above = next.get(height + 1);
        if (above && next.has(height) && above.prev !== next.get(height).hash) {
          // A deeper reorganisation invalidates the cached branch below this link.
          for (const stale of next.keys()) if (stale <= height) next.delete(stale);
        }
        if (next.has(height)) continue;
        for (const block of await page(height, above.prev, signal)) {
          if (block.height >= from) next.set(block.height, block);
        }
      }
      signal.throwIfAborted();
      known = next;
      tip = nextTip;
    } catch (error) {
      if (!signal.aborted) log?.(`bitcoin tip unavailable: ${error?.message ?? error}`);
    }
  }

  function poll() {
    if (pending) return pending.promise;
    const current = { controller: new AbortController(), promise: null };
    pending = current;
    current.promise = refresh(current.controller.signal).finally(() => {
      if (pending === current) pending = null;
    });
    return current.promise;
  }

  return {
    poll,
    start() {
      if (timer !== null) return;
      timer = setInterval(poll, pollMs);
      timer.unref?.();
      void poll();
    },
    stop() {
      clearInterval(timer);
      timer = null;
      pending?.controller.abort();
      pending = null;
    },
    round: () => tip,
    // The oldest block height a proof may still name, or null before the first poll.
    windowStart: () => (tip ? Math.max(0, tip.height - windowBlocks + 1) : null),
    accepts(round) {
      return isRound(round) && known.get(round.height)?.hash === round.hash;
    },
  };
}
