// @vitest-environment jsdom
import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NAME_SETTLE_MS, OFFER_MAX_AGE_MS, OFFLINE_RETRY_MS, useMinerIdentity } from '../hooks/useMinerIdentity';
import { getChallenge, submitProof } from '../lib/poolApi';
import { createBlockchain } from '../lib/blockchain';
import { GENESIS, proofPrefix, signatureOf } from '../lib/poolProof';
import { isGeneratedName } from '../../../shared/miner-names.mjs';

vi.mock('../lib/poolApi', async importOriginal => ({ ...(await importOriginal()), getChallenge: vi.fn(), submitProof: vi.fn() }));

const ROUND = { height: 900001, hash: `0000${'ab'.repeat(30)}` };
const offerFor = name => ({ name, round: ROUND, windowStart: ROUND.height - 143, minZeros: 1, genesisHash: GENESIS.hash,
  prefix: proofPrefix(GENESIS.hash, ROUND, name) });
const httpError = (status, code) => Object.assign(new Error(`Synthetic HTTP ${status}.`), { status, code });
const settle = () => act(() => vi.advanceTimersByTimeAsync(NAME_SETTLE_MS));
const typed = async (hook, name) => {
  act(() => hook.result.current.setName(name));
  await settle();
};
// A real block of the simulator, signed by `signature`.
function minedBlock(signature) {
  const chain = createBlockchain({ miningDifficulty: 1 });
  const candidate = chain.prepareCandidate(chain.getActiveMiners()[0], { signature });
  return { block: { header: () => ({ version: 1, previousHash: candidate.previousHash, merkleRoot: candidate.txRoot, time: candidate.time,
    bits: candidate.bits, nonce: 0 }), transactions: candidate.transactions, hash: `000f${'1'.repeat(60)}` } };
}

beforeEach(() => {
  vi.useFakeTimers();
  localStorage.clear();
  vi.mocked(getChallenge).mockImplementation(async name => offerFor(name));
  vi.mocked(submitProof).mockResolvedValue({ accepted: true });
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.mocked(getChallenge).mockReset();
  vi.mocked(submitProof).mockReset();
});

describe('useMinerIdentity', () => {
  it('starts every visit with a generated name, keeps it and asks the pool at once', async () => {
    const first = renderHook(() => useMinerIdentity());
    const { name, signingName } = first.result.current;
    expect(isGeneratedName(name)).toBe(true);
    expect(signingName).toBe(name);
    expect(first.result.current).toMatchObject({ generated: true, fallback: name });
    await act(() => vi.advanceTimersByTimeAsync(0));
    expect(getChallenge).toHaveBeenCalledWith(name, expect.anything());
    expect(first.result.current.signer.current()).toEqual(signatureOf(offerFor(name)));
    first.unmount();
    expect(renderHook(() => useMinerIdentity()).result.current.name).toBe(name);
  });

  it('asks the pool once when the typing ends and signs from then on', async () => {
    const hook = renderHook(() => useMinerIdentity());
    await act(() => vi.advanceTimersByTimeAsync(0));
    vi.mocked(getChallenge).mockClear();
    for (const name of ['Mir', 'Mirk', 'Mirko']) {
      act(() => hook.result.current.setName(name));
      await act(() => vi.advanceTimersByTimeAsync(NAME_SETTLE_MS - 1));
    }
    expect(hook.result.current.pool).toBe('connecting');
    expect(getChallenge).not.toHaveBeenCalled();
    await act(() => vi.advanceTimersByTimeAsync(1));
    expect(getChallenge).toHaveBeenCalledTimes(1);
    expect(getChallenge).toHaveBeenCalledWith('Mirko', expect.anything());
    expect(hook.result.current).toMatchObject({ pool: 'ready', generated: false });
    expect(hook.result.current.signer.current()).toEqual(signatureOf(offerFor('Mirko')));
    expect(localStorage.getItem('proofofwork-pool-name')).toBe('Mirko');
  });

  it('keeps signing as the generated name while the field is empty', async () => {
    const hook = renderHook(() => useMinerIdentity());
    const { fallback } = hook.result.current;
    await typed(hook, 'Mirko');
    await typed(hook, '');
    expect(hook.result.current).toMatchObject({ name: '', signingName: fallback, generated: true, valid: true, pool: 'ready' });
    expect(hook.result.current.signer.current().name).toBe(fallback);
  });

  it('starts with a remembered name, and survives blocked storage', async () => {
    localStorage.setItem('proofofwork-pool-name', 'stored-miner');
    const first = renderHook(() => useMinerIdentity());
    expect(first.result.current).toMatchObject({ name: 'stored-miner', generated: false });
    expect(isGeneratedName(first.result.current.fallback)).toBe(true);
    first.unmount();
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('blocked'); });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('blocked'); });
    const hook = renderHook(() => useMinerIdentity());
    expect(isGeneratedName(hook.result.current.signingName)).toBe(true);
    await typed(hook, 'Mirko');
    expect(hook.result.current.pool).toBe('ready');
  });

  it('never asks the pool about an invalid name and never signs with it', async () => {
    localStorage.setItem('proofofwork-pool-name', 'stored-miner');
    const hook = renderHook(() => useMinerIdentity());
    await settle();
    vi.mocked(getChallenge).mockClear();
    await typed(hook, 'no');
    expect(hook.result.current).toMatchObject({ valid: false, pool: 'idle' });
    expect(hook.result.current.signer.current()).toBeNull();
    expect(getChallenge).not.toHaveBeenCalled();
    expect(localStorage.getItem('proofofwork-pool-name')).toBe('stored-miner');
  });

  it('replaces a refused generated name by itself', async () => {
    vi.mocked(getChallenge).mockRejectedValueOnce(httpError(400, 'name-unavailable'));
    const hook = renderHook(() => useMinerIdentity());
    const { name } = hook.result.current;
    await settle();
    expect(hook.result.current.name).not.toBe(name);
    expect(isGeneratedName(hook.result.current.name)).toBe(true);
    await settle();
    expect(hook.result.current).toMatchObject({ pool: 'ready', fallback: hook.result.current.name });
  });

  it('leaves blocks unsigned for a refused name and asks again for a new one', async () => {
    const hook = renderHook(() => useMinerIdentity());
    await settle();
    vi.mocked(getChallenge).mockRejectedValueOnce(httpError(400, 'name-unavailable'));
    await typed(hook, 'refused-name');
    expect(hook.result.current.pool).toBe('refused');
    expect(hook.result.current.signer.current()).toBeNull();
    await typed(hook, 'other-name');
    expect(hook.result.current.pool).toBe('ready');
  });

  it('asks an unreachable pool again beside a later block, without waiting for it', async () => {
    const hook = renderHook(() => useMinerIdentity());
    await settle();
    vi.mocked(getChallenge).mockClear();
    vi.mocked(getChallenge).mockRejectedValueOnce(httpError(503));
    await typed(hook, 'Mirko');
    expect(hook.result.current.pool).toBe('offline');
    expect(hook.result.current.signer.current()).toBeNull();
    expect(getChallenge).toHaveBeenCalledTimes(1);
    await act(() => vi.advanceTimersByTimeAsync(OFFLINE_RETRY_MS + 1));
    let signature;
    await act(async () => { signature = hook.result.current.signer.current(); });
    expect(signature).toBeNull();
    expect(getChallenge).toHaveBeenCalledTimes(2);
    expect(hook.result.current.pool).toBe('ready');
    expect(hook.result.current.signer.current()).not.toBeNull();
  });

  it('renews an old round beside the next block and keeps signing meanwhile', async () => {
    const hook = renderHook(() => useMinerIdentity());
    await settle();
    await typed(hook, 'Mirko');
    vi.mocked(getChallenge).mockClear();
    await act(() => vi.advanceTimersByTimeAsync(OFFER_MAX_AGE_MS + 1));
    let signature;
    await act(async () => { signature = hook.result.current.signer.current(); });
    expect(signature).not.toBeNull();
    expect(getChallenge).toHaveBeenCalledTimes(1);
  });

  it('sends a mined block, reports it and tells the app to refresh the board', async () => {
    const onAccepted = vi.fn();
    const hook = renderHook(() => useMinerIdentity({ onAccepted }));
    await typed(hook, 'Mirko');
    const signature = hook.result.current.signer.current();
    const { block } = minedBlock(signature);
    await act(() => hook.result.current.signer.submit(block, signature, 7));
    const [sentFor, proof] = vi.mocked(submitProof).mock.calls[0];
    expect(sentFor).toBe(signature);
    expect(proof.coinbase).toContain(signature.commitment);
    expect(proof.branch).toEqual([]);
    expect(hook.result.current.entry).toEqual({ height: 7, zeros: 3, state: 'accepted' });
    expect(onAccepted).toHaveBeenCalledTimes(1);
  });

  it('reports a refused block, drops a finished round and forgets the entry with the name', async () => {
    vi.mocked(submitProof).mockRejectedValueOnce(httpError(410));
    const onAccepted = vi.fn();
    const hook = renderHook(() => useMinerIdentity({ onAccepted }));
    await typed(hook, 'Mirko');
    const signature = hook.result.current.signer.current();
    await act(() => hook.result.current.signer.submit(minedBlock(signature).block, signature, 7));
    expect(hook.result.current.entry).toMatchObject({ height: 7, state: 'failed', message: 'Synthetic HTTP 410.' });
    expect(onAccepted).not.toHaveBeenCalled();
    let next;
    await act(async () => { next = hook.result.current.signer.current(); });
    expect(next).toBeNull();
    await typed(hook, 'other-name');
    expect(hook.result.current.entry).toBeNull();
  });
});
