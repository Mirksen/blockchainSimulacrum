import { useEffect, useState, useSyncExternalStore } from 'react';
import { browserSearch, browserStore, createWorkbenchSession, realClock } from '../lib/workbenchSession';

// React's view of a workbench session (lib/workbenchSession.js): it subscribes, nothing more.

// The session's current snapshot; renders again after every change.
export function useSessionSnapshot(session) {
  return useSyncExternalStore(session.subscribe, session.getSnapshot, session.getSnapshot);
}

// One session for the lifetime of the component, with `storage` (optional, e.g. localStorage)
// keeping the chain across reloads. `store`, `search` and `clock` replace the browser's
// adapters (tests). Returns { session, snapshot }.
export function useWorkbenchSession(config = {}, { storage = null, store = null, search = browserSearch, clock = realClock } = {}) {
  const [session] = useState(() => createWorkbenchSession({ config, store: store ?? browserStore(storage), search, clock }));
  useEffect(() => () => session.dispose(), [session]);
  const snapshot = useSessionSnapshot(session);
  return { session, snapshot };
}
