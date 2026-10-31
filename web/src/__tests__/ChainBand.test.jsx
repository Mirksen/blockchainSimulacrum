// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
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
    const faces = [...container.querySelectorAll('.chain-band-tile-face')].map(face => face.querySelector('b').textContent);
    expect(faces).toEqual(['#0', '#1', '#2', '#3', '#4']);
    const candidate = screen.getByRole('group', { name: 'Candidate block 5, not mined yet, 2 transactions waiting' });
    expect(within(candidate).getByText('next')).toBeTruthy();
    expect(within(candidate).getByText('Mine it below')).toBeTruthy();
    expect(container.querySelector('.chain-band-tile.is-newest .chain-band-tile-face').textContent).toContain('#4');
    expect(tile(4).getAttribute('aria-pressed')).toBe('true');
    expect(tile(2).getAttribute('aria-pressed')).toBe('false');
    expect(tile(2).textContent).toContain('0002cc…02');
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
  it('summarises a valid chain and toggles the checks', () => {
    const { onToggleHealth, rerender, views } = renderBand();
    const line = screen.getByRole('status');
    expect(line.textContent.replace(/\s+/g, ' ')).toBe('Chain valid·4 of 4 hashes start with 00·4 of 4 links intact');
    const toggle = screen.getByRole('button', { name: 'Show checks' });
    expect(toggle.getAttribute('aria-expanded')).toBe('false');
    expect(screen.queryByRole('list', { name: 'Checks per block' })).toBeNull();
    fireEvent.click(toggle);
    expect(onToggleHealth).toHaveBeenCalledTimes(1);
    rerender(<ChainBand views={views} candidate={{ index: 5, txCount: 2, state: 'idle' }} keyFigures={keyFigures} healthOpen onToggleHealth={onToggleHealth} />);
    expect(screen.getByRole('button', { name: 'Hide checks' }).getAttribute('aria-expanded')).toBe('true');
    const cells = within(screen.getByRole('list', { name: 'Checks per block' })).getAllByRole('listitem');
    expect(cells.map(cell => cell.getAttribute('aria-label'))).toContain('Block 2: hash starts with 00, link to block 1 intact');
    expect(cells.at(-1).getAttribute('aria-label')).toBe('Block 5: not mined yet');
  });

  it('names the cause when the chain is invalid', () => {
    renderBand({ views: makeViews(5, TAMPERED), healthOpen: true });
    expect(screen.getByRole('status').textContent.replace(/\s+/g, ' '))
      .toBe('Chain invalid·3 of 4 hashes start with 00·#2 changed after mining; #3 and #4 are unchanged but built on it');
    const cells = within(screen.getByRole('list', { name: 'Checks per block' })).getAllByRole('listitem');
    const byLabel = label => cells.find(cell => cell.getAttribute('aria-label').startsWith(label));
    expect(byLabel('Block 2:').textContent).toContain('#2 · hash mismatch');
    expect(byLabel('Block 3:').textContent).toContain('Built on a broken block');
    expect(byLabel('Block 3:').textContent).toContain('link unchanged');
    expect(byLabel('Block 4:').textContent).toContain('link intact');
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

describe('ChainBand earlier blocks', () => {
  it('has no earlier control when every tier shows all blocks', () => {
    renderBand({ views: makeViews(3) });
    expect(screen.queryByRole('button', { name: /earlier/ })).toBeNull();
  });

  it('offers the earlier blocks per width tier and toggles them', () => {
    const { container } = renderBand({ views: makeViews(9) });
    const toggle = screen.getByRole('button', { name: /earlier/ });
    expect(toggle.getAttribute('aria-expanded')).toBe('false');
    expect(within(toggle).getByText('6 earlier').className).toBe('chain-band-tier-a');
    expect(within(toggle).getByText('5 earlier').className).toBe('chain-band-tier-b');
    expect(within(toggle).getByText('4 earlier').className).toBe('chain-band-tier-c');
    const items = [...container.querySelectorAll('.chain-band-row:not(.chain-band-strip) > .chain-band-item')];
    const hidden = tier => items.filter(item => item.classList.contains(`is-hidden-${tier}`)).length;
    expect([hidden('a'), hidden('b'), hidden('c')]).toEqual([6, 5, 4]);
    expect(container.querySelector('.chain-band').className).toContain('has-earlier-a');
    fireEvent.click(toggle);
    expect(toggle.getAttribute('aria-expanded')).toBe('true');
    expect(toggle.textContent).toContain('Hide earlier');
    expect(container.querySelector('.chain-band').className).toContain('is-all');
    fireEvent.click(toggle);
    expect(container.querySelector('.chain-band').className).not.toContain('is-all');
  });
});
