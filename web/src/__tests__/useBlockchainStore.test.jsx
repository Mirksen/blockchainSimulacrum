// @vitest-environment jsdom
import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useBlockchain } from '../hooks/useBlockchain';
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

describe('useBlockchain with storage', () => {
  it('saves after a change and starts the next visit from the save', () => {
    const storage = memoryStorage();
    const first = renderHook(() => useBlockchain(config, { storage }));
    expect(first.result.current.restored).toBe(false);
    expect(storage.items.has(CHAIN_KEY)).toBe(false);
    act(() => { expect(first.result.current.createWallet('Carol').success).toBe(true); });
    expect(first.result.current.saveState).toBe('saved');
    const keys = first.result.current.participants.map(p => [p.name, p.publicKey]);
    first.unmount();

    const second = renderHook(() => useBlockchain(config, { storage }));
    expect(second.result.current.restored).toBe(true);
    expect(second.result.current.participants.map(p => [p.name, p.publicKey])).toEqual(keys);
  });
  it('Reset starts a fresh chain and replaces the save', () => {
    const storage = memoryStorage();
    const first = renderHook(() => useBlockchain(config, { storage }));
    act(() => { first.result.current.createWallet('Carol'); });
    first.unmount();
    const second = renderHook(() => useBlockchain(config, { storage }));
    act(() => { second.result.current.resetBlockchain(); });
    expect(second.result.current.restored).toBe(false);
    expect(second.result.current.participants.map(p => p.name)).toEqual(['Miner One', 'Wallet Two']);
    expect(JSON.parse(storage.items.get(CHAIN_KEY)).participants.map(p => p.name)).toEqual(['Miner One', 'Wallet Two']);
  });
  it('keeps working without storage and says so', () => {
    const { result } = renderHook(() => useBlockchain(config));
    act(() => { result.current.createWallet('Carol'); });
    expect(result.current.saveState).toBe('unavailable');
    expect(result.current.restored).toBe(false);
  });
});
