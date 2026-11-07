import { useSyncExternalStore } from 'react';

const KEY = 'proofofwork-mining-shortcut';
const listeners = new Set();
let fallback = true;
let volatile = null;
const read = () => {
  if (volatile !== null) return volatile;
  try { return globalThis.localStorage ? localStorage.getItem(KEY) !== '0' : fallback; }
  catch { return fallback; }
};
const subscribe = notify => {
  listeners.add(notify);
  globalThis.addEventListener?.('storage', notify);
  return () => { listeners.delete(notify); globalThis.removeEventListener?.('storage', notify); };
};
export function setMiningShortcut(enabled) {
  fallback = Boolean(enabled);
  try { globalThis.localStorage?.setItem(KEY, enabled ? '1' : '0'); volatile = null; }
  catch { volatile = fallback; }
  for (const notify of listeners) notify();
}
export const useMiningShortcut = () => useSyncExternalStore(subscribe, read, () => true);
