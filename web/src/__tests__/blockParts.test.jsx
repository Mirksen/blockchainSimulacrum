// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  Avatar, CandidateCell, CopyButton, HashText, HealthCell, HealthLine, MinerMark, ShortHash
} from '../components/workbench/blockParts';
import { buildBlockViews, formatAmount, healthSummary, statusLabel, statusSentence } from '../components/workbench/blockView';

// Synthetic chain: Genesis + three mined blocks by two made-up miners, fixed timestamps.
const T0 = Date.parse('2026-01-02T12:00:00Z') / 1000;
const people = [{ name: 'Dana', scriptPubKey: 'pk-dana' }, { name: 'Alice', scriptPubKey: 'pk-alice', colorKey: 'alice' }];
const hashOf = i => (i === 0 ? 'b2'.padEnd(64, 'e') : `00${i}`.padEnd(64, 'd'));
const NOW = 'f'.repeat(64);

function makeViews(statuses = {}) {
  const blocks = Array.from({ length: 4 }, (_, i) => ({
    hash: hashOf(i), previousHash: i ? hashOf(i - 1) : '0', difficulty: i ? 2 : 0, time: T0 + i * 3,
    transactions: i ? [{ isCoinbase: true, outputs: [{ scriptPubKey: i % 2 ? 'pk-dana' : 'pk-alice' }] }] : []
  }));
  const blockStatus = blocks.map((b, i) => {
    const base = { storedHash: b.hash, computedHash: b.hash, hashMatches: true, meetsTarget: true, linkIntact: true, status: 'valid' };
    const status = statuses[i];
    if (status === 'hash-mismatch') return { ...base, computedHash: NOW, hashMatches: false, status };
    if (status === 'link-broken') return { ...base, linkIntact: false, status };
    return status ? { ...base, status } : base;
  });
  return buildBlockViews({ blocks, blockStatus, participants: people });
}

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe('CopyButton', () => {
  it('copies on the band with an icon and keeps the click to itself', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal('navigator', { clipboard: { writeText } });
    const outer = vi.fn();
    render(<div onClick={outer}><CopyButton text={NOW} label="Copy full hash of block 3" /></div>);
    const button = screen.getByRole('button', { name: 'Copy full hash of block 3' });
    expect(button.className).toBe('chain-band-copy');
    expect(button.querySelector('svg')).not.toBeNull();
    await act(async () => fireEvent.click(button));
    expect(writeText).toHaveBeenCalledExactlyOnceWith(NOW);
    expect(outer).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Copied' }).textContent).toBe('Copied');
  });

  it('copies in a card as text only, with its own names and hint, and lets the click through', async () => {
    vi.stubGlobal('navigator', { clipboard: { writeText: vi.fn().mockResolvedValue(undefined) } });
    const outer = vi.fn();
    render(<div onClick={outer}><CopyButton text={NOW} look="card" label="Copy hash" copiedLabel="hash copied" hintKey="block.copy" /></div>);
    const button = screen.getByRole('button', { name: 'Copy hash' });
    expect(button.className).toBe('card-kit-copy');
    expect(button.querySelector('svg')).toBeNull();
    expect(button.getAttribute('data-hint')).toBeTruthy();
    await act(async () => fireEvent.click(button));
    expect(outer).toHaveBeenCalledOnce();
    expect(screen.getByRole('button', { name: 'hash copied' })).toBeTruthy();
  });
});

describe('hashes', () => {
  it('highlights the leading zeros, or marks the characters that miss the target', () => {
    const { container, rerender } = render(<HashText hash="000abc" />);
    expect(container.querySelector('b.chain-band-zero').textContent).toBe('000');
    expect(container.textContent).toBe('000abc');
    rerender(<HashText hash="f0abcd" miss={2} missClass="chain-band-bad" />);
    expect(container.querySelector('b.chain-band-bad').textContent).toBe('f0');
  });

  it('shortens a hash to 6 + 2 characters and keeps its zeros highlighted', () => {
    const { container } = render(<ShortHash hash={hashOf(1)} zeroClass="chain-band-lz" />);
    expect(container.textContent).toBe('001ddd…dd');
    expect(container.querySelector('b.chain-band-lz').textContent).toBe('00');
  });
});

describe('Avatar', () => {
  const avatar = props => render(<Avatar {...props} />).container.firstChild;

  it('takes an explicit color first, then the color key, then the name', () => {
    expect(avatar({ name: 'Dana', color: 'red', colorKey: 'bob' }).style.getPropertyValue('--av-color')).toBe('red');
    expect(avatar({ name: 'Dana', colorKey: 'bob' }).style.getPropertyValue('--av-color')).toBe('var(--bob)');
    expect(avatar({ name: 'alice' }).style.getPropertyValue('--av-color')).toBe('var(--alice)');
  });

  it('shows the initial; plain without a color unless a fallback is given', () => {
    const plain = avatar({ name: 'dana', className: 'details-modal-av' });
    expect(plain.textContent).toBe('D');
    expect(plain.className).toBe('details-modal-av is-plain');
    const miner = avatar({ name: 'Dana', className: 'miner-av is-sm', fallback: 'var(--text-3)' });
    expect(miner.className).toBe('miner-av is-sm');
    expect(miner.style.getPropertyValue('--av-color')).toBe('var(--text-3)');
  });

  it('marks a block by its miner, and Genesis by G', () => {
    const views = makeViews();
    const { container, rerender } = render(<MinerMark view={views[2]} />);
    expect(container.firstChild.className).toBe('chain-band-av is-alice');
    expect(container.textContent).toBe('A');
    rerender(<MinerMark view={views[0]} />);
    expect(container.textContent).toBe('G');
  });
});

describe('health checks', () => {
  const cell = (views, index, twoLine = true) => render(<HealthCell view={views[index]} views={views} twoLine={twoLine} />).container.firstChild;

  it('names each broken status by the one status name', () => {
    const views = makeViews({ 1: 'signature-invalid', 2: 'hash-mismatch', 3: 'built-on-broken' });
    expect(cell(views, 1).textContent).toContain(`#1 · ${statusLabel('signature-invalid').toLowerCase()}`);
    expect(cell(views, 2).getAttribute('aria-label')).toMatch(/^Block 2: hash mismatch, hash now ffffff…ff, 0 of 2 zeros$/);
    expect(cell(views, 3).textContent).toContain(statusLabel('built-on-broken'));
    expect(cell(views, 3).className).toContain('is-dependent');
  });

  it('shows a valid block on one line with its target and link', () => {
    const views = makeViews();
    const one = cell(views, 1, false);
    expect(one.getAttribute('aria-label')).toBe('Block 1: hash starts with 00, link to block 0 intact');
    expect(one.textContent).toBe('#100·link');
  });

  it('shows the candidate as not mined, being mined or paused', () => {
    const { container, rerender } = render(<CandidateCell candidate={{ index: 4, state: 'idle' }} twoLine={false} />);
    expect(container.firstChild.getAttribute('aria-label')).toBe('Block 4: not mined yet');
    rerender(<CandidateCell candidate={{ index: 4, state: 'paused' }} twoLine />);
    expect(container.textContent).toBe('#4 · paused' + 'until the chain is valid');
  });

  it('says how many hashes and links check out, shorter on the compact line', () => {
    const summary = healthSummary(makeViews());
    const { container, rerender } = render(<HealthLine summary={summary} healthOpen />);
    expect(container.querySelector('.chain-band-health-text').textContent).toBe('3 of 3 hashes start with 00·3 of 3 links intact');
    rerender(<HealthLine summary={summary} healthOpen compact />);
    expect(container.querySelector('.chain-band-health-text').textContent).toBe('3/3 start 00·3/3 links');
    expect(screen.getByRole('status').textContent).toBe('Chain valid');
  });
});

describe('one source for status texts and amounts', () => {
  it('names and explains every status in one place, unknown ones as valid', () => {
    expect(statusSentence('link-broken').title).toBe(statusLabel('link-broken'));
    expect(statusSentence('link-broken').text).toMatch(/old hash of the block before it/);
    expect(statusSentence('no-such-status')).toBe(statusSentence('valid'));
  });

  it('writes amounts with two to eight decimals', () => {
    expect(formatAmount(2)).toBe('2.00');
    expect(formatAmount(0.125)).toBe('0.125');
    expect(formatAmount('0.60 each')).toBe('0.60 each');
  });
});
