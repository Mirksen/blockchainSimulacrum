// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { TopBar } from '../components/workbench/TopBar';

afterEach(cleanup);

const renderBar = (props = {}) => {
  const handlers = {
    onNavigate: vi.fn(), onTheme: vi.fn(), onMuted: vi.fn(), onReset: vi.fn(), onOpenSettings: vi.fn(),
  };
  const utils = render(<TopBar view="workbench" coinName="testCoin" chainValid theme="dark" muted={false} {...handlers} {...props} />);
  return { ...utils, ...handlers };
};
const more = () => screen.getByRole('button', { name: 'More' });

describe('navigation', () => {
  it('marks the current view with aria-current and hands clicks to onNavigate', () => {
    const { onNavigate } = renderBar({ view: 'chain-lab' });
    const nav = screen.getByRole('navigation', { name: 'Main' });
    const links = within(nav).getAllByRole('link');
    expect(links.map(link => link.textContent)).toEqual(['Workbench', 'Hash lab', 'Chain lab', 'Leaderboard']);
    expect(within(nav).getByRole('link', { name: 'Chain lab' }).getAttribute('aria-current')).toBe('page');
    expect(links.filter(link => link.hasAttribute('aria-current'))).toHaveLength(1);
    expect(within(nav).getByRole('link', { name: 'Leaderboard' }).getAttribute('href')).toBe('#/pool');

    fireEvent.click(within(nav).getByRole('link', { name: 'Hash lab' }));
    expect(onNavigate).toHaveBeenCalledWith('hash-lab');
    fireEvent.click(within(nav).getByRole('link', { name: 'Leaderboard' }));
    expect(onNavigate).toHaveBeenLastCalledWith('pool');
  });

  it('leaves modified clicks (new tab) to the browser', () => {
    const { onNavigate } = renderBar();
    fireEvent.click(screen.getByRole('link', { name: 'Hash lab' }), { metaKey: true });
    expect(onNavigate).not.toHaveBeenCalled();
  });

  it('shows the virtual coin label and the chain status as text', () => {
    const { rerender } = renderBar();
    expect(screen.getByText('testCoin · virtual')).toBeTruthy();
    expect(screen.getByText('Chain valid')).toBeTruthy();
    rerender(<TopBar view="workbench" coinName="testCoin" chainValid={false} />);
    expect(screen.getByText('Chain invalid')).toBeTruthy();
    expect(screen.queryByText('Chain valid')).toBeNull();
  });
});

describe('overflow menu', () => {
  it('opens with focus on the first item, closes on Escape and returns focus to More', () => {
    renderBar();
    expect(more().getAttribute('aria-expanded')).toBe('false');
    fireEvent.click(more());
    expect(more().getAttribute('aria-expanded')).toBe('true');
    const reset = screen.getByRole('button', { name: 'Reset' });
    expect(document.activeElement).toBe(reset);

    fireEvent.keyDown(document.activeElement, { key: 'ArrowDown' });
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Settings' }));
    fireEvent.keyDown(document.activeElement, { key: 'ArrowUp' });
    expect(document.activeElement).toBe(reset);

    fireEvent.keyDown(document.activeElement, { key: 'Escape' });
    expect(screen.queryByRole('button', { name: 'Reset' })).toBeNull();
    expect(more().getAttribute('aria-expanded')).toBe('false');
    expect(document.activeElement).toBe(more());
  });

  it('runs Reset and Settings, closing the menu and returning focus', () => {
    const { onReset, onOpenSettings } = renderBar();
    fireEvent.click(more());
    fireEvent.click(screen.getByRole('button', { name: 'Reset' }));
    expect(onReset).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('group', { name: 'More' })).toBeNull();
    expect(document.activeElement).toBe(more());

    fireEvent.click(more());
    fireEvent.click(screen.getByRole('button', { name: 'Settings' }));
    expect(onOpenSettings).toHaveBeenCalledTimes(1);
    expect(document.activeElement).toBe(more());
  });

  it('toggles sound and theme and holds the usage-sharing control', () => {
    const { onMuted, onTheme, rerender } = renderBar();
    fireEvent.click(more());
    const sound = screen.getByRole('button', { name: /^Sound/ });
    expect(sound.getAttribute('aria-pressed')).toBe('true');
    fireEvent.click(sound);
    expect(onMuted).toHaveBeenCalledWith(true);
    fireEvent.click(screen.getByRole('button', { name: 'Light theme' }));
    expect(onTheme).toHaveBeenCalledWith('light');
    const menu = screen.getByRole('group', { name: 'More' });
    expect(within(menu).getByText(/^Usage sharing:/)).toBeTruthy();

    rerender(<TopBar view="workbench" theme="light" muted onMuted={onMuted} onTheme={onTheme} />);
    expect(screen.getByRole('button', { name: /^Sound/ }).getAttribute('aria-pressed')).toBe('false');
    fireEvent.click(screen.getByRole('button', { name: /^Sound/ }));
    expect(onMuted).toHaveBeenLastCalledWith(false);
    fireEvent.click(screen.getByRole('button', { name: 'Dark theme' }));
    expect(onTheme).toHaveBeenLastCalledWith('dark');
  });

  it('closes when the pointer goes down outside', () => {
    renderBar();
    fireEvent.click(more());
    fireEvent.pointerDown(document.body);
    expect(screen.queryByRole('button', { name: 'Reset' })).toBeNull();
  });
});

describe('compact (below 768 px)', () => {
  it('moves the tabs into the menu', () => {
    const { onNavigate } = renderBar({ compact: true, view: 'pool' });
    expect(screen.queryByRole('navigation')).toBeNull();
    expect(screen.queryByText('testCoin · virtual')).toBeNull();
    const menuButton = screen.getByRole('button', { name: 'Menu' });
    fireEvent.click(menuButton);
    const nav = screen.getByRole('navigation', { name: 'Main' });
    expect(within(nav).getByRole('link', { name: 'Leaderboard' }).getAttribute('aria-current')).toBe('page');
    expect(document.activeElement).toBe(within(nav).getByRole('link', { name: 'Workbench' }));
    fireEvent.click(within(nav).getByRole('link', { name: 'Hash lab' }));
    expect(onNavigate).toHaveBeenCalledWith('hash-lab');
    expect(screen.queryByRole('navigation')).toBeNull();
    expect(document.activeElement).toBe(menuButton);
  });
});
