import { describe, expect, it } from 'vitest';
import { BLOCK_WORK, ROUND_LIMIT, createForkExperiment, inspectFork, mineForkRound } from '../lib/forkLab';
import { blockTrial, inspectChain } from '../lib/chainLab';

const noWait = async () => {};
const round = (state, power, options = {}) => mineForkRound(state, power,
  { seed: state.rounds + 1, startNonce: state.rounds * 100, yieldControl: noWait, ...options });
async function extend(state, power, count) {
  for (let i = 0; i < count; i++) state = (await round(state, power)).state;
  return state;
}

describe('fork experiment proof and selection', () => {
  it('starts from reproducible valid branches and identifies their shared history', () => {
    const competition = createForkExperiment();
    expect(inspectFork(competition)).toMatchObject({ tied: true, selected: 'original', commonLength: 2,
      branches: { original: { valid: true, work: 48 }, alternative: { valid: true, work: 48 } } });
    const rewrite = createForkExperiment('rewrite');
    expect(inspectFork(rewrite)).toMatchObject({ tied: false, selected: 'original', commonLength: 0,
      branches: { original: { valid: true, work: 48 }, alternative: { valid: true, work: 16 } } });
    // A lucky two-zero hash still adds just one target's expected work.
    expect(rewrite.branches.original[0].hash.startsWith('00')).toBe(true);
    expect(inspectFork(rewrite).branches.original.work).toBe(3 * BLOCK_WORK);
    expect(createForkExperiment('rewrite')).toEqual(rewrite);
    expect(() => createForkExperiment('unknown')).toThrow(RangeError);
  });

  it('requires strictly more work and preserves the incumbent on either kind of tie', async () => {
    let state = createForkExperiment('rewrite');
    const before = structuredClone(state);
    const first = await round(state, 100);
    expect(state).toEqual(before);
    state = first.state;
    expect(state.selected).toBe('original');
    state = (await round(state, 100)).state;
    expect(inspectFork(state).tied).toBe(true);
    expect(state.selected).toBe('original');
    const switched = await round(state, 100);
    expect(switched.reorganized).toBe(true);
    state = switched.state;
    expect(state).toMatchObject({ selected: 'alternative', reorganizations: 1, rewriteSucceeded: true });
    expect(state.branches.alternative).toHaveLength(4);
    state = (await round(state, 0)).state;
    expect(inspectFork(state).tied).toBe(true);
    expect(state.selected).toBe('alternative');
    state = (await round(state, 0)).state;
    expect(state).toMatchObject({ selected: 'original', reorganizations: 2, rewriteSucceeded: true });
    for (const blocks of Object.values(state.branches)) {
      expect(inspectChain(blocks).every(check => check.valid)).toBe(true);
      for (const block of blocks) expect(blockTrial(block).hash).toBe(block.hash);
    }
  });

  it('never chooses invalid ancestry, numbering, roots or an empty branch', async () => {
    const state = await extend(createForkExperiment(), 100, 3);
    const sparse = structuredClone(state);
    sparse.branches.alternative.length = ROUND_LIMIT + 3;
    expect(inspectFork(sparse)).toMatchObject({ selected: 'original', branches: { alternative: { valid: false, work: 0 } } });
    const damaged = structuredClone(state);
    damaged.branches.alternative[0].data = 'An unmined earlier edit.';
    expect(inspectFork(damaged)).toMatchObject({ selected: 'original', branches: { alternative: { valid: false, work: 0 } } });
    await expect(round(damaged, 100)).rejects.toThrow('Both branches must be valid');
    for (const patch of [{ number: 99 }, { previousHash: 'f'.repeat(64) }]) {
      const malformed = structuredClone(state);
      Object.assign(malformed.branches.alternative[0], patch);
      expect(inspectFork(malformed).selected).toBe('original');
    }
    for (const alternative of [[], null, [null], Array(3)]) {
      expect(inspectFork({ ...state, branches: { ...state.branches, alternative } })).toMatchObject({ selected: 'original', branches: { alternative: { valid: false, work: 0 } } });
    }
  });

  it('excludes zero-power miners and caps a session at twelve new blocks', async () => {
    let state = createForkExperiment('rewrite');
    for (let i = 0; i < ROUND_LIMIT; i++) {
      const result = await round(state, 0);
      expect(result.winner).toBe('original');
      state = result.state;
    }
    expect(state.branches.original).toHaveLength(3 + ROUND_LIMIT);
    expect(state.branches.alternative).toHaveLength(1);
    const exhausted = await round(state, 100);
    expect(exhausted).toMatchObject({ status: 'exhausted', attempts: 0 });
    expect(exhausted.state).toBe(state);
  });

  it('checks proofs independently and rejects an ineligible winner', async () => {
    const state = createForkExperiment();
    await expect(round(state, 0, { searcher: async () => ({ status: 'found', winner: 'alternative', nonce: 0, hash: '0'.repeat(64) }) }))
      .rejects.toThrow('Unexpected mining branch');
    await expect(round(state, 50, { searcher: async () => ({ status: 'found', winner: 'original', nonce: 0, hash: '0'.repeat(64) }) }))
      .rejects.toThrow('proof is invalid');
    for (const power of [-1, 101, 1.5, NaN, '50']) await expect(round(state, power)).rejects.toThrow(RangeError);
  });

  it('does not commit an aborted or exhausted search, including a late found reply', async () => {
    const state = createForkExperiment();
    const controller = new AbortController();
    controller.abort();
    expect(await round(state, 50, { signal: controller.signal })).toMatchObject({ status: 'stopped', attempts: 0, state });
    const running = new AbortController();
    const result = await round(state, 50, { signal: running.signal, searcher: async () => {
      running.abort();
      return { status: 'found', winner: 'original', nonce: 0, hash: '0'.repeat(64), attempts: 7 };
    } });
    expect(result).toMatchObject({ status: 'stopped', winner: null, attempts: 7 });
    expect(result.state).toBe(state);
    const exhausted = await round(state, 50, { searcher: async () => ({ status: 'exhausted', attempts: 50000 }) });
    expect(exhausted.state).toBe(state);
  });
});
