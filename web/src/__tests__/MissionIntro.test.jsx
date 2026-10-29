// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { MissionIntro } from '../components/workbench/MissionIntro';

afterEach(cleanup);

describe('MissionIntro', () => {
  it('invites voluntary learning and explains browser-local progress', () => {
    render(<MissionIntro onStart={() => {}} onDismiss={() => {}} />);
    const card = screen.getByRole('region', { name: 'Curious? Try a mission.' });
    expect(card.textContent).toContain('Or explore freely');
    expect(card.textContent).toContain('missions are always here when you want them');
    expect(card.textContent).toContain('Progress stays in this browser.');
  });

  it('starts or dismisses through its two actions, with no filled primary of its own', () => {
    const onStart = vi.fn();
    const onDismiss = vi.fn();
    render(<MissionIntro onStart={onStart} onDismiss={onDismiss} />);
    expect(document.querySelectorAll('.btn-primary')).toHaveLength(0);
    fireEvent.click(screen.getByRole('button', { name: 'Start missions' }));
    expect(onStart).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole('button', { name: "Don't show again" }));
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });
});
