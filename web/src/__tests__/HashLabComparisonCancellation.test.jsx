// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { HashLab } from '../components/HashLab';
import { createTrial, findNonce } from '../lib/hashLab';

vi.mock('../lib/hashLab', async importOriginal => ({ ...await importOriginal(), findNonce: vi.fn() }));
afterEach(() => { cleanup(); vi.clearAllMocks(); });

const success = (difficulty = 1) => ({ status: 'found', attempts: difficulty === 1 ? 4 : 72,
  trial: createTrial('Hello, block!', difficulty === 1 ? 3 : 71) });
const start = () => fireEvent.click(screen.getByRole('button', { name: 'Find a nonce' }));

describe('work comparison accepts completed searches only', () => {
  it.each(['stop', 'reset', 'target', 'unmount'])('rejects a late found result after %s', async action => {
    const onWorkComparison = vi.fn();
    const onLessonEvent = vi.fn();
    findNonce.mockResolvedValueOnce(success());
    let resolve;
    findNonce.mockImplementationOnce(() => new Promise(done => { resolve = done; }));
    const view = render(<HashLab lesson="work" onWorkComparison={onWorkComparison} onLessonEvent={onLessonEvent} />);
    await act(async () => start());
    expect(onWorkComparison).toHaveBeenCalledTimes(1);
    fireEvent.change(screen.getByLabelText('Find a hash starting with'), { target: { value: '2' } });
    start();
    // Even a valid-looking final trial is no evidence after cancellation.
    if (action === 'stop') fireEvent.click(screen.getByRole('button', { name: 'Stop search' }));
    if (action === 'reset') fireEvent.click(screen.getByRole('button', { name: 'Reset lab' }));
    if (action === 'target') fireEvent.change(screen.getByLabelText('Find a hash starting with'), { target: { value: '1' } });
    if (action === 'unmount') view.unmount();
    onWorkComparison.mockClear();
    onLessonEvent.mockClear();
    await act(async () => resolve(success(2)));
    expect(onWorkComparison).not.toHaveBeenCalled();
    expect(onLessonEvent).not.toHaveBeenCalled();
    if (action === 'stop' || action === 'target') {
      const comparison = screen.getByRole('region', { name: 'Proof-of-work search comparison' });
      expect(within(comparison).getByRole('row', { name: /^Two zeros / }).textContent).toContain('Not found yet');
    } else {
      expect(screen.queryByRole('region', { name: 'Proof-of-work search comparison' })).toBeNull();
    }
  });

  it('does not count an exhausted search even when its last trial is present', async () => {
    const onWorkComparison = vi.fn();
    const onLessonEvent = vi.fn();
    findNonce.mockResolvedValueOnce({ ...success(), status: 'exhausted' });
    render(<HashLab lesson="work" onWorkComparison={onWorkComparison} onLessonEvent={onLessonEvent} />);
    await act(async () => start());
    expect(screen.getByRole('status').textContent).toContain('No match');
    expect(screen.queryByRole('region', { name: 'Proof-of-work search comparison' })).toBeNull();
    expect(onWorkComparison).not.toHaveBeenCalled();
    expect(onLessonEvent).not.toHaveBeenCalled();
  });
});
