// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { MinerDrawer, ZeroHistogram } from '../components/workbench/MinerDetails';
import { duration, expectedAttempts } from '../components/workbench/minerDetailsModel';

afterEach(cleanup);

const miners = [{ name: 'Hal', hashpower: 60, publicKey: 'synthetic-key-hal' }, { name: 'Dorian', hashpower: 20 }, { name: 'Laszlo', hashpower: 20 }];
// 76 synthetic header bytes: version 2, previous hash and merkle root of repeated bytes, time, bits.
const HEADER = `02000000${'11'.repeat(32)}${'22'.repeat(32)}00e1f505ffff0f20`;
const progress = {
  nonce: 4242, hash: '0f00aa', iterations: 3000, elapsedMs: 1500, header: HEADER,
  stream: [{ nonce: 4241, hash: '0a00bb', zeros: 1 }, { nonce: 4242, hash: '00f0aa', zeros: 2 }],
  best: { nonce: 17, hash: '000abc', zeros: 3 }, zeroCounts: [2800, 180, 18, 2, 0, 0, 0, 0, 0]
};
const drawer = (props = {}) => render(<MinerDrawer miner={miners[0]} miners={miners} progress={progress} difficulty={3}
  isMining winner={null} luck={{ races: 0, perMiner: {} }} slowMotion={false} onSlowMotion={vi.fn()} onShare={vi.fn()}
  onOpenForkLab={vi.fn()} onClose={vi.fn()} {...props} />);

describe('MinerDrawer', () => {
  it('shows the share, the rate and what a block takes alone', () => {
    drawer();
    const aside = screen.getByRole('complementary', { name: 'Hal' });
    expect(within(aside).getByRole('slider', { name: "Hal's share of the hashpower" }).value).toBe('60');
    expect(aside.textContent).toContain('Takes from the others in proportion: Dorian 20 % · Laszlo 20 %');
    // 3,000 attempts in 1.5 s; difficulty 3 needs 4,096 attempts on average.
    expect(aside.textContent).toContain('Attempts per second2,000');
    expect(aside.textContent).toContain('Chance for the next block60 %');
    expect(aside.textContent).toContain('Alone, a block takes about2.0 s');
    expect(document.activeElement).toBe(within(aside).getByRole('button', { name: 'Close miner details' }));
  });

  it('lists the newest attempts first and freezes them while the race goes on', () => {
    const { rerender } = drawer();
    const rows = () => within(screen.getByRole('table', { name: 'Newest attempts of Hal' })).getAllByRole('row').slice(1).map(row => row.textContent);
    expect(rows()).toEqual(['4,24200f0aa2', '4,2410a00bb1']);
    fireEvent.click(screen.getByRole('button', { name: 'Freeze' }));
    const later = { ...progress, stream: [...progress.stream, { nonce: 4243, hash: 'ffffff', zeros: 0 }] };
    const props = { miner: miners[0], miners, difficulty: 3, isMining: true, luck: { races: 0, perMiner: {} }, onClose: vi.fn() };
    rerender(<MinerDrawer {...props} progress={later} />);
    expect(rows()).toEqual(['4,24200f0aa2', '4,2410a00bb1']);
    fireEvent.click(screen.getByRole('button', { name: 'Resume' }));
    expect(rows()[0]).toBe('4,243ffffff0');
  });

  it('switches slow motion for the whole race', () => {
    const onSlowMotion = vi.fn();
    const { rerender } = drawer({ onSlowMotion });
    fireEvent.click(screen.getByRole('button', { name: 'Slow motion' }));
    expect(onSlowMotion).toHaveBeenCalledWith(true);
    rerender(<MinerDrawer miner={miners[0]} miners={miners} progress={progress} difficulty={3} isMining slowMotion onSlowMotion={onSlowMotion} onClose={vi.fn()} />);
    expect(screen.getByRole('button', { name: 'Slow motion' }).getAttribute('aria-pressed')).toBe('true');
    const step = document.querySelector('.miner-slow').textContent;
    expect(step).toContain('Nonce 4,242 → header → SHA-256 twice → 00f0aa…');
    expect(step).toContain('2 of 3 zeros, too large. Next nonce.');
    // 4,096 attempts at 4 per second.
    expect(screen.getByText(/At 4 tries per second a block takes about 17\.1 min\. It speeds up again when you close this view or the block is found\./)).toBeTruthy();
  });

  it('points a majority miner to Competing branches', () => {
    const onOpenForkLab = vi.fn();
    drawer({ onOpenForkLab });
    fireEvent.click(screen.getByRole('button', { name: /Majority: it could rewrite the chain/ }));
    expect(onOpenForkLab).toHaveBeenCalledTimes(1);
    cleanup();
    drawer({ miner: miners[1] });
    expect(screen.queryByRole('button', { name: /Majority/ })).toBeNull();
  });

  it('shows luck only after five races of this session', () => {
    drawer({ luck: { races: 4, perMiner: { 'synthetic-key-hal': { won: 3, expected: 2.4 } } } });
    expect(screen.getByText(/Luck shows after 5 races this session \(4 so far\)/)).toBeTruthy();
    cleanup();
    drawer({ luck: { races: 5, perMiner: { 'synthetic-key-hal': { won: 4, expected: 3 } } } });
    expect(screen.getByRole('img', { name: '4 blocks won, 3.0 expected' })).toBeTruthy();
  });

  it('shows the header it hashes with the current nonce and the best hash of the round', () => {
    drawer();
    const header = screen.getByText('What it hashes').closest('section');
    expect(header.textContent).toContain('Previous hash1111111111111111…');
    expect(header.textContent).toContain('Bits0x200fffff · 3 zeros');
    expect(header.textContent).toContain('Nonce4,242');
    expect(screen.getByText('Best hash this round').closest('section').textContent).toContain('nonce 17 · 3 zeros · the smallest of 3,000 attempts');
  });

  it('closes with Escape or Close and explains a switched-off miner', () => {
    const onClose = vi.fn();
    drawer({ onClose, miners: miners.slice(1) });
    expect(screen.getByText(/Hal is switched off and does not race/)).toBeTruthy();
    expect(screen.queryByRole('slider')).toBeNull();
    fireEvent.keyDown(screen.getByRole('complementary'), { key: 'Escape' });
    fireEvent.click(screen.getByRole('button', { name: 'Close miner details' }));
    expect(onClose).toHaveBeenCalledTimes(2);
  });
});

describe('ZeroHistogram', () => {
  it('compares the counts with what chance predicts, the last bucket holding the rest', () => {
    render(<ZeroHistogram counts={[1500, 90, 8, 1, 1, 0, 0, 0, 0]} difficulty={3} />);
    expect(screen.getByRole('img').getAttribute('aria-label')).toBe(
      'Attempts by leading zeros: 0 zeros 1,500, expected 1,500; 1 zeros 90, expected 94; 2 zeros 8, expected 6; 3+ zeros 2, expected 0');
  });
});

describe('miner figures', () => {
  it('expects 16 times more attempts per zero, from the target the difficulty sets', () => {
    expect(expectedAttempts(1)).toBe(16);
    expect(expectedAttempts(3)).toBe(4096);
    expect(expectedAttempts(4)).toBe(65537);
  });
  it('says a duration in seconds, minutes, hours or days', () => {
    expect([duration(2.18), duration(75), duration(600), duration(7200), duration(400000), duration(Infinity)])
      .toEqual(['2.2 s', '75 s', '10.0 min', '2.0 h', '5 days', '–']);
  });
});
