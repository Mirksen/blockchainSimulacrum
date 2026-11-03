import { useSyncExternalStore } from 'react';

// Explain mode (web/DESIGN.md, "Hints"): on a touch screen there is no hover, so the
// "?" button in the top bar turns this on and a tap then shows a hint instead of acting.
// One module-level flag, shared by the toggle (TopBar) and the bubble (HintLayer).
let on = false;
const listeners = new Set();

export function setHelpMode(next) {
  if (on === !!next) return;
  on = !!next;
  for (const listener of listeners) listener();
}

function subscribe(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useHelpMode() {
  return useSyncExternalStore(subscribe, () => on, () => false);
}
