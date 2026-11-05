// @vitest-environment jsdom
import { StrictMode, useState } from 'react';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ChainEventNotes } from '../components/workbench/KeyFigures';

const first = { key: 'reward-21', kind: 'halving', title: 'Reward changed', text: 'Synthetic reward notice' };
const second = { key: 'difficulty-30', kind: 'up', title: 'Difficulty changed', text: 'Synthetic difficulty notice' };
const wait = ms => act(() => { vi.advanceTimersByTime(ms); });

function Notices({ notes = [first], onDismiss = () => {} }) {
  const [dismissed, setDismissed] = useState([]);
  return <ChainEventNotes notes={notes.filter(note => !dismissed.includes(note.key))} onDismiss={key => {
    setDismissed(current => [...current, key]);
    onDismiss(key);
  }} />;
}

beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(new Date('2026-01-02T12:00:00Z')); });
afterEach(() => { cleanup(); vi.useRealTimers(); });

describe('chain event notice lifetime', () => {
  it('expires at 30 seconds, even through rerenders with fresh callbacks and note objects', () => {
    const onDismiss = vi.fn();
    const { rerender } = render(<StrictMode><Notices onDismiss={onDismiss} /></StrictMode>);
    wait(20_000);
    rerender(<StrictMode><Notices notes={[{ ...first }]} onDismiss={onDismiss} /></StrictMode>);
    wait(9_999);
    expect(screen.getByRole('status').textContent).toContain(first.text);
    wait(1);
    expect(screen.queryByRole('status')).toBeNull();
    expect(onDismiss).toHaveBeenCalledExactlyOnceWith(first.key);
  });

  it('pauses only the hovered note and resumes its remaining time after leaving', () => {
    render(<Notices notes={[first, second]} />);
    wait(20_000);
    const note = screen.getAllByRole('status')[0];
    fireEvent.mouseEnter(note);
    wait(60_000);
    expect(screen.getAllByRole('status')).toEqual([note]);
    fireEvent.mouseLeave(note);
    wait(9_999);
    expect(screen.getByRole('status')).toBe(note);
    wait(1);
    expect(screen.queryByRole('status')).toBeNull();
  });

  it('keeps a focused notice paused when the mouse leaves, until focus leaves too', () => {
    render(<Notices />);
    wait(29_000);
    const note = screen.getByRole('status');
    const button = screen.getByRole('button', { name: 'Got it' });
    fireEvent.mouseEnter(note);
    fireEvent.focus(button);
    fireEvent.mouseLeave(note);
    wait(40_000);
    expect(screen.getByRole('status')).toBe(note);
    fireEvent.blur(button, { relatedTarget: document.body });
    wait(999);
    expect(screen.getByRole('status')).toBe(note);
    wait(1);
    expect(screen.queryByRole('status')).toBeNull();
  });

  it('starts a new note with its own deadline without extending the earlier note', () => {
    const { rerender } = render(<Notices />);
    wait(20_000);
    rerender(<Notices notes={[first, second]} />);
    wait(10_000);
    expect(screen.getAllByRole('status')).toHaveLength(1);
    expect(screen.getByRole('status').textContent).toContain(second.text);
    wait(19_999);
    expect(screen.getByRole('status')).toBeTruthy();
    wait(1);
    expect(screen.queryByRole('status')).toBeNull();
  });

  it('dismisses immediately while hovered and cancels timers on unmount', () => {
    const onDismiss = vi.fn();
    const { unmount } = render(<Notices notes={[first, second]} onDismiss={onDismiss} />);
    fireEvent.mouseEnter(screen.getAllByRole('status')[0]);
    fireEvent.click(screen.getAllByRole('button', { name: 'Got it' })[0]);
    expect(onDismiss).toHaveBeenCalledExactlyOnceWith(first.key);
    unmount();
    expect(vi.getTimerCount()).toBe(0);
    wait(30_000);
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });
});
