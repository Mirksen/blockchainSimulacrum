// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { TopBar } from '../components/workbench/TopBar';

afterEach(cleanup);

const renderBar = (props = {}) => {
  const handlers = {
    onNavigate: vi.fn(), onTheme: vi.fn(), onMuted: vi.fn(), onReset: vi.fn(), onOpenSettings: vi.fn(), onOpenStart: vi.fn(),
  };
  const utils = render(<TopBar view="workbench" coinName="testCoin" theme="dark" muted={false} {...handlers} {...props} />);
  return { ...utils, ...handlers };
};
const more = () => screen.getByRole('button', { name: 'More' });

describe('navigation', () => {
  it('marks the current view with aria-current and hands clicks to onNavigate', () => {
    const { onNavigate } = renderBar({ view: 'chain-lab' });
    const nav = screen.getByRole('navigation', { name: 'Main' });
    const links = within(nav).getAllByRole('link');
    expect(links.map(link => link.textContent)).toEqual(['Basics', 'Workbench', 'Hash lab', 'Chain lab', 'Leaderboard']);
    expect(within(nav).getByRole('link', { name: 'Chain lab' }).getAttribute('aria-current')).toBe('page');
    expect(links.filter(link => link.hasAttribute('aria-current'))).toHaveLength(1);
    expect(within(nav).getByRole('link', { name: 'Leaderboard' }).getAttribute('href')).toBe('#/pool');

    fireEvent.click(within(nav).getByRole('link', { name: 'Hash lab' }));
    expect(onNavigate).toHaveBeenCalledWith('hash-lab');
    fireEvent.click(within(nav).getByRole('link', { name: 'Leaderboard' }));
    expect(onNavigate).toHaveBeenLastCalledWith('pool');
  });

  it('leads with the Basics course', () => {
    const { onNavigate } = renderBar({ view: 'basics' });
    const nav = screen.getByRole('navigation', { name: 'Main' });
    const basics = within(nav).getAllByRole('link')[0];
    expect(basics.textContent).toBe('Basics');
    expect(basics.getAttribute('href')).toBe('#/basics');
    expect(basics.getAttribute('aria-current')).toBe('page');
    expect(basics.getAttribute('data-hint-title')).toBe('Basics');
    expect(basics.getAttribute('data-hint')).toContain('No prior knowledge needed.');
    fireEvent.click(within(nav).getByRole('link', { name: 'Workbench' }));
    expect(onNavigate).toHaveBeenLastCalledWith('workbench');
    fireEvent.click(basics);
    expect(onNavigate).toHaveBeenLastCalledWith('basics');
  });

  it('marks no tab on the start question', () => {
    renderBar({ view: 'start' });
    const nav = screen.getByRole('navigation', { name: 'Main' });
    expect(within(nav).getAllByRole('link').filter(link => link.hasAttribute('aria-current'))).toHaveLength(0);
  });

  it('leaves modified clicks (new tab) to the browser', () => {
    const { onNavigate } = renderBar();
    fireEvent.click(screen.getByRole('link', { name: 'Hash lab' }), { metaKey: true });
    expect(onNavigate).not.toHaveBeenCalled();
  });

  it('shows no chain status and keeps the virtual coin label inside the menu', () => {
    const { container } = renderBar();
    expect(screen.queryByText(/^Chain (valid|invalid)$/)).toBeNull();
    expect(container.querySelector('.top-bar-chain')).toBeNull();
    expect(screen.queryByText('testCoin · virtual')).toBeNull();
    fireEvent.click(more());
    const menu = screen.getByRole('group', { name: 'More' });
    expect(within(menu).getByText('testCoin · virtual').className).toBe('top-bar-menu-coin');
    expect(screen.getAllByText('testCoin · virtual')).toHaveLength(1);
  });
});

describe('saved chain note', () => {
  it.each([
    ['saved', 'Chain saved in this browser · Reset starts over'],
    ['too-large', 'Chain too long to save in this browser'],
    ['unavailable', 'This browser does not keep the chain']
  ])('names the save state %s under the coin', (saveState, text) => {
    renderBar({ saveState });
    expect(screen.queryByText(text)).toBeNull();
    fireEvent.click(more());
    const note = within(screen.getByRole('group', { name: 'More' })).getByText(text);
    expect(note.className).toBe('top-bar-menu-saved');
  });
  it('says nothing without a save state', () => {
    renderBar();
    fireEvent.click(more());
    expect(document.querySelector('.top-bar-menu-saved')).toBeNull();
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

  it('opens the start question from Starting point, closing the menu and returning focus', () => {
    const { onOpenStart, onOpenSettings } = renderBar();
    fireEvent.click(more());
    const item = screen.getByRole('button', { name: 'Starting point' });
    expect(item.getAttribute('data-hint-title')).toBe('Starting point');
    fireEvent.click(item);
    expect(onOpenStart).toHaveBeenCalledTimes(1);
    expect(onOpenSettings).not.toHaveBeenCalled();
    expect(screen.queryByRole('group', { name: 'More' })).toBeNull();
    expect(document.activeElement).toBe(more());
  });

  it('starts the workbench tour from Tour of the simulator, closing the menu and returning focus', () => {
    const onOpenTour = vi.fn();
    const { onOpenStart } = renderBar({ onOpenTour });
    fireEvent.click(more());
    const item = screen.getByRole('button', { name: 'Tour of the simulator' });
    expect(item.getAttribute('data-hint-title')).toBe('Tour of the simulator');
    expect(item.getAttribute('data-hint')).toContain('five-stop tour');
    fireEvent.click(item);
    expect(onOpenTour).toHaveBeenCalledTimes(1);
    expect(onOpenStart).not.toHaveBeenCalled();
    expect(screen.queryByRole('group', { name: 'More' })).toBeNull();
    expect(document.activeElement).toBe(more());
  });

  it('reaches Tour of the simulator with the arrow keys right after Starting point', () => {
    renderBar();
    fireEvent.click(more());
    for (let step = 0; step < 3; step++) fireEvent.keyDown(document.activeElement, { key: 'ArrowDown' });
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Tour of the simulator' }));
  });

  it('reaches Starting point with the arrow keys after Settings', () => {
    renderBar();
    fireEvent.click(more());
    fireEvent.keyDown(document.activeElement, { key: 'ArrowDown' });
    fireEvent.keyDown(document.activeElement, { key: 'ArrowDown' });
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Starting point' }));
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
    expect(within(nav).getAllByRole('link').map(link => link.textContent)).toEqual(['Basics', 'Workbench', 'Hash lab', 'Chain lab', 'Leaderboard']);
    expect(within(nav).getByRole('link', { name: 'Leaderboard' }).getAttribute('aria-current')).toBe('page');
    expect(document.activeElement).toBe(within(nav).getByRole('link', { name: 'Basics' }));
    fireEvent.click(within(nav).getByRole('link', { name: 'Hash lab' }));
    expect(onNavigate).toHaveBeenCalledWith('hash-lab');
    expect(screen.queryByRole('navigation')).toBeNull();
    expect(document.activeElement).toBe(menuButton);
  });

  it('names the virtual coin only inside the menu', () => {
    renderBar({ compact: true });
    expect(screen.queryByText('testCoin · virtual')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Menu' }));
    const menu = screen.getByRole('group', { name: 'Menu' });
    expect(within(menu).getByText('testCoin · virtual')).toBeTruthy();
  });
});
