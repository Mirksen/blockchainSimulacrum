// The pool's round is the newest Bitcoin block. Its hash goes into every proof, so a
// proof cannot be computed before that block existed; accepting only the current and
// the previous block keeps work that was stockpiled offline out of the leaderboard.
// Anyone can look the block up and recompute a proof with one SHA-256.

export const TIP_API = 'https://mempool.space/api';
export const TIP_POLL_MS = 60 * 1000;
export const TIP_TIMEOUT_MS = 10 * 1000;

const HASH_RE = /^[0-9a-f]{64}$/;

export function isRound(round) {
  return Boolean(round) && Number.isSafeInteger(round.height) && round.height >= 0 &&
    typeof round.hash === 'string' && HASH_RE.test(round.hash);
}

export function createTipTracker({ fetchImpl = fetch, api = TIP_API, pollMs = TIP_POLL_MS, log } = {}) {
  let current = null;
  let previous = null;
  let timer = null;

  async function read(path) {
    const res = await fetchImpl(`${api}${path}`, { signal: AbortSignal.timeout(TIP_TIMEOUT_MS) });
    if (!res.ok) throw new Error(`${path} answered ${res.status}`);
    return (await res.text()).trim();
  }

  // Height and hash come from two requests; a block found in between shows as a
  // mismatch on the next poll and is corrected then.
  async function poll() {
    try {
      const height = Number(await read('/blocks/tip/height'));
      const hash = await read('/blocks/tip/hash');
      const round = { height, hash };
      if (!isRound(round)) throw new Error('unreadable tip');
      if (!current || height > current.height) {
        previous = current;
        current = round;
      } else if (height === current.height && hash !== current.hash) {
        current = round; // A reorganisation replaced the newest block.
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
    round: () => current,
    accepts(round) {
      return isRound(round) && [current, previous].some(known => known && known.height === round.height && known.hash === round.hash);
    },
  };
}
