// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ChainLab } from '../components/ChainLab';
import { remineBlock, sampleChain } from '../lib/chainLab';

vi.mock('../lib/chainLab', async importOriginal => {
  const actual = await importOriginal();
  return { ...actual, remineBlock: vi.fn(actual.remineBlock) };
});
afterEach(() => { cleanup(); vi.useRealTimers(); vi.mocked(remineBlock).mockReset(); });
const card = number => screen.getByRole('article', { name: `Block ${number}` });
const mine = async number => {
  fireEvent.click(screen.getByRole('button', { name: `Re-mine Block ${number}`, exact: true }));
  await act(async () => { await vi.runAllTimersAsync(); });
};

describe('ChainLab interaction', () => {
  it('shows the complete edit and sequential repair learning flow', async () => {
    vi.useFakeTimers();
    // Restore the real implementation after other tests that use deferred results.
    vi.mocked(remineBlock).mockImplementation((await vi.importActual('../lib/chainLab')).remineBlock);
    render(<ChainLab onClose={() => {}} />);
    expect(screen.getByText('Toy chain consistent')).toBeTruthy();
    fireEvent.change(screen.getByLabelText('Block 1 data'), { target: { value: 'An edited parcel record.' } });
    expect(screen.getByText('Toy chain inconsistent')).toBeTruthy();
    expect(within(card(1)).getByText('Hash does not match input')).toBeTruthy();
    expect(within(card(2)).getByText('Earlier block invalid')).toBeTruthy();
    expect(within(card(2)).getByText('Previous link matches')).toBeTruthy();
    await mine(1);
    expect(within(card(1)).getByText('Valid through here')).toBeTruthy();
    expect(within(card(2)).getByText('Previous link does not match')).toBeTruthy();
    expect(within(card(3)).getByText('Previous link matches')).toBeTruthy();
    await mine(2);
    expect(within(card(3)).getByText('Previous link does not match')).toBeTruthy();
    await mine(3);
    expect(screen.getByText('Toy chain consistent')).toBeTruthy();
    expect(screen.getByRole('status').textContent).toMatch(/Block 3 re-mined in \d+ attempts?\./);
  });

  it('explains invalid nonce input and restores the deterministic sample', () => {
    render(<ChainLab onClose={() => {}} />);
    fireEvent.change(screen.getByLabelText('Block 1 nonce'), { target: { value: '1.5' } });
    expect(screen.getByRole('alert').textContent).toContain('whole number');
    expect(screen.getByRole('button', { name: 'Re-mine Block 1' }).disabled).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: 'Reset chain lab' }));
    expect(screen.queryByRole('alert')).toBeNull();
    expect(screen.getByLabelText('Block 1 nonce').value).toBe(String(sampleChain()[0].nonce));
    expect(screen.getByText('Toy chain consistent')).toBeTruthy();
  });

  it.each(['edit', 'reset', 'close', 'unmount'])('invalidates a pending result on %s', async action => {
    let resolve;
    let signal;
    vi.mocked(remineBlock).mockImplementation((_blocks, _index, options) => {
      signal = options.signal;
      return new Promise(done => { resolve = done; });
    });
    const onClose = vi.fn();
    const view = render(<ChainLab onClose={onClose} />);
    fireEvent.click(screen.getByRole('button', { name: 'Re-mine Block 1', exact: true }));
    if (action === 'edit') fireEvent.change(screen.getByLabelText('Block 1 data'), { target: { value: 'A later edit.' } });
    if (action === 'reset') fireEvent.click(screen.getByRole('button', { name: 'Reset chain lab' }));
    if (action === 'close') { fireEvent.click(screen.getByRole('button', { name: 'Back to simulator' })); expect(onClose).toHaveBeenCalledTimes(1); }
    if (action === 'unmount') view.unmount();
    expect(signal.aborted).toBe(true);
    await act(async () => { resolve({ status: 'found', attempts: 1, block: { ...sampleChain()[0], data: 'Stale result' } }); });
    if (action === 'unmount') expect(screen.queryByRole('status')).toBeNull();
    else expect(screen.getByLabelText('Block 1 data').value).not.toBe('Stale result');
  });

  it('does not commit a late found result or emit lesson evidence after Stop', async () => {
    let resolve;
    vi.mocked(remineBlock).mockImplementation(() => new Promise(done => { resolve = done; }));
    const onLessonEvent = vi.fn();
    render(<ChainLab onClose={() => {}} onLessonEvent={onLessonEvent} />);
    const original = screen.getByLabelText('Block 1 data').value;
    fireEvent.click(screen.getByRole('button', { name: 'Re-mine Block 1' }));
    fireEvent.click(screen.getByRole('button', { name: 'Stop search' }));
    await act(async () => { resolve({ status: 'found', attempts: 1, block: { ...sampleChain()[0], data: 'A stale completed search.' } }); });
    expect(screen.getByLabelText('Block 1 data').value).toBe(original);
    expect(onLessonEvent).not.toHaveBeenCalled();
    expect(screen.getByRole('status').textContent).toContain('Stopped after 1 attempts');
  });

  it('stops before the first hash and leaves the stored block alone', async () => {
    vi.useFakeTimers();
    vi.mocked(remineBlock).mockImplementation((await vi.importActual('../lib/chainLab')).remineBlock);
    render(<ChainLab onClose={() => {}} />);
    fireEvent.click(screen.getByRole('button', { name: 'Re-mine Block 1' }));
    fireEvent.click(screen.getByRole('button', { name: 'Stop search' }));
    await act(async () => { await vi.runAllTimersAsync(); });
    expect(screen.getByRole('status').textContent).toContain('Stopped after 0 attempts');
    expect(screen.getByText('Toy chain consistent')).toBeTruthy();
  });
});
