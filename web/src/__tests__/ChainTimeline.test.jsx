// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ChainTimeline } from '../components/workbench/ChainTimeline';
import { buildBlockViews } from '../components/workbench/blockView';

const T0 = Date.parse('2026-01-02T12:00:00Z');
const people = [{ name: 'Lars', publicKey: 'pk-lars' }, { name: 'Minas', publicKey: 'pk-minas' }];
const hashOf = i => (i === 0 ? 'a1'.padEnd(64, 'f') : `00${String(i).padStart(2, '0')}`.padEnd(62, 'c') + String(i).padStart(2, '0'));
const NOW2 = '7c41e235e2f72f5e4541c5f66eec0ce5e06e28d53ef19595758471564a74a5b0';

function makeViews(statuses = {}) {
  const blocks = Array.from({ length: 5 }, (_, i) => ({
    hash: hashOf(i), previousHash: i ? hashOf(i - 1) : '0', difficulty: i ? 2 : 0, timestamp: T0 + i * 1500,
    transactions: i ? [{ sender: null, recipient: i % 2 ? 'pk-minas' : 'pk-lars' }] : []
  }));
  const blockStatus = blocks.map((b, i) => {
    const base = { index: i, storedHash: b.hash, computedHash: b.hash, hashMatches: true, meetsTarget: true, linkIntact: true, signaturesValid: true, status: 'valid' };
    if (statuses[i] === 'hash-mismatch') return { ...base, computedHash: NOW2, hashMatches: false, status: 'hash-mismatch' };
    return statuses[i] ? { ...base, status: statuses[i] } : base;
  });
  return buildBlockViews({ blocks, blockStatus, participants: people, tamperedEdits: [] });
}
const keyFigures = { avgSeconds: 3.875, targetSeconds: 10, difficulty: 2, reward: 1.5625, nextHalving: 8 };

function renderTimeline(props = {}) {
  const handlers = { onSelect: vi.fn(), onToggleHealth: vi.fn(), onOpenChainLab: vi.fn() };
  const utils = render(
    <ChainTimeline views={makeViews()} candidate={{ index: 5, txCount: 2, state: 'idle' }} selectedIndex={4} keyFigures={keyFigures}
      healthOpen={false} coach={null} repairOrder={[]} {...handlers} {...props} />
  );
  return { ...utils, ...handlers };
}
const row = index => screen.getByRole('button', { name: new RegExp(`^Block ${index}\\b`) });

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe('ChainTimeline', () => {
  it('lists the candidate first, then the blocks newest on top', () => {
    const { container } = renderTimeline();
    const rows = [...container.querySelectorAll('.chain-timeline-row')];
    expect(rows[0].className).toContain('is-cand');
    expect(rows.slice(1).map(element => element.querySelector('.chain-timeline-n').textContent)).toEqual(['#4', '#3', '#2', '#1', '#0']);
    expect(screen.getByRole('group', { name: 'Candidate block 5, not mined yet, 2 transactions waiting' }).textContent).toContain('Mine below');
    expect(row(4).getAttribute('aria-pressed')).toBe('true');
    expect(row(3).getAttribute('aria-label')).toBe('Block 3, Minas, 1 tx, 1.5 s, hash 0003cc…03, link to block 2 intact');
  });

  it('expands a tapped row with the full hash, Copy and Open in Chain lab, and selects it', async () => {
    const writeText = vi.fn(() => Promise.resolve());
    vi.stubGlobal('navigator', { ...navigator, clipboard: { writeText } });
    const { onSelect, onOpenChainLab } = renderTimeline();
    expect(row(2).getAttribute('aria-expanded')).toBe('false');
    fireEvent.click(row(2));
    expect(onSelect).toHaveBeenCalledWith(2);
    expect(row(2).getAttribute('aria-expanded')).toBe('true');
    const details = document.getElementById(row(2).getAttribute('aria-controls'));
    expect(details.textContent).toContain(hashOf(2).slice(0, 32));
    expect(details.textContent).toContain('Starts with 00 · link intact to #1');
    await act(async () => { fireEvent.click(within(details).getByRole('button', { name: 'Copy full hash of block 2' })); });
    expect(writeText).toHaveBeenCalledWith(hashOf(2));
    fireEvent.click(within(details).getByRole('button', { name: 'Open in Chain lab' }));
    expect(onOpenChainLab).toHaveBeenCalledWith(2);
    fireEvent.click(row(2));
    expect(row(2).getAttribute('aria-expanded')).toBe('false');
  });

  it('names invalid blocks in their rows and shows re-mine order', () => {
    const { container } = renderTimeline({ views: makeViews({ 2: 'hash-mismatch', 3: 'built-on-broken', 4: 'built-on-broken' }), candidate: { index: 5, txCount: 2, state: 'paused' }, repairOrder: [2, 3, 4] });
    expect(row(2).textContent).toContain('Hash mismatch');
    expect(row(2).textContent).toContain('7c41e2…b0');
    expect(row(3).textContent).toContain('Built on a broken block');
    expect(row(2).querySelector('.chain-timeline-order.is-next').textContent).toBe('1');
    expect(container.querySelector('.chain-timeline-row.is-link-dependent .chain-timeline-n').textContent).toBe('#3');
    expect(screen.getByRole('group', { name: /paused while the chain is invalid/ })).toBeTruthy();
  });

  it('shows the health line, the checks in timeline order and the key figures', () => {
    const { onToggleHealth, rerender } = renderTimeline();
    expect(screen.getByRole('status').textContent.replace(/\s+/g, ' ')).toBe('Chain valid·4/4 start 00·4/4 links');
    fireEvent.click(screen.getByRole('button', { name: 'Show checks' }));
    expect(onToggleHealth).toHaveBeenCalledTimes(1);
    rerender(<ChainTimeline views={makeViews()} candidate={{ index: 5, txCount: 2, state: 'mining', elapsedMs: 3400, attempts: 148 }} keyFigures={keyFigures} healthOpen onToggleHealth={onToggleHealth} />);
    const cells = within(screen.getByRole('list', { name: 'Checks per block' })).getAllByRole('listitem');
    expect(cells.map(cell => cell.getAttribute('aria-label').split(':')[0])).toEqual(['Block 5', 'Block 4', 'Block 3', 'Block 2', 'Block 1', 'Block 0']);
    expect(cells[0].getAttribute('aria-label')).toBe('Block 5: being mined');
    expect(screen.getByLabelText('Key figures').textContent.replace(/\s+/g, ' ')).toBe('avg 3.9 s / target 10 s·difficulty 2·reward 1.5625·halving #8');
  });
});
