// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ForkExperiment } from '../components/ForkExperiment';
import { inspectFork, mineForkRound, ROUND_LIMIT } from '../lib/forkLab';
import { blockTrial } from '../lib/chainLab';

vi.mock('../lib/forkLab', async importOriginal => ({ ...await importOriginal(), mineForkRound: vi.fn() }));
afterEach(() => { cleanup(); vi.useRealTimers(); vi.mocked(mineForkRound).mockReset(); });

// Synthetic valid proofs keep UI fixtures honest without depending on random winners.
function found(state, winner = 'alternative', attempts = 7) {
  const blocks = state.branches[winner];
  const block = { number: blocks.length + 1, data: `${winner} synthetic record ${blocks.length + 1}.`, previousHash: blocks.at(-1).hash, nonce: 0 };
  let hash = blockTrial(block).hash;
  while (!hash.startsWith('0')) { block.nonce++; hash = blockTrial(block).hash; }
  const branches = { ...state.branches, [winner]: [...blocks, { ...block, hash }] };
  const check = inspectFork({ ...state, branches });
  const reorganized = check.selected !== state.selected;
  return { status: 'found', attempts, winner, reorganized,
    state: { ...state, branches, selected: check.selected, rounds: state.rounds + 1,
      reorganizations: state.reorganizations + Number(reorganized),
      rewriteSucceeded: state.rewriteSucceeded || (state.scenario === 'rewrite' && check.selected === 'alternative') } };
}
const click = name => fireEvent.click(screen.getByRole('button', { name, exact: true }));
const step = async () => { await act(async () => click('Mine one block')); };
const branch = name => screen.getByRole('article', { name, exact: true });
const change = action => {
  if (action === 'stop') click('Stop experiment');
  if (action === 'reset') click('Reset fork experiment');
  if (action === 'scenario') fireEvent.click(screen.getByRole('radio', { name: 'Rewrite history' }));
  if (action === 'power') fireEvent.change(screen.getByRole('slider', { name: 'Alternative hash power' }), { target: { value: '80' } });
};

describe('ForkExperiment', () => {
  it('explains equal work, shared ancestry and the local model without emitting evidence', () => {
    const onLessonEvent = vi.fn();
    render(<ForkExperiment onLessonEvent={onLessonEvent} coach={{ target: 'chain-lab.fork-scenario', label: 'Choose the scenario' }} />);
    expect(screen.getByText('Shared ancestor')).toBeTruthy();
    expect(screen.getByText(/Work is tied/)).toBeTruthy();
    expect(screen.getByText(/observed attempts are luck/)).toBeTruthy();
    expect(screen.getByText(/simulator, wallets and mining pool stay untouched/)).toBeTruthy();
    expect(screen.getByRole('note').textContent).toBe('Choose the scenario');
    expect(screen.getByText('Original 50%')).toBeTruthy();
    expect(screen.getByText('Alternative 50%')).toBeTruthy();
    expect(within(branch('Original')).getByText('48 work units')).toBeTruthy();
    expect(within(branch('Alternative')).getByText('48 work units')).toBeTruthy();
    expect(onLessonEvent).not.toHaveBeenCalled();
  });

  it('steps exactly one proof and emits committed work independently of observed attempts', async () => {
    const onLessonEvent = vi.fn();
    mineForkRound.mockImplementation(state => Promise.resolve(found(state, 'alternative', 1)));
    render(<ForkExperiment onLessonEvent={onLessonEvent} coach={{ target: 'chain-lab.fork-mine', label: 'Mine a fork block' }} />);
    await step();
    expect(mineForkRound).toHaveBeenCalledTimes(1);
    expect(within(branch('Alternative')).getByText('64 work units')).toBeTruthy();
    expect(screen.getByText('Alternative is selected.')).toBeTruthy();
    expect(screen.getByText(/Last search: 1 observed attempt/)).toBeTruthy();
    expect(screen.getByText('1 / 12 new blocks')).toBeTruthy();
    expect(onLessonEvent).toHaveBeenCalledExactlyOnceWith({ type: 'fork_round', scenario: 'competition', rounds: 1,
      originalWork: 48, alternativeWork: 64, selected: 'alternative', reorganized: true });
    expect(screen.getByRole('note').textContent).toBe('Mine a fork block');
  });

  it('runs only remaining rounds and never searches after the 12-block cap', async () => {
    vi.useFakeTimers();
    const onLessonEvent = vi.fn();
    mineForkRound.mockImplementation(state => Promise.resolve(found(state)));
    render(<ForkExperiment onLessonEvent={onLessonEvent} />);
    await step();
    await act(async () => click('Run experiment'));
    expect(mineForkRound).toHaveBeenCalledTimes(2);
    expect(screen.getByRole('button', { name: 'Stop experiment' })).toBeTruthy();
    await act(async () => { await vi.runAllTimersAsync(); });
    expect(mineForkRound).toHaveBeenCalledTimes(ROUND_LIMIT);
    expect(onLessonEvent).toHaveBeenCalledTimes(ROUND_LIMIT);
    expect(screen.getByText('12 / 12 new blocks')).toBeTruthy();
    expect(screen.getByRole('status').textContent).toContain('Experiment complete');
    expect(screen.getByRole('button', { name: 'Run experiment' }).disabled).toBe(true);
    expect(screen.getByRole('button', { name: 'Mine one block' }).disabled).toBe(true);
    click('Run experiment');
    click('Mine one block');
    expect(mineForkRound).toHaveBeenCalledTimes(ROUND_LIMIT);
  });

  it('requires strictly more work for a rewrite and explains the resulting switch', async () => {
    const onLessonEvent = vi.fn();
    mineForkRound.mockImplementation(state => Promise.resolve(found(state)));
    render(<ForkExperiment onLessonEvent={onLessonEvent} />);
    fireEvent.click(screen.getByRole('radio', { name: 'Rewrite history' }));
    expect(screen.getByText('Shared starting anchor')).toBeTruthy();
    expect(within(branch('Alternative')).getByText('16 work units')).toBeTruthy();
    expect(onLessonEvent).toHaveBeenCalledExactlyOnceWith({ type: 'fork_reset' });
    onLessonEvent.mockClear();
    await step();
    await step();
    expect(screen.getByText('Original is selected.')).toBeTruthy();
    expect(screen.getByText(/Work is tied/)).toBeTruthy();
    expect(screen.getByText(/Rewrite not observed yet/)).toBeTruthy();
    await step();
    expect(screen.getByText('Alternative is selected.')).toBeTruthy();
    expect(screen.getByText(/Rewrite observed:/)).toBeTruthy();
    expect(onLessonEvent.mock.calls.map(([event]) => event.reorganized)).toEqual([false, false, true]);
    expect(onLessonEvent.mock.calls[2][0]).toMatchObject({ scenario: 'rewrite', originalWork: 48, alternativeWork: 64 });
  });

  it('preserves completed work and mission evidence when changing power', async () => {
    const onLessonEvent = vi.fn();
    mineForkRound.mockImplementation(state => Promise.resolve(found(state)));
    render(<ForkExperiment onLessonEvent={onLessonEvent} />);
    await step();
    onLessonEvent.mockClear();
    change('power');
    expect(screen.getByText('1 / 12 new blocks')).toBeTruthy();
    expect(within(branch('Alternative')).getByText('64 work units')).toBeTruthy();
    expect(screen.getByText('Original 20%')).toBeTruthy();
    expect(screen.getByText('Alternative 80%')).toBeTruthy();
    expect(onLessonEvent).not.toHaveBeenCalled();
    await step();
    expect(mineForkRound.mock.calls[1][1]).toBe(80);
    expect(onLessonEvent).toHaveBeenCalledTimes(1);
  });

  it.each(['reset', 'scenario'])('starts fresh and clears partial lesson evidence on %s', async action => {
    const onLessonEvent = vi.fn();
    mineForkRound.mockImplementation(state => Promise.resolve(found(state)));
    render(<ForkExperiment onLessonEvent={onLessonEvent} />);
    await step();
    onLessonEvent.mockClear();
    change(action);
    expect(screen.getByText('0 / 12 new blocks')).toBeTruthy();
    expect(screen.getByText('Original is selected.')).toBeTruthy();
    expect(onLessonEvent).toHaveBeenCalledExactlyOnceWith({ type: 'fork_reset' });
  });

  it.each(['stop', 'reset', 'scenario', 'power', 'unmount'])('rejects late proof and progress after %s', async action => {
    let resolve;
    let options;
    let pendingState;
    mineForkRound.mockImplementation((state, _power, supplied) => {
      pendingState = state;
      options = supplied;
      return new Promise(done => { resolve = done; });
    });
    const onLessonEvent = vi.fn();
    const view = render(<ForkExperiment onLessonEvent={onLessonEvent} />);
    click('Run experiment');
    act(() => options.onProgress({ attempts: 9, entrants: {} }));
    expect(screen.getByText(/9 observed attempts/)).toBeTruthy();
    if (action === 'unmount') view.unmount(); else change(action);
    expect(options.signal.aborted).toBe(true);
    onLessonEvent.mockClear();
    await act(async () => {
      options.onProgress({ attempts: 999, entrants: {} });
      resolve(found(pendingState));
    });
    expect(onLessonEvent).not.toHaveBeenCalled();
    if (action !== 'unmount') {
      expect(screen.getByText('0 / 12 new blocks')).toBeTruthy();
      expect(screen.queryByText(/999 observed/)).toBeNull();
      expect(screen.getByRole('button', { name: 'Run experiment' }).disabled).toBe(false);
    }
  });

  it.each(['stop', 'reset', 'scenario', 'power', 'unmount'])('cancels the pacing delay before another search on %s', async action => {
    vi.useFakeTimers();
    let signal;
    mineForkRound.mockImplementation((state, _power, options) => { signal = options.signal; return Promise.resolve(found(state)); });
    const onLessonEvent = vi.fn();
    const view = render(<ForkExperiment onLessonEvent={onLessonEvent} />);
    await act(async () => click('Run experiment'));
    expect(mineForkRound).toHaveBeenCalledTimes(1);
    expect(screen.getByText('1 / 12 new blocks')).toBeTruthy();
    if (action === 'unmount') view.unmount(); else change(action);
    expect(signal.aborted).toBe(true);
    onLessonEvent.mockClear();
    await act(async () => { await vi.runAllTimersAsync(); });
    expect(mineForkRound).toHaveBeenCalledTimes(1);
    expect(onLessonEvent).not.toHaveBeenCalled();
    if (action === 'stop' || action === 'power') expect(screen.getByText('1 / 12 new blocks')).toBeTruthy();
  });

  it('keeps a newer search owned when a cancelled search resolves', async () => {
    const pending = [];
    mineForkRound.mockImplementation(state => new Promise(resolve => pending.push({ state, resolve })));
    const onLessonEvent = vi.fn();
    render(<ForkExperiment onLessonEvent={onLessonEvent} />);
    click('Mine one block');
    change('stop');
    click('Mine one block');
    await act(async () => pending[0].resolve(found(pending[0].state)));
    expect(screen.getByRole('button', { name: 'Stop experiment' })).toBeTruthy();
    expect(onLessonEvent).not.toHaveBeenCalled();
    await act(async () => pending[1].resolve(found(pending[1].state)));
    expect(screen.getByText('1 / 12 new blocks')).toBeTruthy();
    expect(onLessonEvent).toHaveBeenCalledTimes(1);
  });

  it('handles rejected search with a usable retry action', async () => {
    mineForkRound.mockRejectedValueOnce(new Error('Synthetic worker failure'));
    mineForkRound.mockImplementationOnce(state => Promise.resolve({ status: 'exhausted', state, attempts: 42, winner: null, reorganized: false }));
    const onLessonEvent = vi.fn();
    render(<ForkExperiment onLessonEvent={onLessonEvent} />);
    await act(async () => click('Run experiment'));
    expect(screen.getByRole('status').textContent).toContain('proof search could not finish');
    expect(screen.getByRole('button', { name: 'Retry experiment' }).disabled).toBe(false);
    await act(async () => click('Retry experiment'));
    expect(screen.getByRole('status').textContent).toContain('No proof found within this search limit');
    expect(screen.getByText('0 / 12 new blocks')).toBeTruthy();
    expect(onLessonEvent).not.toHaveBeenCalled();
  });

  it.each(['stopped', 'exhausted'])('does not commit %s searches', async status => {
    mineForkRound.mockImplementation(state => Promise.resolve({ ...found(state), status }));
    const onLessonEvent = vi.fn();
    render(<ForkExperiment onLessonEvent={onLessonEvent} />);
    await step();
    expect(screen.getByText('0 / 12 new blocks')).toBeTruthy();
    expect(onLessonEvent).not.toHaveBeenCalled();
  });

  it('ignores a rejected search after Stop', async () => {
    let reject;
    mineForkRound.mockImplementation(() => new Promise((_resolve, failed) => { reject = failed; }));
    const onLessonEvent = vi.fn();
    render(<ForkExperiment onLessonEvent={onLessonEvent} />);
    click('Run experiment');
    change('stop');
    await act(async () => reject(new Error('Late synthetic failure')));
    expect(screen.getByRole('status').textContent).toContain('Experiment stopped');
    expect(screen.queryByRole('button', { name: 'Retry experiment' })).toBeNull();
    expect(onLessonEvent).not.toHaveBeenCalled();
  });

  it('restores the current rewrite scenario on Reset', async () => {
    mineForkRound.mockImplementation(state => Promise.resolve(found(state)));
    render(<ForkExperiment />);
    fireEvent.click(screen.getByRole('radio', { name: 'Rewrite history' }));
    await step();
    click('Reset fork experiment');
    expect(screen.getByRole('radio', { name: 'Rewrite history' }).checked).toBe(true);
    expect(within(branch('Alternative')).getByText('16 work units')).toBeTruthy();
    expect(screen.getByText('0 / 12 new blocks')).toBeTruthy();
  });
});
