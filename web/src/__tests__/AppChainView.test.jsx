// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import App from '../App';

// Below 1024 px the chain shows as the compact band's row or as the vertical list;
// one button switches, and the browser remembers the choice (web/DESIGN.md, "Screen sizes").
vi.mock('../lib/sound', () => ({ unlockMiningAudio: vi.fn(async () => true), playMiningSuccessSound: vi.fn(), playRecordSound: vi.fn() }));
vi.mock('../components/workbench/LeaderboardTicker', () => ({ LeaderboardTicker: () => null }));

const KEY = 'proofofwork-chain-view';
const screenWidth = narrow => vi.stubGlobal('matchMedia', query => ({
  matches: narrow && query.includes('max-width: 1023.98px'), media: query,
  addEventListener: () => {}, removeEventListener: () => {}, addListener: () => {}, removeListener: () => {}
}));
const band = () => document.querySelector('.wb-band');

beforeEach(() => {
  localStorage.clear();
  history.replaceState(null, '', '/');
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe('chain view switch', () => {
  it('switches a phone between the sideways row and the vertical list, and remembers the list', () => {
    screenWidth(true);
    render(<App />);
    expect(band().querySelector('.chain-band.is-compact')).not.toBeNull();
    expect(band().className).not.toContain('is-list');

    fireEvent.click(screen.getByRole('button', { name: 'Show the blocks as a list' }));
    expect(band().querySelector('.chain-timeline')).not.toBeNull();
    expect(band().querySelector('.chain-band')).toBeNull();
    expect(band().className).toContain('is-list');
    expect(screen.getByRole('button', { name: /^Block 0, Genesis/ })).toBeTruthy();
    expect(localStorage.getItem(KEY)).toBe('list');

    cleanup();
    render(<App />);
    expect(band().querySelector('.chain-timeline')).not.toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Show the blocks as a row' }));
    expect(band().querySelector('.chain-band.is-compact')).not.toBeNull();
    expect(localStorage.getItem(KEY)).toBe('row');
  });

  it('keeps the full band without a switch on wide screens, even with the list remembered', () => {
    localStorage.setItem(KEY, 'list');
    screenWidth(false);
    render(<App />);
    expect(band().querySelector('.chain-band:not(.is-compact)')).not.toBeNull();
    expect(band().querySelector('.chain-timeline')).toBeNull();
    expect(screen.queryByRole('button', { name: /Show the blocks as a/ })).toBeNull();
  });
});
