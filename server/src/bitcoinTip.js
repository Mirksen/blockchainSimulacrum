// The pool's round is a recent Bitcoin block. Its hash goes into every proof, so a
// proof cannot be computed before that block existed. A proof stays valid while its
// block is one of the last WINDOW_BLOCKS (144, about a day): work cannot be stockpiled
// for longer than that. Anyone can look the block up and recompute a proof with one SHA-256.

export const TIP_API = 'https://mempool.space/api';
export const TIP_POLL_MS = 60 * 1000;
export const TIP_TIMEOUT_MS = 10 * 1000;
export const WINDOW_BLOCKS = 144;

const HASH_RE = /^[0-9a-f]{64}$/;

export function isRound(round) {
  return Boolean(round) && Number.isSafeInteger(round.height) && round.height >= 0 &&
    typeof round.hash === 'string' && HASH_RE.test(round.hash);
}

export function createTipTracker({ fetchImpl = fetch, api = TIP_API, pollMs = TIP_POLL_MS, windowBlocks = WINDOW_BLOCKS, log } = {}) {
  // height → hash of the last `windowBlocks` blocks.
  const known = new Map();
  let tip = null;
  let timer = null;

  // A page of up to 15 blocks, newest first, from `start` (the tip when omitted).
  async function page(start) {
    const path = start === undefined ? '/v1/blocks' : `/v1/blocks/${start}`;
    const res = await fetchImpl(`${api}${path}`, { signal: AbortSignal.timeout(TIP_TIMEOUT_MS) });
    if (!res.ok) throw new Error(`${path} answered ${res.status}`);
    const blocks = await res.json();
    if (!Array.isArray(blocks) || blocks.length === 0) throw new Error('unreadable blocks');
    return blocks.map(block => {
      const round = { height: block?.height, hash: block?.id };
      if (!isRound(round)) throw new Error('unreadable blocks');
      return round;
    });
  }

  async function poll() {
    try {
      // The newest page overwrites its heights, which also follows a reorganisation.
      const newest = await page();
      for (const round of newest) known.set(round.height, round.hash);
      const top = newest.reduce((a, b) => (b.height > a.height ? b : a));
      tip = { height: top.height, hash: known.get(top.height) };
      const from = Math.max(0, tip.height - windowBlocks + 1);
      for (const height of [...known.keys()]) if (height < from || height > tip.height) known.delete(height);
      // Fill older gaps of the window, one page at a time.
      for (let height = tip.height; height >= from; height -= 1) {
        if (known.has(height)) continue;
        for (const round of await page(height)) if (round.height >= from) known.set(round.height, round.hash);
      }
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
      return isRound(round) && known.get(round.height) === round.hash;
    },
  };
}
