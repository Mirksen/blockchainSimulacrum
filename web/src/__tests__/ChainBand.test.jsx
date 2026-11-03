// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ChainBand } from '../components/workbench/ChainBand';
import { buildBlockViews } from '../components/workbench/blockView';

// Synthetic chain: Genesis + mined blocks, two miners, deterministic timestamps.
const T0 = Date.parse('2026-01-02T12:00:00Z') / 1000;
const people = [{ name: 'Lars', scriptPubKey: 'pk-lars' }, { name: 'Minas', scriptPubKey: 'pk-minas' }];
const hashOf = i => (i === 0 ? 'a1'.padEnd(64, 'f') : `00${String(i).padStart(2, '0')}`.padEnd(62, 'c') + String(i).padStart(2, '0'));
const NOW2 = '7c41e235e2f72f5e4541c5f66eec0ce5e06e28d53ef19595758471564a74a5b0';

function makeViews(count = 5, statuses = {}) {
  const blocks = Array.from({ length: count }, (_, i) => ({
    hash: hashOf(i), previousHash: i ? hashOf(i - 1) : '0', difficulty: i ? 2 : 0, time: T0 + i * 2,
    transactions: i ? [{ isCoinbase: true, outputs: [{ scriptPubKey: i % 2 ? 'pk-minas' : 'pk-lars' }] }] : []
  }));
  const blockStatus = blocks.map((b, i) => {
    const base = { index: i, storedHash: b.hash, computedHash: b.hash, hashMatches: true, meetsTarget: true, linkIntact: true, signaturesValid: true, status: 'valid' };
    const status = statuses[i];
    if (status === 'hash-mismatch') return { ...base, computedHash: NOW2, hashMatches: false, status };
    if (status === 'link-broken') return { ...base, linkIntact: false, status };
    if (status) return { ...base, status };
    return base;
  });
  const tamperedEdits = Object.entries(statuses).filter(([, s]) => s === 'hash-mismatch').map(([i]) => ({ blockIndex: Number(i), txIndex: 0, from: 1.5, to: 2 }));
  return buildBlockViews({ blocks, blockStatus, participants: people, tamperedEdits });
}
const keyFigures = { avgSeconds: 3.875, targetSeconds: 10, difficulty: 2, reward: 1.5625, nextHalving: 8 };
const TAMPERED = { 2: 'hash-mismatch', 3: 'built-on-broken', 4: 'built-on-broken' };

function renderBand(props = {}) {
  const views = props.views ?? makeViews();
  const handlers = { onSelect: vi.fn(), onToggleHealth: vi.fn() };
  const utils = render(
    <ChainBand views={views} candidate={{ index: views.length, txCount: 2, state: 'idle' }} selectedIndex={views.length - 1}
      keyFigures={keyFigures} healthOpen={false} coach={null} repairOrder={[]} {...handlers} {...props} />
  );
  return { ...utils, ...handlers, views };
}
const tile = index => screen.getByRole('button', { name: new RegExp(`^(Genesis block|Block) ${index}\\b`) });

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe('ChainBand tiles and selection', () => {
  it('reads left to right from Genesis to the newest block, then the candidate', () => {
    const { container } = renderBand();
    // The block number sits above each tile, outside its button.
    const numbers = [...container.querySelectorAll('.chain-band-tile > .chain-band-num')].map(num => num.textContent);
    expect(numbers).toEqual(['#0', '#1', '#2', '#3', '#4']);
    expect([...container.querySelectorAll('.chain-band-tile-face .chain-band-num')]).toHaveLength(0);
    const candidate = screen.getByRole('group', { name: 'Candidate block 5, not mined yet, 2 transactions waiting' });
    expect(candidate.querySelector('.chain-band-num').textContent).toBe('#5');
    expect(within(candidate).getByText('next')).toBeTruthy();
    expect(within(candidate).getByText('Mine it below')).toBeTruthy();
    expect(container.querySelector('.chain-band-tile.is-newest > .chain-band-num').textContent).toBe('#4');
    expect(tile(4).getAttribute('aria-pressed')).toBe('true');
    expect(tile(2).getAttribute('aria-pressed')).toBe('false');
    expect(tile(2).textContent).toContain('0002cc…02');
  });

  it('shows how long ago each block was mined in its bottom line, in minutes at the finest', () => {
    vi.useFakeTimers();
    try {
      // Blocks were mined at T0, T0 + 2 s, …, T0 + 8 s. The shared clock ticks every 5 s,
      // so one tick after rendering at T0 + 10 s it is T0 + 15 s.
      vi.setSystemTime((T0 + 10) * 1000);
      const { container } = renderBand();
      act(() => { vi.advanceTimersByTime(5000); });
      const ages = () => [...container.querySelectorAll('.chain-band-tile-face .chain-band-age')].map(age => age.textContent);
      expect(ages()).toEqual(['just now', 'just now', 'just now', 'just now', 'just now']);
      // The age sits in the bottom line beside the hash, never in the top row.
      expect(container.querySelectorAll('.chain-band-tile-foot .chain-band-age')).toHaveLength(5);
      expect(container.querySelectorAll('.chain-band-tile-top .chain-band-age')).toHaveLength(0);
      // T0 + 65 s: blocks #0 to #2 are a minute old, #3 (59 s) and #4 (57 s) are not.
      act(() => { vi.advanceTimersByTime(50000); });
      expect(ages()).toEqual(['1 min ago', '1 min ago', '1 min ago', 'just now', 'just now']);
      // One second later #3 is 60 s old, but the clock does not tick before T0 + 70 s.
      act(() => { vi.advanceTimersByTime(1000); });
      expect(ages()).toEqual(['1 min ago', '1 min ago', '1 min ago', 'just now', 'just now']);
      act(() => { vi.advanceTimersByTime(4000); });
      expect(ages()).toEqual(['1 min ago', '1 min ago', '1 min ago', '1 min ago', '1 min ago']);
    } finally {
      vi.useRealTimers();
    }
  });

  it('shows the age instead of "meets" on a valid tile, and the zeros on a hash mismatch', () => {
    const { container } = renderBand({ views: makeViews(5, TAMPERED) });
    container.querySelectorAll('.chain-band-tile-face').forEach(face => expect(face.textContent).not.toMatch(/meets/));
    const foot = index => tile(index).querySelector('.chain-band-tile-foot');
    expect(foot(1).querySelector('.chain-band-age')).toBeTruthy();
    expect(foot(1).querySelector('.chain-band-meets')).toBeNull();
    expect(foot(2).querySelector('.chain-band-age')).toBeNull();
    expect(foot(2).querySelector('.chain-band-meets.is-bad').textContent).toBe('0/2 zeros');
  });

  it('has no hint text in the header', () => {
    const { container } = renderBand();
    const header = container.querySelector('.chain-band-header');
    expect(header.querySelector('h2').textContent).toBe('Chain');
    expect(header.querySelector('.chain-band-hint')).toBeNull();
    expect(header.textContent).not.toMatch(/click a block|hover for the full hash/);
  });

  it('selects a block on click', () => {
    const { onSelect } = renderBand();
    fireEvent.click(tile(2));
    expect(onSelect).toHaveBeenCalledWith(2);
  });

  it('shows the key figures in the header', () => {
    renderBand();
    const figures = screen.getByLabelText('Key figures');
    expect(figures.textContent.replace(/\s+/g, ' ')).toBe('avg 3.9 s / target 10 s·difficulty 2·reward 1.5625·next halving #8');
  });

  it('marks the candidate while mining and while paused', () => {
    const views = makeViews();
    const { rerender } = renderBand({ views, candidate: { index: 5, txCount: 2, state: 'mining', elapsedMs: 3400, attempts: 148 } });
    const mining = screen.getByRole('group', { name: /being mined for 3.4 seconds, 2 transactions, 148 tries/ });
    expect(mining.className).toContain('is-mining');
    expect(within(mining).getByText('148')).toBeTruthy();
    rerender(<ChainBand views={views} candidate={{ index: 5, txCount: 2, state: 'paused' }} keyFigures={keyFigures} />);
    expect(screen.getByRole('group', { name: /paused while the chain is invalid/ }).textContent).toContain('Repair below');
  });
});

describe('ChainBand statuses and links', () => {
  it('shows the broken block with its new hash and the struck stored hash, descendants amber, re-mine order', () => {
    const { container } = renderBand({ views: makeViews(5, TAMPERED), selectedIndex: 2, repairOrder: [2, 3, 4] });
    const broken = container.querySelector('.chain-band-tile.is-broken');
    expect(broken.textContent).toContain('Hash mismatch');
    expect(broken.textContent).toContain('7c41e2…b0');
    expect(broken.textContent).toContain('0/2 zeros');
    expect(broken.querySelector('s').textContent).toBe('0002cc…02');
    expect(broken.querySelector('.chain-band-order.is-next').textContent).toBe('1');
    const dependents = container.querySelectorAll('.chain-band-tile.is-dependent');
    expect(dependents).toHaveLength(2);
    dependents.forEach(element => expect(element.textContent).toContain('Built on a broken block'));
    expect(tile(3).getAttribute('aria-label')).toBe('Block 3, built on a broken block, re-mine second, hash 0003cc…03');
    expect(screen.getByLabelText(/^Link unchanged: block 3 still stores 0002cc…02/)).toBeTruthy();
    expect(screen.getByLabelText('Link intact: block 4 stores the hash of block 3')).toBeTruthy();
  });

  it('shows signature-invalid and link-broken blocks in red with their words', () => {
    const { container } = renderBand({ views: makeViews(5, { 2: 'signature-invalid', 3: 'built-on-broken', 4: 'link-broken' }) });
    const broken = container.querySelectorAll('.chain-band-tile.is-broken');
    expect([...broken].map(element => element.dataset.status)).toEqual(['signature-invalid', 'link-broken']);
    expect(broken[0].textContent).toContain('Signature invalid');
    expect(broken[1].textContent).toContain('Link broken');
    expect(container.querySelector('.chain-band-link.is-broken').getAttribute('aria-label')).toBe('Link broken: block 4 does not store the hash of block 3');
  });

  it('explains every intact link with a tooltip', () => {
    const { container } = renderBand();
    const links = [...container.querySelectorAll('.chain-band-link')];
    expect(links).toHaveLength(5);
    expect(links.every(link => link.tabIndex === 0)).toBe(true);
    expect(links[2].querySelector('[role="tooltip"]').textContent).toBe('Link intact · #3 stores the hash of #2');
    expect(links[4].className).toContain('is-pending');
    expect(links[4].textContent).toBe('Not mined yet · #5 will store the hash of #4');
  });
});

describe('ChainBand health line', () => {
  it('summarises a valid chain in a pill that opens the checks', () => {
    const { container, onToggleHealth, rerender, views } = renderBand();
    expect(screen.getByRole('status').textContent).toBe('Chain valid');
    const pill = within(screen.getByRole('status')).getByRole('button', { name: 'Chain valid' });
    expect(pill.getAttribute('aria-expanded')).toBe('false');
    // Closed: no check line, no strip, and no separate show/hide control.
    expect(container.querySelector('.chain-band-health-text')).toBeNull();
    expect(screen.queryByRole('list', { name: 'Checks per block' })).toBeNull();
    expect(screen.queryByRole('button', { name: /checks/i })).toBeNull();
    fireEvent.click(pill);
    expect(onToggleHealth).toHaveBeenCalledTimes(1);
    rerender(<ChainBand views={views} candidate={{ index: 5, txCount: 2, state: 'idle' }} keyFigures={keyFigures} healthOpen onToggleHealth={onToggleHealth} />);
    const open = screen.getByRole('button', { name: 'Chain valid' });
    expect(open.getAttribute('aria-expanded')).toBe('true');
    expect(container.querySelector('.chain-band-health-text').textContent.replace(/\s+/g, ' ')).toBe('4 of 4 hashes start with 00·4 of 4 links intact');
    const strip = screen.getByRole('list', { name: 'Checks per block' });
    expect(open.getAttribute('aria-controls')).toBe(strip.id);
    const cells = within(strip).getAllByRole('listitem');
    expect(cells.map(cell => cell.getAttribute('aria-label'))).toContain('Block 2: hash starts with 00, link to block 1 intact');
    expect(cells.at(-1).getAttribute('aria-label')).toBe('Block 5: not mined yet');
    expect(screen.queryByRole('button', { name: /checks/i })).toBeNull();
  });

  it('names the cause when the chain is invalid', () => {
    const { container } = renderBand({ views: makeViews(5, TAMPERED), healthOpen: true });
    expect(screen.getByRole('status').textContent).toBe('Chain invalid');
    expect(screen.getByRole('button', { name: 'Chain invalid' }).getAttribute('aria-expanded')).toBe('true');
    expect(container.querySelector('.chain-band-health-text').textContent.replace(/\s+/g, ' '))
      .toBe('3 of 4 hashes start with 00·#2 changed after mining; #3 and #4 are unchanged but built on it');
    const cells = within(screen.getByRole('list', { name: 'Checks per block' })).getAllByRole('listitem');
    const byLabel = label => cells.find(cell => cell.getAttribute('aria-label').startsWith(label));
    expect(byLabel('Block 2:').textContent).toContain('#2 · hash mismatch');
    expect(byLabel('Block 3:').textContent).toContain('Built on a broken block');
    expect(byLabel('Block 3:').textContent).toContain('link unchanged');
    expect(byLabel('Block 4:').textContent).toContain('link intact');
  });

  it('keeps the invalid pill closed until it is clicked', () => {
    const { container } = renderBand({ views: makeViews(5, TAMPERED) });
    expect(screen.getByRole('status').textContent).toBe('Chain invalid');
    expect(screen.getByRole('button', { name: 'Chain invalid' }).getAttribute('aria-expanded')).toBe('false');
    expect(container.querySelector('.chain-band-health-text')).toBeNull();
    expect(screen.queryByRole('list', { name: 'Checks per block' })).toBeNull();
  });
});

describe('ChainBand full-hash tooltip', () => {
  it('copies the full hash without selecting the block', async () => {
    const writeText = vi.fn(() => Promise.resolve());
    vi.stubGlobal('navigator', { ...navigator, clipboard: { writeText } });
    const { onSelect } = renderBand();
    const copy = screen.getByRole('button', { name: 'Copy full hash of block 2' });
    expect(copy.closest('[role="tooltip"]').textContent).toContain('Starts with 00 · prev = hash of #1');
    expect(tile(2).getAttribute('aria-describedby')).toBe(copy.closest('[role="tooltip"]').id);
    await act(async () => { fireEvent.click(copy); });
    expect(writeText).toHaveBeenCalledWith(hashOf(2));
    expect(copy.textContent).toBe('Copied');
    expect(onSelect).not.toHaveBeenCalled();
  });

  it('copies the hash as it is now for a changed block and shows both', async () => {
    const writeText = vi.fn(() => Promise.resolve());
    vi.stubGlobal('navigator', { ...navigator, clipboard: { writeText } });
    renderBand({ views: makeViews(5, TAMPERED) });
    const copy = screen.getByRole('button', { name: 'Copy full hash of block 2' });
    const tip = copy.closest('[role="tooltip"]');
    expect(tip.textContent).toContain('Now');
    expect(tip.textContent).toContain('As mined');
    expect(tip.textContent).toContain('Your edit: tx 1: 1.5 → 2');
    await act(async () => { fireEvent.click(copy); });
    expect(writeText).toHaveBeenCalledWith(NOW2);
  });

  it('stays quiet without a clipboard', async () => {
    vi.stubGlobal('navigator', { ...navigator, clipboard: undefined });
    renderBand();
    const copy = screen.getByRole('button', { name: 'Copy full hash of block 1' });
    await act(async () => { fireEvent.click(copy); });
    expect(copy.textContent).toBe('Copy');
  });
});

describe('ChainBand scrolling row', () => {
  const row = container => [...container.querySelectorAll('.chain-band-scroll > .chain-band-row:not(.chain-band-strip) > .chain-band-item')];
  const pagingButton = () => screen.queryByRole('button', { name: /earlier|newer|oldest/i });

  it('has no paging controls for a short chain', () => {
    renderBand({ views: makeViews(3) });
    expect(pagingButton()).toBeNull();
  });

  it('renders every block and the candidate in one row without paging controls', () => {
    const { container } = renderBand({ views: makeViews(12) });
    expect(pagingButton()).toBeNull();
    const items = row(container);
    expect(items).toHaveLength(13);
    expect(items.slice(0, 12).map(item => item.querySelector('.chain-band-tile > .chain-band-num').textContent))
      .toEqual(Array.from({ length: 12 }, (_, i) => `#${i}`));
    expect(items.at(-1).querySelector('[role="group"]').getAttribute('aria-label')).toMatch(/^Candidate block 12/);
    expect(items.every(item => ![...item.classList].some(cls => cls.startsWith('is-hidden')))).toBe(true);
    expect(container.querySelector('.chain-band').className).not.toMatch(/has-earlier/);
    expect(container.querySelectorAll('.chain-band-scroll')).toHaveLength(1);
  });

  describe('following the newest block', () => {
    let scrollTo;
    beforeEach(() => {
      scrollTo = vi.fn();
      HTMLElement.prototype.scrollTo = scrollTo;
    });
    afterEach(() => { delete HTMLElement.prototype.scrollTo; });

    it('holds a pinned block when the chain grows and returns to the newest when it is let go', () => {
      const { rerender } = render(<ChainBand views={makeViews(12)} selectedIndex={3} pinned />);
      rerender(<ChainBand views={makeViews(13)} selectedIndex={3} pinned />);
      expect(scrollTo).not.toHaveBeenCalled();
      rerender(<ChainBand views={makeViews(13)} selectedIndex={12} pinned={false} />);
      expect(scrollTo).toHaveBeenCalledWith({ left: expect.any(Number), behavior: 'smooth' });
    });

    it('scrolls a new block into view only while the row sits at its end', () => {
      const { container, rerender } = render(<ChainBand views={makeViews(12)} selectedIndex={11} pinned={false} />);
      scrollTo.mockClear();
      rerender(<ChainBand views={makeViews(13)} selectedIndex={12} pinned={false} />);
      expect(scrollTo).toHaveBeenCalledTimes(1);
      expect(scrollTo).toHaveBeenLastCalledWith({ left: expect.any(Number), behavior: 'smooth' });
      // The learner scrolls left, away from the end: the next block no longer pulls the row.
      const scroller = container.querySelector('.chain-band-scroll');
      Object.defineProperty(scroller, 'scrollLeft', { configurable: true, value: 0 });
      Object.defineProperty(scroller, 'clientWidth', { configurable: true, value: 600 });
      Object.defineProperty(scroller, 'scrollWidth', { configurable: true, value: 2400 });
      fireEvent.wheel(scroller, { deltaX: -1800 });
      fireEvent.scroll(scroller);
      scrollTo.mockClear();
      rerender(<ChainBand views={makeViews(14)} selectedIndex={13} pinned={false} />);
      expect(scrollTo).not.toHaveBeenCalled();
      // Back at the end, it follows again.
      Object.defineProperty(scroller, 'scrollLeft', { configurable: true, value: 1800 });
      fireEvent.scroll(scroller);
      rerender(<ChainBand views={makeViews(15)} selectedIndex={14} pinned={false} />);
      expect(scrollTo).toHaveBeenCalledWith({ left: 2400, behavior: 'smooth' });
    });

    it('keeps following while its own smooth scroll is still on the way', () => {
      const { container, rerender } = render(<ChainBand views={makeViews(12)} selectedIndex={11} pinned={false} />);
      const scroller = container.querySelector('.chain-band-scroll');
      Object.defineProperty(scroller, 'clientWidth', { configurable: true, value: 600 });
      Object.defineProperty(scroller, 'scrollWidth', { configurable: true, value: 2400 });
      rerender(<ChainBand views={makeViews(13)} selectedIndex={12} pinned={false} />);
      // Halfway through the smooth scroll the row is not at its end yet, and no one touched it.
      Object.defineProperty(scroller, 'scrollLeft', { configurable: true, value: 900 });
      fireEvent.scroll(scroller);
      scrollTo.mockClear();
      rerender(<ChainBand views={makeViews(14)} selectedIndex={13} pinned={false} />);
      expect(scrollTo).toHaveBeenCalledWith({ left: 2400, behavior: 'smooth' });
    });
  });
});

describe('ChainBand selection', () => {
  it('frames a held block strongly and the followed newest quietly', () => {
    const { container, rerender } = render(<ChainBand views={makeViews(3)} selectedIndex={2} pinned={false} />);
    const tile = () => container.querySelectorAll('.chain-band-tile')[2];
    expect(tile().className).toContain('is-current');
    expect(tile().querySelector('button').getAttribute('aria-pressed')).toBe('false');
    rerender(<ChainBand views={makeViews(3)} selectedIndex={2} pinned />);
    expect(tile().className).toContain('is-selected');
    expect(tile().querySelector('button').getAttribute('aria-pressed')).toBe('true');
  });
});
