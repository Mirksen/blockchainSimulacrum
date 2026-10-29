// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { MissionIntro } from '../components/workbench/MissionIntro';
import { MISSIONS } from '../lib/missions';

afterEach(cleanup);

describe('MissionIntro', () => {
  it('names the track and its first missions', () => {
    render(<MissionIntro onStart={() => {}} onDismiss={() => {}} />);
    const card = screen.getByRole('region', { name: 'Learn proof of work by doing it' });
    expect(card.textContent).toContain(`${MISSIONS.length} missions`);
    for (const mission of MISSIONS.slice(0, 3)) expect(card.textContent).toContain(mission.title);
  });

  it('starts or dismisses through its two actions, with no filled primary of its own', () => {
    const onStart = vi.fn();
    const onDismiss = vi.fn();
    render(<MissionIntro onStart={onStart} onDismiss={onDismiss} />);
    expect(document.querySelectorAll('.btn-primary')).toHaveLength(0);
    fireEvent.click(screen.getByRole('button', { name: 'Start missions' }));
    expect(onStart).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole('button', { name: 'Not now' }));
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });
});
