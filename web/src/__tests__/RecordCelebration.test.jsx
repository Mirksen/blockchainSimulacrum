// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { RecordCelebration } from '../components/workbench/RecordCelebration';

const RECORD = { kind: 'climbed', rank: 4, zeros: 6, places: 3, id: 1 };

beforeEach(() => { vi.useFakeTimers(); });
afterEach(() => { cleanup(); vi.useRealTimers(); });

describe('RecordCelebration', () => {
  it('keeps the focused action while the pointer leaves, and keeps hover when focus leaves', () => {
    const onClose = vi.fn();
    render(<RecordCelebration record={RECORD} onClose={onClose} durationMs={1000} />);
    const card = screen.getByRole('status');
    const action = screen.getByRole('button', { name: 'Leaderboard' });
    fireEvent.pointerEnter(card);
    act(() => action.focus());
    fireEvent.pointerLeave(card);
    act(() => vi.advanceTimersByTime(2000));
    expect(onClose).not.toHaveBeenCalled();
    fireEvent.pointerEnter(card);
    act(() => action.blur());
    act(() => vi.advanceTimersByTime(2000));
    expect(onClose).not.toHaveBeenCalled();
    fireEvent.pointerLeave(card);
    act(() => vi.advanceTimersByTime(1000));
    expect(onClose).toHaveBeenCalledTimes(1);
  });
  it('renders nothing without a record', () => {
    const { container } = render(<RecordCelebration record={null} onClose={() => {}} />);
    expect(container.innerHTML).toBe('');
  });

  it('announces the record politely with the name and the new rank in the badge', () => {
    render(<RecordCelebration record={RECORD} name="test-miner" onClose={() => {}} />);
    const card = screen.getByRole('status');
    expect(card.getAttribute('aria-live')).toBe('polite');
    expect(card.textContent).toContain('New rank: #4');
    expect(card.textContent).toContain('Up 3 places on the all-time board.');
    expect(card.textContent).toContain('test-miner');
    expect(card.querySelector('.record-celebration-badge').textContent).toBe('#4');
  });

  it('closes by itself after its time, but not while the pointer rests on it', () => {
    const onClose = vi.fn();
    render(<RecordCelebration record={RECORD} onClose={onClose} durationMs={1000} />);
    fireEvent.pointerEnter(screen.getByRole('status'));
    act(() => { vi.advanceTimersByTime(2500); });
    expect(onClose).not.toHaveBeenCalled();
    fireEvent.pointerLeave(screen.getByRole('status'));
    act(() => { vi.advanceTimersByTime(1000); });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('closes on Escape and on ×, and the Leaderboard button opens the board', () => {
    const onClose = vi.fn();
    const onOpenLeaderboard = vi.fn();
    render(<RecordCelebration record={RECORD} onClose={onClose} onOpenLeaderboard={onOpenLeaderboard} />);
    fireEvent.keyDown(window, { key: 'Escape' });
    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    fireEvent.click(screen.getByRole('button', { name: 'Leaderboard' }));
    expect(onOpenLeaderboard).toHaveBeenCalledTimes(1);
    expect(onClose).toHaveBeenCalledTimes(3);
  });
});
