// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { HashLab } from '../components/HashLab';

afterEach(() => { cleanup(); vi.useRealTimers(); });
const fingerprint = () => screen.getByRole('img', { name: /^Double SHA-256 hash:/ }).getAttribute('aria-label');

describe('HashLab independent interaction', () => {
  it('updates/restores fingerprints and exposes invalid nonces', () => {
    render(<HashLab onClose={() => {}} />);
    const original = fingerprint();
    fireEvent.change(screen.getByLabelText('Message'), { target: { value: 'Hello, block?' } });
    expect(fingerprint()).not.toBe(original);
    fireEvent.change(screen.getByLabelText('Message'), { target: { value: 'Hello, block!' } });
    expect(fingerprint()).toBe(original);
    fireEvent.change(screen.getByLabelText(/Nonce/), { target: { value: '1.5' } });
    expect(screen.getByRole('alert').textContent).toContain('whole number');
    expect(screen.getByRole('button', { name: 'Find a nonce' }).disabled).toBe(true);
    expect(fingerprint()).toBe(original);
    fireEvent.change(screen.getByLabelText(/Nonce/), { target: { value: '0' } });
    expect(screen.queryByRole('alert')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Next nonce' }));
    expect(screen.getByLabelText(/Nonce/).value).toBe('1');
  });
  it('shows a real match and its exact attempt count', async () => {
    vi.useFakeTimers();
    render(<HashLab onClose={() => {}} />);
    fireEvent.click(screen.getByRole('button', { name: 'Find a nonce' }));
    await act(async () => { await vi.runAllTimersAsync(); });
    expect(screen.getByRole('status').textContent).toContain('264 attempts');
    expect(screen.getByLabelText(/Nonce/).value).toBe('263');
    expect(screen.getByText('Target met')).toBeTruthy();
  });
  it('stops before the first attempt and can search again', async () => {
    vi.useFakeTimers();
    render(<HashLab onClose={() => {}} />);
    fireEvent.click(screen.getByRole('button', { name: 'Find a nonce' }));
    fireEvent.click(screen.getByRole('button', { name: 'Stop search' }));
    await act(async () => { await vi.runAllTimersAsync(); });
    expect(screen.getByRole('status').textContent).toContain('Stopped after 0 attempts');
    fireEvent.click(screen.getByRole('button', { name: 'Find a nonce' }));
    await act(async () => { await vi.runAllTimersAsync(); });
    expect(screen.getByRole('status').textContent).toContain('Target found');
  });
  it.each(['edit', 'reset', 'next nonce', 'difficulty'])('invalidates a pending search on %s', async action => {
    vi.useFakeTimers();
    render(<HashLab onClose={() => {}} />);
    // This message has no three-zero match in its first 25,000 candidates.
    fireEvent.change(screen.getByLabelText('Message'), { target: { value: 'Stop experiment 264' } });
    fireEvent.change(screen.getByLabelText('Find a hash starting with'), { target: { value: '3' } });
    fireEvent.click(screen.getByRole('button', { name: 'Find a nonce' }));
    // Resolve one timer before flushing microtasks; the async timer helper also drains newly scheduled timers.
    await act(async () => { vi.advanceTimersToNextTimer(); });
    expect(screen.getByLabelText(/Nonce/).value).toBe('99');
    if (action === 'edit') fireEvent.change(screen.getByLabelText('Message'), { target: { value: 'New experiment' } });
    if (action === 'reset') fireEvent.click(screen.getByRole('button', { name: 'Reset lab' }));
    if (action === 'next nonce') fireEvent.click(screen.getByRole('button', { name: 'Next nonce' }));
    if (action === 'difficulty') fireEvent.change(screen.getByLabelText('Find a hash starting with'), { target: { value: '3' } });
    const updated = fingerprint();
    await act(async () => { await vi.runAllTimersAsync(); });
    expect(fingerprint()).toBe(updated);
    expect(screen.getByRole('status').textContent).toBe('Change one letter. See how much of the fingerprint changes.');
    expect(screen.queryByRole('button', { name: 'Stop search' })).toBeNull();
  });
  it('closes and aborts its work', async () => {
    vi.useFakeTimers();
    const onClose = vi.fn();
    const view = render(<HashLab onClose={onClose} />);
    fireEvent.click(screen.getByRole('button', { name: 'Find a nonce' }));
    fireEvent.click(screen.getByRole('button', { name: 'Back to simulator' }));
    expect(onClose).toHaveBeenCalledTimes(1);
    view.unmount();
    await act(async () => { await vi.runAllTimersAsync(); });
    expect(screen.queryByRole('status')).toBeNull();
  });
});
