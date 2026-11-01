// @vitest-environment jsdom
import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useBlockchain } from '../hooks/useBlockchain';
import { merkleRoot, merkleBranch, reverseHex } from '../../../shared/bitcoin-block.mjs';
import { sha256d } from '../lib/blockHeader';
import { GENESIS, proofOfBlock, proofPrefix, signatureOf, verifyRow } from '../lib/poolProof';

const ROUND = { height: 900001, hash: `0000${'ab'.repeat(30)}` };
const NAME = 'test-signer';
const SIGNATURE = signatureOf({ name: NAME, round: ROUND, prefix: proofPrefix(GENESIS.hash, ROUND, NAME) });
const config = { participants: ['Miner1', 'Miner2', 'Wallet3'], miners: ['Miner1', 'Miner2'], miningDifficulty: 1, halvingEvent: 210000 };

beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(new Date('2026-11-01T12:00:00Z')); });
afterEach(() => { cleanup(); vi.useRealTimers(); });

async function run(start) {
  let outcome;
  await act(async () => { const pending = start(); await vi.runAllTimersAsync(); outcome = await pending; });
  return outcome;
}
function signed(signature = SIGNATURE) {
  const hook = renderHook(() => useBlockchain(config));
  const signer = { current: vi.fn(() => signature), submit: vi.fn() };
  act(() => hook.result.current.setSigner(signer));
  return { hook, signer };
}

describe('signing blocks with the visitor\'s name', () => {
  it('signs every block of a race, whichever miner wins, and hands each one over', async () => {
    const { hook, signer } = signed();
    const winners = new Set();
    for (let height = 1; height <= 12; height++) {
      const outcome = await run(() => hook.result.current.mineBlock());
      expect(outcome.success).toBe(true);
      winners.add(outcome.winner);
      const view = hook.result.current.describeTx(outcome.block.transactions[0]);
      expect(view.memo).toBe(NAME);
      expect(view.outputs.at(-1)).toMatchObject({ kind: 'commitment', value: 0, spent: false, memo: null });
      expect(signer.submit).toHaveBeenCalledTimes(height);
      expect(signer.submit).toHaveBeenLastCalledWith(outcome.block, SIGNATURE, height);
    }
    expect([...winners].sort()).toEqual(['Miner1', 'Miner2']);
    expect(hook.result.current.chainValid).toBe(true);
  });

  it('gives a mined block a proof the leaderboard rule accepts', async () => {
    const { hook, signer } = signed();
    await run(() => hook.result.current.mineBlock());
    const [block] = signer.submit.mock.calls[0];
    expect(verifyRow({ name: NAME, round: ROUND, bestHash: block.hash, ...proofOfBlock(block) })).toMatchObject({ signed: true, matches: true });
  });

  it('counts both blocks of the demo', async () => {
    const { hook, signer } = signed();
    await run(() => hook.result.current.setupInitialDistribution());
    expect(signer.submit.mock.calls.map(call => call[2])).toEqual([1, 2]);
    expect(hook.result.current.chainValid).toBe(true);
  });

  it('leaves blocks unsigned while the pool offers no round, and the simulator keeps working', async () => {
    const { hook, signer } = signed(null);
    const outcome = await run(() => hook.result.current.mineBlock());
    expect(outcome.success).toBe(true);
    expect(hook.result.current.describeTx(outcome.block.transactions[0]).memo).toBe('Mining Reward');
    expect(outcome.block.transactions[0].outputs).toHaveLength(1);
    expect(signer.submit).not.toHaveBeenCalled();
  });

  it('never sends a re-mined block again', async () => {
    const { hook, signer } = signed();
    await run(() => hook.result.current.mineBlock());
    await run(() => hook.result.current.remineBlock(1));
    expect(signer.submit).toHaveBeenCalledTimes(1);
  });

  it('mines as before without a signer', async () => {
    const hook = renderHook(() => useBlockchain(config));
    const outcome = await run(() => hook.result.current.mineBlock());
    expect(outcome.block.transactions[0].outputs).toHaveLength(1);
  });
});

describe('merkleBranch', () => {
  it.each([1, 2, 3, 4, 5, 6, 7, 8])('leads from transaction 0 to the root of %i transactions', count => {
    const txids = Array.from({ length: count }, (_, index) => sha256d(index.toString(16).padStart(2, '0')));
    const root = merkleBranch(txids, sha256d).reduce((node, sibling) => sha256d(node + sibling), reverseHex(txids[0]));
    expect(reverseHex(root)).toBe(merkleRoot(txids, sha256d));
  });
});
