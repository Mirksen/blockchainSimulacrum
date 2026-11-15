// @vitest-environment jsdom
import { act, cleanup, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import App from '../App';
import { playRecordSound } from '../lib/sound';

// The real App wiring between an accepted block and the leaderboard refresh after it.
// The ticker hands its rows up through `onBoard`; the identity reports accepted blocks.
const hooks = vi.hoisted(() => ({ onBoard: null, onAccepted: null }));
vi.mock('../hooks/useMinerIdentity', () => ({ useMinerIdentity: ({ onAccepted }) => {
  hooks.onAccepted = onAccepted;
  return { name: 'test-visitor', signingName: 'test-visitor', setName: () => {}, signer: {} };
} }));
// A test session: an in-memory store and a clock only the test moves (lib/workbenchSession.js),
// over synthetic fixture keys instead of BIP39 derivation (covered in wallet.test.js).
const fixtureKeys = vi.hoisted(() => ({ wallet: 0 }));
vi.mock('../lib/wallet', async importOriginal => ({ ...await importOriginal(), deriveWallet: () => {
  const privateKey = new Uint8Array(32);
  privateKey[31] = ++fixtureKeys.wallet % 250 + 1;
  return { privateKey, seedPhrase: 'synthetic wallet fixture' };
} }));
vi.mock('../hooks/useWorkbenchSession', async importOriginal => {
  const actual = await importOriginal();
  const { createTestClock, inlineSearch, memoryStore } = await import('../lib/workbenchSession');
  return { ...actual, useWorkbenchSession: config => {
    const clock = createTestClock();
    return actual.useWorkbenchSession(config, { store: memoryStore(), clock, search: inlineSearch(clock) });
  } };
});
vi.mock('../components/workbench/LeaderboardTicker', () => ({ LeaderboardTicker: ({ onBoard }) => { hooks.onBoard = onBoard; return null; } }));
vi.mock('../lib/sound', () => ({ unlockMiningAudio: vi.fn(async () => true), playMiningSuccessSound: vi.fn(), playRecordSound: vi.fn() }));

const others = [{ name: 'test-top', rank: 1, bestZeros: 9 }, { name: 'test-second', rank: 2, bestZeros: 7 }];
const board = (...rows) => act(() => hooks.onBoard(rows));
const accepted = () => act(() => hooks.onAccepted());
const celebration = () => document.querySelector('.record-celebration');

beforeEach(() => {
  localStorage.clear();
  history.replaceState(null, '', '/');
  vi.mocked(playRecordSound).mockClear();
  render(<App />);
});
afterEach(() => { cleanup(); });

describe('App record celebration', () => {
  it('celebrates the first accepted block that puts the visitor on the board, with the fanfare', () => {
    board(...others);
    accepted();
    board(...others, { name: 'test-visitor', rank: 3, bestZeros: 4 });
    expect(celebration().textContent).toContain('You are on the leaderboard!');
    expect(celebration().textContent).toContain('Rank #3 of all time with 4 leading zeros.');
    expect(playRecordSound).toHaveBeenCalledTimes(1);
  });

  it('celebrates a climb to rank 1 against the board before the block', () => {
    board(...others, { name: 'test-visitor', rank: 3, bestZeros: 6 });
    accepted();
    board({ name: 'test-visitor', rank: 1, bestZeros: 10 }, ...others.map(row => ({ ...row, rank: row.rank + 1 })));
    expect(celebration().textContent).toContain('Rank #1 of all time!');
  });

  it('stays quiet for a regular ticker refresh and for an accepted block without a record', () => {
    board(...others);
    board(...others, { name: 'test-visitor', rank: 3, bestZeros: 4 });
    expect(celebration()).toBeNull();
    accepted();
    board(...others, { name: 'test-visitor', rank: 3, bestZeros: 4 });
    expect(celebration()).toBeNull();
    expect(playRecordSound).not.toHaveBeenCalled();
  });
});
