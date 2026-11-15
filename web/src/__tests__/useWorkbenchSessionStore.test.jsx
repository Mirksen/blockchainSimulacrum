// @vitest-environment jsdom
import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useWorkbenchSession } from '../hooks/useWorkbenchSession';
import { CHAIN_KEY } from '../lib/chainStore';
vi.mock('../lib/telemetry', async (importOriginal) => {
  const actual = await importOriginal();
  return { ...actual, telemetry: { track: vi.fn(), reportError: vi.fn() } };
});

const config = { participants: ['Miner One', 'Wallet Two'], miners: ['Miner One'], miningDifficulty: 1, halvingEvent: 2 };
function memoryStorage() {
  const items = new Map();
  return { items, getItem: key => items.get(key) ?? null, setItem: (key, value) => items.set(key, String(value)), removeItem: key => items.delete(key) };
}
afterEach(cleanup);

describe('useWorkbenchSession with storage', () => {
  it('saves after a change and starts the next visit from the save', () => {
    const storage = memoryStorage();
    const first = renderHook(() => useWorkbenchSession(config, { storage }));
    expect(first.result.current.snapshot.restored).toBe(false);
    expect(storage.items.has(CHAIN_KEY)).toBe(false);
    act(() => { expect(first.result.current.session.actions.createWallet('Carol').ok).toBe(true); });
    expect(first.result.current.snapshot.saveState).toBe('saved');
    const keys = first.result.current.snapshot.participants.map(p => [p.name, p.publicKey]);
    first.unmount();

    const second = renderHook(() => useWorkbenchSession(config, { storage }));
    expect(second.result.current.snapshot.restored).toBe(true);
    expect(second.result.current.snapshot.participants.map(p => [p.name, p.publicKey])).toEqual(keys);
  });
  it('Reset starts a fresh chain and replaces the save', () => {
    const storage = memoryStorage();
    const first = renderHook(() => useWorkbenchSession(config, { storage }));
    act(() => { first.result.current.session.actions.createWallet('Carol'); });
    first.unmount();
    const second = renderHook(() => useWorkbenchSession(config, { storage }));
    act(() => { second.result.current.session.actions.reset(); });
    expect(second.result.current.snapshot.restored).toBe(false);
    expect(second.result.current.snapshot.participants.map(p => p.name)).toEqual(['Miner One', 'Wallet Two']);
    expect(JSON.parse(storage.items.get(CHAIN_KEY)).participants.map(p => p.name)).toEqual(['Miner One', 'Wallet Two']);
  });
  it('keeps working without storage and says so', () => {
    const { result } = renderHook(() => useWorkbenchSession(config));
    act(() => { result.current.session.actions.createWallet('Carol'); });
    expect(result.current.snapshot.saveState).toBe('unavailable');
    expect(result.current.snapshot.restored).toBe(false);
  });
});
