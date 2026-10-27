// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { LearningPath } from '../components/LearningPath';
import { findNonce } from '../lib/hashLab';
import { remineBlock } from '../lib/chainLab';

vi.mock('../lib/hashLab', async original => ({ ...await original(), findNonce: vi.fn((...args) => original().then(module => module.findNonce(...args))) }));
vi.mock('../lib/chainLab', async original => ({ ...await original(), remineBlock: vi.fn((...args) => original().then(module => module.remineBlock(...args))) }));
beforeEach(async () => {
  vi.useFakeTimers();
  vi.stubGlobal('requestAnimationFrame', callback => { callback(); return 0; });
  // jsdom has no native dialog methods; browser acceptance checks the real modal.
  Object.defineProperty(HTMLDialogElement.prototype, 'showModal', { configurable: true, value() { this.open = true; } });
  Object.defineProperty(HTMLDialogElement.prototype, 'close', { configurable: true, value() { this.open = false; } });
  vi.mocked(findNonce).mockImplementation((await vi.importActual('../lib/hashLab')).findNonce);
  vi.mocked(remineBlock).mockImplementation((await vi.importActual('../lib/chainLab')).remineBlock);
});
afterEach(() => { cleanup(); vi.useRealTimers(); vi.restoreAllMocks(); vi.unstubAllGlobals(); vi.clearAllMocks(); });
const next = () => screen.getByRole('button', { name: 'Next experiment', exact: true });
const editMessage = () => fireEvent.change(screen.getByLabelText('Message'), { target: { value: 'Hello, block?' } });
const flush = async () => { await act(async () => { await vi.runAllTimersAsync(); }); };
const search = async target => {
  fireEvent.change(screen.getByLabelText('Find a hash starting with'), { target: { value: String(target) } });
  fireEvent.click(screen.getByRole('button', { name: 'Find a nonce', exact: true }));
  await flush();
};
const reachWork = () => { editMessage(); fireEvent.click(next()); };
const reachChain = async () => { reachWork(); await search(1); await search(2); fireEvent.click(next()); };
const mine = async number => {
  fireEvent.click(screen.getByRole('button', { name: `Re-mine Block ${number}`, exact: true }));
  await flush();
};
const finish = () => screen.getByRole('button', { name: 'Finish learning path', exact: true });

describe('observed learning progress', () => {
  it('does not unlock from navigation, identical messages, nonce-only changes or invalid input', () => {
    render(<LearningPath open onClose={() => {}} />);
    expect(next().disabled).toBe(true);
    fireEvent.click(next());
    fireEvent.click(screen.getByRole('button', { name: /Earn a proof of work/ }));
    expect(screen.queryByText('Experiment 2: Earn a proof of work')).toBeNull();
    fireEvent.change(screen.getByLabelText('Message'), { target: { value: 'Hello, block!' } });
    fireEvent.click(screen.getByRole('button', { name: 'Next nonce' }));
    expect(next().disabled).toBe(true);
    fireEvent.change(screen.getByLabelText(/Nonce/), { target: { value: '1.5' } });
    editMessage();
    expect(next().disabled).toBe(true);
    fireEvent.change(screen.getByLabelText(/Nonce/), { target: { value: '0' } });
    fireEvent.change(screen.getByLabelText('Message'), { target: { value: 'Another synthetic message' } });
    expect(next().disabled).toBe(false);
    fireEvent.click(screen.getByRole('button', { name: 'Reset lab' }));
    expect(next().disabled).toBe(true);
  });

  it('requires both actual target searches and fixes their message and starting nonce', async () => {
    render(<LearningPath open onClose={() => {}} />);
    reachWork();
    expect(screen.getByLabelText('Message').readOnly).toBe(true);
    expect(screen.getByLabelText(/Nonce/).readOnly).toBe(true);
    await search(1);
    await search(1);
    expect(next().disabled).toBe(true);
    fireEvent.change(screen.getByLabelText('Find a hash starting with'), { target: { value: '2' } });
    expect(next().disabled).toBe(true);
    await search(2);
    expect(next().disabled).toBe(false);
    const inputs = vi.mocked(findNonce).mock.calls.map(([input]) => ({ message: input.message, start: input.startNonce, difficulty: input.difficulty }));
    expect(inputs).toEqual([{ message: 'Hello, block!', start: 0, difficulty: 1 }, { message: 'Hello, block!', start: 0, difficulty: 1 }, { message: 'Hello, block!', start: 0, difficulty: 2 }]);
    expect(screen.getByText(/A single run does not guarantee/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Reset lab' }));
    expect(next().disabled).toBe(true);
    expect(screen.getByText('Find a match for 1 zero')).toBeTruthy();
  });

  it.each(['stop', 'reset', 'restart', 'close'])('does not credit a late found result after %s', async action => {
    let settle; let signal;
    vi.mocked(findNonce).mockImplementation(options => { signal = options.signal; return new Promise(resolve => { settle = resolve; }); });
    const onClose = vi.fn();
    const view = render(<LearningPath open onClose={onClose} />);
    reachWork();
    fireEvent.click(screen.getByRole('button', { name: 'Find a nonce' }));
    if (action === 'stop') fireEvent.click(screen.getByRole('button', { name: 'Stop search' }));
    if (action === 'reset') fireEvent.click(screen.getByRole('button', { name: 'Reset lab' }));
    if (action === 'restart') fireEvent.click(screen.getByRole('button', { name: 'Restart learning path' }));
    if (action === 'close') { fireEvent.click(screen.getByRole('button', { name: 'Close guide' })); view.rerender(<LearningPath open={false} onClose={onClose} />); }
    expect(signal.aborted).toBe(true);
    await act(async () => { settle({ status: 'found', attempts: 1, trial: { nonce: 0, hash: '0'.repeat(64) } }); });
    if (action === 'close') view.rerender(<LearningPath open onClose={onClose} />);
    expect(next().disabled).toBe(true);
    expect(screen.queryByText(/✓ 1 zero:/)).toBeNull();
  });

  it('requires retained changed data and full repair; resets and partial repairs do not finish', async () => {
    render(<LearningPath open onClose={() => {}} />);
    await reachChain();
    expect(finish().disabled).toBe(true);
    fireEvent.change(screen.getByLabelText('Block 2 data'), { target: { value: 'A different second record.' } });
    await mine(2); await mine(3);
    expect(finish().disabled).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: 'Reset chain lab' }));
    const original = screen.getByLabelText('Block 1 data').value;
    fireEvent.change(screen.getByLabelText('Block 1 data'), { target: { value: 'A changed first record.' } });
    fireEvent.change(screen.getByLabelText('Block 1 data'), { target: { value: original } });
    expect(finish().disabled).toBe(true);
    fireEvent.change(screen.getByLabelText('Block 1 data'), { target: { value: 'A changed first record.' } });
    await mine(1); await mine(2);
    expect(finish().disabled).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: 'Reset chain lab' }));
    expect(finish().disabled).toBe(true);
    fireEvent.change(screen.getByLabelText('Block 1 data'), { target: { value: 'A retained first record.' } });
    await mine(1); await mine(2); await mine(3);
    expect(screen.getByLabelText('Block 1 data').value).toBe('A retained first record.');
    expect(finish().disabled).toBe(false);
    fireEvent.click(finish());
    expect(screen.getByText('3 of 3 experiments complete')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Continue in simulator' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Restart learning path' }));
    expect(screen.getByText('0 of 3 experiments complete')).toBeTruthy();
    expect(screen.getByLabelText('Message').value).toBe('Hello, block!');
    expect(next().disabled).toBe(true);
  });

  it('clears an unfinished chain attempt on close without falsely resuming a broken sample', async () => {
    const onClose = vi.fn();
    const view = render(<LearningPath open onClose={onClose} />);
    await reachChain();
    fireEvent.change(screen.getByLabelText('Block 1 data'), { target: { value: 'An unfinished edit.' } });
    expect(screen.getByText(/The edit broke consistency/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Close guide' }));
    view.rerender(<LearningPath open={false} onClose={onClose} />);
    view.rerender(<LearningPath open onClose={onClose} />);
    expect(screen.getByText(/The starting chain is consistent/)).toBeTruthy();
    expect(finish().disabled).toBe(true);
  });

  it('keeps progress on close/reopen and resets the first experiment on restart', () => {
    const onClose = vi.fn();
    const view = render(<LearningPath open onClose={onClose} />);
    editMessage();
    expect(next().disabled).toBe(false);
    fireEvent.click(screen.getByRole('button', { name: 'Close guide' }));
    expect(onClose).toHaveBeenCalledOnce();
    view.rerender(<LearningPath open={false} onClose={onClose} />);
    view.rerender(<LearningPath open onClose={onClose} />);
    expect(screen.getByText('1 of 3 experiments complete')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Restart learning path' }));
    expect(screen.getByLabelText('Message').value).toBe('Hello, block!');
    expect(next().disabled).toBe(true);
    expect(within(screen.getByRole('navigation', { name: 'Learning steps' })).getByRole('button', { name: /Change a fingerprint/ }).getAttribute('aria-current')).toBe('step');
  });
});
