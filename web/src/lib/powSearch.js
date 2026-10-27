import CryptoJS from 'crypto-js/core.js';
import 'crypto-js/sha256.js';

// One proof-of-work search for every nonce race in the app. The preimage of an
// attempt is always `prefix + nonce + suffix`, so the constant prefix is
// absorbed into a SHA-256 state once (the midstate) and each attempt only
// hashes the short tail.

const RECENT_LIMIT = 20;
const nextTick = () => new Promise(resolve => setTimeout(resolve, 0));

// Returns nonce => hex digest, equal to SHA256(prefix + nonce + suffix).
export function createHasher(prefix, suffix = '') {
  const midstate = CryptoJS.algo.SHA256.create().update(prefix);
  // clone() keeps the shared midstate untouched by each attempt.
  return nonce => midstate.clone().update(String(nonce) + suffix).finalize().toString();
}

export function hashAt(entrant, nonce) {
  return createHasher(entrant.prefix, entrant.suffix ?? '')(nonce);
}

const leadingZeros = hash => {
  let count = 0;
  while (count < hash.length && hash[count] === '0') count++;
  return count;
};

function snapshot(states) {
  return Object.fromEntries(states.map(state => [state.id,
    { nonce: state.lastNonce, hash: state.hash, attempts: state.attempts, zeros: leadingZeros(state.hash) }]));
}

// Round-robin race: each entrant tries `weight` consecutive nonces per round.
export async function search({ entrants, target, limit = Infinity, signal, onProgress = () => {},
  batch = 100, yieldControl = nextTick }) {
  if (!Array.isArray(entrants) || !entrants.length) throw new RangeError('A search needs at least one entrant.');
  if (typeof target !== 'string' || !/^0*$/.test(target)) throw new RangeError('The target must be leading zeros.');
  const states = entrants.map(({ id, weight = 1, prefix, suffix = '', startNonce = 0 }) => {
    if (!Number.isSafeInteger(weight) || weight < 1) throw new RangeError('Weight must be a positive whole number.');
    if (!Number.isSafeInteger(startNonce) || startNonce < 0) throw new RangeError('Start nonce must be a safe whole number.');
    return { id, weight, hasher: createHasher(String(prefix), String(suffix)), nonce: startNonce,
      lastNonce: null, hash: '', attempts: 0, done: false };
  });
  let attempts = 0;
  let recent = [];
  let active = states.length;
  const finish = (status, winner = null) => ({ status, winner: winner?.id ?? null,
    nonce: winner ? winner.lastNonce : null, hash: winner ? winner.hash : null, attempts, entrants: snapshot(states) });

  // Let the caller paint its Stop control, even when the first attempt succeeds.
  await yieldControl();
  for (;;) {
    for (const state of states) {
      for (let tried = 0; tried < state.weight && !state.done; tried++) {
        if (signal?.aborted) return finish('stopped');
        if (attempts >= limit) return finish('exhausted');
        const nonce = state.nonce;
        state.hash = state.hasher(nonce);
        state.lastNonce = nonce;
        state.attempts++;
        attempts++;
        recent.push({ id: state.id, nonce, hash: state.hash });
        if (recent.length > RECENT_LIMIT) recent.shift();
        if (state.hash.startsWith(target)) return finish('found', state);
        // Nonces stay exact: an entrant stops instead of rounding past the safe range.
        if (nonce === Number.MAX_SAFE_INTEGER) { state.done = true; active--; } else state.nonce = nonce + 1;
        if (attempts % batch === 0) {
          onProgress({ attempts, entrants: snapshot(states), recent });
          recent = [];
          await yieldControl();
        }
      }
    }
    if (!active) return signal?.aborted ? finish('stopped') : finish('exhausted');
  }
}

const inTestEnvironment = () => import.meta.env?.MODE === 'test';

function searchInWorker({ signal, onProgress = () => {}, ...options }) {
  return new Promise((resolve, reject) => {
    const worker = new Worker(new URL('./powSearch.worker.js', import.meta.url), { type: 'module' });
    let settled = false;
    let latest = { attempts: 0, entrants: {} };
    const settle = (callback, value) => {
      if (settled) return;
      settled = true;
      signal?.removeEventListener('abort', stop);
      worker.terminate();
      callback(value);
    };
    // The worker owns no shared state, so terminating it is a complete stop.
    const stop = () => settle(resolve, { status: 'stopped', winner: null, nonce: null, hash: null,
      attempts: latest.attempts, entrants: latest.entrants });
    worker.onmessage = ({ data }) => {
      if (settled) return;
      if (data.type === 'progress') {
        latest = data.progress;
        onProgress(data.progress);
      } else if (data.type === 'result') settle(resolve, data.result);
      else if (data.type === 'error') settle(reject, new Error(data.message));
    };
    worker.onerror = event => { event.preventDefault?.(); settle(reject, new Error(event.message || 'Search worker failed.')); };
    if (signal?.aborted) return stop();
    signal?.addEventListener('abort', stop, { once: true });
    const { entrants, target, limit, batch } = options;
    worker.postMessage({ entrants, target, limit, batch });
  });
}

// Same options, progress and result contract in both adapters. A custom
// yieldControl only applies inline; the worker paces itself by wall time.
export function runSearch(options, { mode = 'auto' } = {}) {
  const useWorker = mode === 'worker' ||
    (mode === 'auto' && typeof Worker !== 'undefined' && !inTestEnvironment());
  if (mode !== 'auto' && mode !== 'inline' && mode !== 'worker') throw new RangeError(`Unknown search mode: ${mode}`);
  return useWorker ? searchInWorker(options) : search(options);
}
