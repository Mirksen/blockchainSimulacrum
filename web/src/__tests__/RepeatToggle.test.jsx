// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { RepeatToggle } from '../components/workbench/RepeatToggle';

afterEach(cleanup);

describe('RepeatToggle', () => {
  it('shows "Auto" under its own name and reports the opposite state', () => {
    const onToggle = vi.fn();
    const { rerender } = render(<RepeatToggle name="Auto-mine" onToggle={onToggle} />);
    const toggle = screen.getByRole('button', { name: 'Auto-mine' });
    expect(toggle.textContent).toBe('Auto');
    expect(toggle.getAttribute('aria-pressed')).toBe('false');
    fireEvent.click(toggle);
    expect(onToggle).toHaveBeenLastCalledWith(true);
    rerender(<RepeatToggle name="Auto-mine" pressed onToggle={onToggle} />);
    expect(toggle.getAttribute('aria-pressed')).toBe('true');
    fireEvent.click(toggle);
    expect(onToggle).toHaveBeenLastCalledWith(false);
  });

  it('does nothing while disabled', () => {
    const onToggle = vi.fn();
    render(<RepeatToggle name="Auto-transact" disabled onToggle={onToggle} />);
    fireEvent.click(screen.getByRole('button', { name: 'Auto-transact' }));
    expect(onToggle).not.toHaveBeenCalled();
  });
});
