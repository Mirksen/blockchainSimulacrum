import CryptoJS from 'crypto-js/core.js';
import 'crypto-js/sha256.js';
import { meetsTarget, zerosOfTarget } from '../../../shared/bitcoin-block.mjs';
import { MAX_NONCE } from './blockHeader.js';

// One proof-of-work search for every nonce race in the app, over one of two inputs:
// an 80-byte Bitcoin header (simulator and labs) or the pool's text
// `prefix + nonce + suffix`. Either way the constant start is absorbed into a SHA-256
// state once (the midstate) and each attempt only hashes the short tail.

const RECENT_LIMIT = 20;
const nextTick = () => new Promise(resolve => setTimeout(resolve, 0));

// Returns nonce => hex digest, equal to SHA256(prefix + nonce + suffix).
export function createHasher(prefix, suffix = '') {
  const midstate = CryptoJS.algo.SHA256.create().update(prefix);
  // clone() keeps the shared midstate untouched by each attempt.
  return nonce => midstate.clone().update(String(nonce) + suffix).finalize().toString();
}

const swap32 = word => ((word & 0xff) << 24 | (word & 0xff00) << 8 | (word >>> 8) & 0xff00 | word >>> 24) >>> 0;
const HEX_BYTES = Array.from({ length: 256 }, (_, byte) => byte.toString(16).padStart(2, '0'));

// Display order of a digest given as big-endian words: its bytes, last to first.
function displayOrder(words) {
  let hash = '';
  for (let i = 7; i >= 0; i--) {
    const word = words[i];
    hash += HEX_BYTES[word & 0xff] + HEX_BYTES[word >>> 8 & 0xff] + HEX_BYTES[word >>> 16 & 0xff] + HEX_BYTES[word >>> 24];
  }
  return hash;
}

// Returns nonce => display-order hash of the header whose first 76 bytes are the hex
// `header`. The first 64 bytes form one SHA-256 block, so each attempt costs the block
// with the nonce plus the second SHA-256: two compressions. Reusing one hasher for the
// second round and a byte table for the hex keeps this as fast as the text search.
export function createHeaderHasher(header) {
  if (!/^[0-9a-f]{152}$/.test(header)) throw new RangeError('A header search needs the first 76 header bytes.');
  const { words } = CryptoJS.enc.Hex.parse(header);
  const midstate = CryptoJS.algo.SHA256.create().update(CryptoJS.lib.WordArray.create(words.slice(0, 16), 64));
  const second = CryptoJS.algo.SHA256.create();
  const tail = CryptoJS.lib.WordArray.create([...words.slice(16), 0], 16);
  return nonce => {
    tail.words[3] = swap32(nonce);
    const once = midstate.clone().update(tail).finalize();
    second.reset();
    return displayOrder(second.update(once).finalize().words);
  };
}

export function hashAt(entrant, nonce) {
  if (entrant.header !== undefined) return createHeaderHasher(entrant.header)(nonce);
  return createHasher(entrant.prefix, entrant.suffix ?? '')(nonce);
}

// `bits` is Bitcoin's rule (hash <= target); `target` is a text search's leading zeros.
// Only a hash with the target's leading zeros can meet it, so the exact comparison runs
// about once per match rather than on every attempt.
function matcher(target, bits) {
  if (bits !== undefined) {
    const zeros = '0'.repeat(zerosOfTarget(bits));
    return hash => hash.startsWith(zeros) && meetsTarget(hash, bits);
  }
  if (typeof target !== 'string' || !/^0*$/.test(target)) throw new RangeError('The target must be leading zeros.');
  return hash => hash.startsWith(target);
}

const leadingZeros = hash => {
  let count = 0;
  while (count < hash.length && hash[count] === '0') count++;
  return count;
};

function snapshot(states, includePeaks = false) {
  return Object.fromEntries(states.map(state => [state.id,
    { nonce: state.lastNonce, hash: state.hash, attempts: state.attempts, zeros: leadingZeros(state.hash), ...(includePeaks ? { peakZeros: state.peakZeros } : {}) }]));
}

// The existing simulator keeps its consecutive round-robin schedule. The fork lab
// opts into a seeded per-attempt lottery: percentage-sized consecutive batches
// strongly favor the first entrant when the target is as easy as one hex zero.
// This PRNG schedules nominal simulated hash power, never keys or proof validity.
function allocationRandom(seed) {
  if (!Number.isInteger(seed) || seed < 0 || seed > 0xffffffff) throw new RangeError('Allocation seed must be an unsigned 32-bit integer.');
  let value = seed;
  return () => {
    value = (value + 0x6d2b79f5) >>> 0;
    let mixed = Math.imul(value ^ (value >>> 15), value | 1);
    mixed ^= mixed + Math.imul(mixed ^ (mixed >>> 7), mixed | 61);
    return ((mixed ^ (mixed >>> 14)) >>> 0) / 0x100000000;
  };
}

export async function search({ entrants, target, bits, limit = Infinity, signal, onProgress = () => {},
  batch = 100, yieldControl = nextTick, scheduling = 'round-robin', seed = 0 }) {
  if (!Array.isArray(entrants) || !entrants.length) throw new RangeError('A search needs at least one entrant.');
  const matches = matcher(target, bits);
  if (!['round-robin', 'weighted-random'].includes(scheduling)) throw new RangeError('Unknown search scheduling.');
  const random = scheduling === 'weighted-random' ? allocationRandom(seed) : null;
  const states = entrants.map(({ id, weight = 1, header, prefix, suffix = '', startNonce = 0 }) => {
    const maxNonce = header === undefined ? Number.MAX_SAFE_INTEGER : MAX_NONCE;
    if (!Number.isSafeInteger(weight) || weight < 1) throw new RangeError('Weight must be a positive whole number.');
    if (!Number.isSafeInteger(startNonce) || startNonce < 0 || startNonce > maxNonce) throw new RangeError('Start nonce is out of range.');
    return { id, weight, hasher: header === undefined ? createHasher(String(prefix), String(suffix)) : createHeaderHasher(header),
      maxNonce, nonce: startNonce, lastNonce: null, hash: '', attempts: 0, peakZeros: 0, done: false };
  });
  let attempts = 0;
  let recent = [];
  let active = states.length;
  let cursor = 0;
  let remaining = states[0].weight;
  const finish = (status, winner = null) => ({ status, winner: winner?.id ?? null,
    nonce: winner ? winner.lastNonce : null, hash: winner ? winner.hash : null, attempts, entrants: snapshot(states) });

  await yieldControl(); // Paint Stop before even a first-attempt match.
  while (active) {
    if (signal?.aborted) return finish('stopped');
    if (attempts >= limit) return finish('exhausted');
    let state;
    if (random) {
      const eligible = states.filter(entrant => !entrant.done);
      let draw = random() * eligible.reduce((sum, entrant) => sum + entrant.weight, 0);
      state = eligible.at(-1);
      for (const entrant of eligible) {
        draw -= entrant.weight;
        if (draw < 0) { state = entrant; break; }
      }
    } else {
      while (states[cursor].done || remaining === 0) {
        cursor = (cursor + 1) % states.length;
        remaining = states[cursor].weight;
      }
      state = states[cursor];
      remaining--;
    }
    const nonce = state.nonce;
    state.hash = state.hasher(nonce);
    state.peakZeros = Math.max(state.peakZeros, leadingZeros(state.hash));
    state.lastNonce = nonce;
    state.attempts++;
    attempts++;
    recent.push({ id: state.id, nonce, hash: state.hash });
    if (recent.length > RECENT_LIMIT) recent.shift();
    if (matches(state.hash)) return finish('found', state);
    if (nonce === state.maxNonce) { state.done = true; active--; } else state.nonce = nonce + 1;
    if (attempts % batch === 0) {
      // A throttled adapter returns false so a rare peak survives until the
      // next delivered progress event rather than vanishing between frames.
      if (onProgress({ attempts, entrants: snapshot(states, true), recent }) !== false) {
        for (const entrant of states) entrant.peakZeros = 0;
      }
      recent = [];
      await yieldControl();
    }
  }
  return signal?.aborted ? finish('stopped') : finish('exhausted');
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
    const { entrants, target, bits, limit, batch, scheduling, seed } = options;
    worker.postMessage({ entrants, target, bits, limit, batch, ...(scheduling === undefined ? {} : { scheduling, seed }) });
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
