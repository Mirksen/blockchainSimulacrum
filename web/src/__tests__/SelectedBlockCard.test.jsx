// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { SelectedBlockCard } from '../components/workbench/SelectedBlockCard';

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

const HASH = '0080a3e897fb1e3839f43f95b033620ff7fb2f9739c8e415e5ce6e7df0726c4d';
const ROOT = '74ade267607c108e6483968317be4e63830d9c66961a6120e870593f555e39db';
const PREV = '00e6130b1c2d3e4f5a6b7c8d9e0f1a2b3c4d5e6f708192a3b4c5d6e7f80912f8';
const block = (overrides = {}) => ({
  index: 4, hash: HASH, previousHash: PREV, txRoot: ROOT, nonce: 5775, difficulty: 2, isNewest: true,
  miner: 'Lars', seconds: 7.1, tries: 332, reward: 1.5625,
  transactions: [{ from: 'Alice', to: 'Bob', amount: 0.25 }, { from: null, to: 'Lars', amount: 1.5625 }],
  ...overrides
});
const card = () => screen.getByRole('region', { name: /^Block/ });

describe('SelectedBlockCard', () => {
  it('offers the way back to the newest only while an older block is held', () => {
    const onFollowNewest = vi.fn();
    const older = block({ index: 2, isNewest: false });
    const { rerender } = render(<SelectedBlockCard block={older} status="valid" prevHash={PREV} pinned onFollowNewest={onFollowNewest} />);
    fireEvent.click(screen.getByRole('button', { name: 'Show newest' }));
    expect(onFollowNewest).toHaveBeenCalledOnce();
    rerender(<SelectedBlockCard block={block()} status="valid" prevHash={PREV} pinned onFollowNewest={onFollowNewest} />);
    expect(screen.queryByRole('button', { name: 'Show newest' })).toBeNull();
    rerender(<SelectedBlockCard block={older} status="valid" prevHash={PREV} onFollowNewest={onFollowNewest} />);
    expect(screen.queryByRole('button', { name: 'Show newest' })).toBeNull();
  });

  it('holds its transactions as a part of the card', () => {
    render(<SelectedBlockCard block={block()} status="valid" prevHash={PREV}><p>Transaction list</p></SelectedBlockCard>);
    expect(within(card()).getByText('Transaction list')).toBeTruthy();
  });

  it('shows an empty state without a block', () => {
    render(<SelectedBlockCard block={null} />);
    expect(card().textContent).toContain('No block selected.');
  });

  it('shows a valid block: the whole hash with Copy, intact link, nonce, miner facts and transactions', () => {
    render(<SelectedBlockCard block={block()} status="valid" prevHash={PREV} />);
    const text = card().textContent;
    expect(screen.getByRole('heading', { name: 'Block #4' })).toBeTruthy();
    expect(text).toContain('Valid');
    expect(text).toContain('newest · mined by Lars');
    expect(HASH).toHaveLength(64);
    expect(text).toContain(HASH);
    expect(text).toContain(PREV);
    expect(text).not.toContain('…');
    expect(text).toContain('start with 00');
    expect(text).toContain('= #3');
    expect(text).toContain('link intact');
    expect(text).toContain('5,775');
    expect(text).toContain('7.1 s · 332 tries · reward 1.5625');
    expect(text).toContain(ROOT);
    expect(text).toContain('2 tx');
    expect(screen.getByRole('button', { name: 'Tamper with this block' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: /Undo edit/ })).toBeNull();
  });

  it('reports the full hash copied only after the clipboard confirms success', async () => {
    let resolve;
    const writeText = vi.fn(() => new Promise(done => { resolve = done; }));
    vi.stubGlobal('navigator', { clipboard: { writeText } });
    render(<SelectedBlockCard block={block()} prevHash={PREV} />);
    fireEvent.click(screen.getByRole('button', { name: 'Copy hash' }));
    expect(writeText).toHaveBeenCalledExactlyOnceWith(HASH);
    expect(screen.queryByRole('button', { name: 'hash copied' })).toBeNull();
    await act(async () => resolve());
    expect(screen.getByRole('button', { name: 'hash copied' }).textContent).toBe('Copied');
  });

  it.each([
    ['missing clipboard', {}],
    ['missing writeText', { clipboard: {} }],
    ['throwing write', { clipboard: { writeText: () => { throw new Error('fixture failure'); } } }],
    ['rejected write', { clipboard: { writeText: () => Promise.reject(new Error('fixture denied')) } }],
    ['throwing clipboard getter', { get clipboard() { throw new Error('fixture denied'); } }]
  ])('does not report success with %s', async (_label, clipboardNavigator) => {
    vi.stubGlobal('navigator', clipboardNavigator);
    render(<SelectedBlockCard block={block()} />);
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Copy hash' })));
    expect(screen.queryByRole('button', { name: 'hash copied' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Copy hash' }).textContent).toBe('Copy');
  });

  it('discards a completed copy when the selected hash changes', async () => {
    vi.stubGlobal('navigator', { clipboard: { writeText: vi.fn().mockResolvedValue(undefined) } });
    const { rerender } = render(<SelectedBlockCard block={block()} />);
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Copy hash' })));
    expect(screen.getByRole('button', { name: 'hash copied' })).toBeTruthy();
    rerender(<SelectedBlockCard block={block({ hash: PREV })} />);
    expect(screen.queryByRole('button', { name: 'hash copied' })).toBeNull();
  });

  it('does not report a late write after switching away and back to the same hash', async () => {
    let resolve;
    vi.stubGlobal('navigator', { clipboard: { writeText: () => new Promise(done => { resolve = done; }) } });
    const { rerender } = render(<SelectedBlockCard block={block()} />);
    fireEvent.click(screen.getByRole('button', { name: 'Copy hash' }));
    rerender(<SelectedBlockCard block={block({ index: 5, hash: PREV })} />);
    rerender(<SelectedBlockCard block={block()} />);
    await act(async () => resolve());
    expect(screen.queryByRole('button', { name: 'hash copied' })).toBeNull();
  });

  it('resets feedback between blocks even when their displayed hashes match', async () => {
    vi.stubGlobal('navigator', { clipboard: { writeText: vi.fn().mockResolvedValue(undefined) } });
    const { rerender } = render(<SelectedBlockCard block={block()} />);
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Copy hash' })));
    rerender(<SelectedBlockCard block={block({ index: 5 })} />);
    expect(screen.queryByRole('button', { name: 'hash copied' })).toBeNull();
  });

  it('ignores a superseded write and confirms only the latest copy request', async () => {
    const resolve = [];
    const writeText = vi.fn(() => new Promise(done => resolve.push(done)));
    vi.stubGlobal('navigator', { clipboard: { writeText } });
    render(<SelectedBlockCard block={block()} />);
    fireEvent.click(screen.getByRole('button', { name: 'Copy hash' }));
    fireEvent.click(screen.getByRole('button', { name: 'Copy hash' }));
    await act(async () => resolve[0]());
    expect(screen.queryByRole('button', { name: 'hash copied' })).toBeNull();
    await act(async () => resolve[1]());
    expect(screen.getByRole('button', { name: 'hash copied' })).toBeTruthy();
  });

  it('restarts the 1200 ms feedback period after another successful copy', async () => {
    vi.useFakeTimers();
    vi.stubGlobal('navigator', { clipboard: { writeText: vi.fn().mockResolvedValue(undefined) } });
    render(<SelectedBlockCard block={block()} />);
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Copy hash' })));
    act(() => vi.advanceTimersByTime(1000));
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'hash copied' })));
    act(() => vi.advanceTimersByTime(1000));
    expect(screen.getByRole('button', { name: 'hash copied' })).toBeTruthy();
    act(() => vi.advanceTimersByTime(200));
    expect(screen.getByRole('button', { name: 'Copy hash' })).toBeTruthy();
  });

  it('copies the full recomputed hash of a tampered block', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal('navigator', { clipboard: { writeText } });
    render(<SelectedBlockCard block={block()} status={{ status: 'hash-mismatch', computedHash: PREV }} />);
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Copy hash' })));
    expect(writeText).toHaveBeenCalledExactlyOnceWith(PREV);
    expect(screen.getByRole('button', { name: 'hash copied' })).toBeTruthy();
  });

  it('calls Open in Chain lab and Details with the block index', () => {
    const onOpenChainLab = vi.fn();
    const onOpenDetails = vi.fn();
    render(<SelectedBlockCard block={block()} prevHash={PREV} onOpenChainLab={onOpenChainLab} onOpenDetails={onOpenDetails} />);
    fireEvent.click(screen.getByRole('button', { name: /Open in Chain lab/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Details' }));
    expect(onOpenChainLab).toHaveBeenCalledWith(4);
    expect(onOpenDetails).toHaveBeenCalledWith(4);
  });

  it('tamper opens an inline editor that validates and changes one amount', () => {
    const onTamper = vi.fn();
    render(<SelectedBlockCard block={block()} prevHash={PREV} onTamper={onTamper} />);
    fireEvent.click(screen.getByRole('button', { name: 'Tamper with this block' }));
    const form = screen.getByRole('form', { name: 'Change a transaction amount in block 4' });
    const amount = within(form).getByLabelText('New amount');
    expect(amount.value).toBe('0.25');

    fireEvent.click(within(form).getByRole('button', { name: 'Change amount' }));
    expect(screen.getByRole('alert').textContent).toBe('That is the current amount. Enter a different one.');
    fireEvent.change(amount, { target: { value: '-1' } });
    fireEvent.click(within(form).getByRole('button', { name: 'Change amount' }));
    expect(screen.getByRole('alert').textContent).toBe('Enter an amount of 0 or more.');
    fireEvent.change(amount, { target: { value: 'abc' } });
    fireEvent.click(within(form).getByRole('button', { name: 'Change amount' }));
    expect(screen.getByRole('alert').textContent).toBe('Enter an amount, for example 2.00.');
    expect(onTamper).not.toHaveBeenCalled();

    fireEvent.change(within(form).getByLabelText('Transaction'), { target: { value: '1' } });
    expect(amount.value).toBe('1.5625');
    fireEvent.change(amount, { target: { value: '5' } });
    fireEvent.click(within(form).getByRole('button', { name: 'Change amount' }));
    expect(onTamper).toHaveBeenCalledWith(4, 1, 5);
    expect(screen.queryByRole('form')).toBeNull();
  });

  it('closes the editor on Cancel and disables Tamper for a block without transactions', () => {
    const { rerender } = render(<SelectedBlockCard block={block()} prevHash={PREV} onTamper={() => {}} />);
    fireEvent.click(screen.getByRole('button', { name: 'Tamper with this block' }));
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(screen.queryByRole('form')).toBeNull();
    rerender(<SelectedBlockCard block={block({ transactions: [] })} prevHash={PREV} onTamper={() => {}} />);
    expect(screen.getByRole('button', { name: 'Tamper with this block' }).disabled).toBe(true);
  });

  it('marks the tamper button as the coach target', () => {
    render(<SelectedBlockCard block={block()} prevHash={PREV} onTamper={() => {}}
      coach={{ target: 'workbench.selected-block.tamper', label: 'Step 1 · tamper' }} />);
    const mark = document.querySelector('[data-coach-target="workbench.selected-block.tamper"]');
    expect(mark.classList.contains('is-active')).toBe(true);
    expect(within(mark).getByRole('button', { name: 'Tamper with this block' })).toBeTruthy();
    expect(screen.getByRole('note').textContent).toContain('Step 1 · tamper');
  });

  it('shows a hash mismatch with hash now, as mined, the edit and Undo edit', () => {
    const onUndo = vi.fn();
    const computed = '7c41e235e2f72f5e4541c5f66eec0ce5e06e28d53ef19595758471564a74a5b0';
    const b = block({ index: 2, isNewest: false, transactions: [{ from: 'Lars', to: 'Minas', amount: 0.6 }, { from: 'Bob', to: 'Chris', amount: 2 }] });
    render(<SelectedBlockCard block={b} status={{ status: 'hash-mismatch', storedHash: HASH, computedHash: computed }}
      prevHash={PREV} edit={{ blockIndex: 2, txIndex: 1, from: 0.2, to: 2 }} onUndo={onUndo} />);
    const text = card().textContent;
    expect(text).toContain('Hash mismatch');
    expect(text).toContain('edited after mining · mined by Lars');
    expect(text).toContain('Hash now');
    expect(text).toContain(computed);
    expect(text).toContain('0/2 zeros');
    expect(text).toContain('does not start with 00');
    expect(text).toContain('As mined');
    expect(text).toContain('what #3 still stores as its previous hash');
    expect(text).toContain('Your edit');
    expect(text).toContain('Bob → Chris 0.20 → 2.00');
    expect(text).toContain('tx 2 of 2');
    expect(screen.queryByRole('button', { name: 'Tamper with this block' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Undo edit' }));
    expect(onUndo).toHaveBeenCalledWith(2);
  });

  it('names the other invalid statuses with their cause', () => {
    const { rerender } = render(<SelectedBlockCard block={block({ index: 3, isNewest: false })} status="built-on-broken" prevHash={PREV} />);
    expect(card().textContent).toContain('Built on a broken block');
    expect(card().textContent).toContain('its own link is intact');
    expect(card().textContent).toContain('link intact');

    rerender(<SelectedBlockCard block={block({ index: 3 })} status="link-broken" prevHash="00ffee0000000000000000000000000000000000000000000000000000000011" />);
    expect(card().textContent).toContain('Link broken');
    expect(card().textContent).toContain('link broken');
    expect(card().textContent).toContain('#2 is now 00ffee0000000000000000000000000000000000000000000000000000000011');

    rerender(<SelectedBlockCard block={block({ index: 2 })} status="signature-invalid" prevHash={PREV}
      edit={{ txIndex: 0, from: 0.2, to: 2 }} onUndo={() => {}} />);
    expect(card().textContent).toContain('Signature invalid');
    expect(screen.getByText('Re-mining fixes the hash, not the signature. Undo the edit to repair.')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Undo edit' })).toBeTruthy();
  });
});
