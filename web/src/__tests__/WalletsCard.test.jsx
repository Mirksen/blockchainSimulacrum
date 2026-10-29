// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { WalletsCard } from '../components/workbench/WalletsCard';

afterEach(cleanup);

const wallets = [
  { name: 'Lars', balance: 8.41250004, isMiner: true, blocksWon: 3, hashrate: 11133 },
  { name: 'Minas', balance: 0.72499996, isMiner: true, blocksWon: 1, hashrate: 11000 },
  { name: 'Alice', balance: 0.6 }
];

describe('WalletsCard', () => {
  it('lists wallets with role, hash rate and balance, and opens one', () => {
    const onOpenWallet = vi.fn();
    render(<WalletsCard wallets={wallets} coinName="powfyicoin" onOpenWallet={onOpenWallet} />);
    const card = screen.getByRole('region', { name: 'Wallets' });
    expect(card.textContent).toContain('3 wallets · powfyicoin · virtual');
    const list = screen.getByRole('list', { name: 'Wallets' });
    expect(within(list).getAllByRole('listitem')).toHaveLength(3);
    const lars = screen.getByRole('button', { name: /^Open Lars/ });
    expect(lars.textContent).toContain('miner · 3 blocks');
    expect(lars.textContent).toContain('11,133 H/s');
    expect(lars.textContent).toContain('8.41250004');
    expect(screen.getByRole('button', { name: /^Open Minas/ }).textContent).toContain('miner · 1 block');
    expect(screen.getByRole('button', { name: /^Open Alice/ }).textContent).not.toContain('H/s');
    fireEvent.click(screen.getByRole('button', { name: /^Open Alice/ }));
    expect(onOpenWallet).toHaveBeenCalledWith('Alice');
  });

  it('keeps Create wallet outside the scrolling list', () => {
    render(<WalletsCard wallets={wallets} />);
    const list = screen.getByRole('list', { name: 'Wallets' });
    const create = screen.getByRole('button', { name: /Create wallet/ });
    expect(list.contains(create)).toBe(false);
  });

  it('validates the name before calling onCreateWallet', () => {
    const onCreateWallet = vi.fn();
    render(<WalletsCard wallets={wallets} onCreateWallet={onCreateWallet} />);
    fireEvent.click(screen.getByRole('button', { name: /Create wallet/ }));
    const form = screen.getByRole('form', { name: 'Create wallet' });
    fireEvent.click(within(form).getByRole('button', { name: 'Create' }));
    expect(screen.getByRole('alert').textContent).toBe('Enter a name for the wallet.');
    fireEvent.change(screen.getByLabelText('Wallet name'), { target: { value: 'D' } });
    expect(screen.queryByRole('alert')).toBeNull();
    fireEvent.click(within(form).getByRole('button', { name: 'Create' }));
    expect(screen.getByRole('alert').textContent).toBe('Use 2–16 letters or digits for the wallet name.');
    expect(screen.getByLabelText('Wallet name').getAttribute('aria-invalid')).toBe('true');
    expect(onCreateWallet).not.toHaveBeenCalled();
  });

  it('shows the error from onCreateWallet and keeps the input', () => {
    const onCreateWallet = vi.fn(() => ({ success: false, error: 'A wallet named Alice already exists.' }));
    render(<WalletsCard wallets={wallets} onCreateWallet={onCreateWallet} />);
    fireEvent.click(screen.getByRole('button', { name: /Create wallet/ }));
    fireEvent.change(screen.getByLabelText('Wallet name'), { target: { value: ' Alice ' } });
    fireEvent.click(screen.getByRole('button', { name: 'Create' }));
    expect(onCreateWallet).toHaveBeenCalledWith('Alice');
    expect(screen.getByRole('alert').textContent).toBe('A wallet named Alice already exists.');
    expect(screen.getByLabelText('Wallet name').value).toBe(' Alice ');
  });

  it('closes the form after a created wallet and on Cancel', () => {
    const onCreateWallet = vi.fn(() => ({ success: true, error: null }));
    render(<WalletsCard wallets={wallets} onCreateWallet={onCreateWallet} />);
    fireEvent.click(screen.getByRole('button', { name: /Create wallet/ }));
    fireEvent.change(screen.getByLabelText('Wallet name'), { target: { value: 'Dana2' } });
    fireEvent.click(screen.getByRole('button', { name: 'Create' }));
    expect(onCreateWallet).toHaveBeenCalledWith('Dana2');
    expect(screen.queryByRole('form')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: /Create wallet/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(screen.queryByRole('form')).toBeNull();
  });
});
