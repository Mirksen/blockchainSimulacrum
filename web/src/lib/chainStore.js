// The simulator chain saved in this browser, so a reload continues where the learner was.
// The chain module owns the saved form (Blockchain#toSaved, Blockchain.fromSaved: what is
// saved, how it is checked on load); this module owns where it lives: the localStorage key,
// the format version, the size limit and what happens when storage fails. Reset clears it.
import { Blockchain } from './blockchain';

export const CHAIN_KEY = 'proofofwork-chain';
export const CHAIN_VERSION = 1;
// localStorage holds about 5 MB per site; a chain beyond this is no longer saved.
export const MAX_SAVED_CHARS = 2_000_000;

/** The saved form of `chain`, a plain JSON object. */
export function serializeChain(chain) {
  return { version: CHAIN_VERSION, ...chain.toSaved() };
}

/** A Blockchain rebuilt from `saved`, or an Error naming why it cannot be (Blockchain.fromSaved). */
export function deserializeChain(saved) {
  if (!saved || saved.version !== CHAIN_VERSION) throw new Error('Saved chain refused: unknown version');
  return Blockchain.fromSaved(saved);
}

/** Saves `chain`; returns 'saved', 'too-large' (and removes the old save) or 'unavailable'. */
export function saveChain(storage, chain) {
  try {
    if (!storage) return 'unavailable';
    const text = JSON.stringify(serializeChain(chain));
    if (text.length > MAX_SAVED_CHARS) {
      storage.removeItem(CHAIN_KEY);
      return 'too-large';
    }
    storage.setItem(CHAIN_KEY, text);
    return 'saved';
  } catch {
    return 'unavailable';
  }
}

/** The saved chain, or null when there is none or it cannot be used (then it is removed). */
export function loadChain(storage) {
  let text = null;
  try { text = storage?.getItem(CHAIN_KEY) ?? null; } catch { return null; }
  if (!text) return null;
  try {
    return deserializeChain(JSON.parse(text));
  } catch {
    try { storage.removeItem(CHAIN_KEY); } catch { /* Storage blocked: nothing to clean up. */ }
    return null;
  }
}

export function clearChain(storage) {
  try { storage?.removeItem(CHAIN_KEY); } catch { /* Storage blocked: nothing saved. */ }
}
