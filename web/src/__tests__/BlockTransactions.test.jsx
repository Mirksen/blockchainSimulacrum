// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { BlockTransactions } from '../components/workbench/BlockTransactions';

afterEach(cleanup);

const TXID = 'ab881c123ea4316f893b08ad809e9083eb56aa33fd35bad367fe567200fd6d81';
const coinbase = { coinbase: true, txid: 'c'.repeat(64), to: 'Lars', amount: 3.125, memo: 'Mining Reward', inputs: [],
  outputs: [{ index: 0, kind: 'reward', owner: 'Lars', value: 3.125, spent: false, spentIn: null }] };
const payment = { txid: TXID, from: 'Chris', to: 'Minas', amount: 0.25, change: 0.35, fee: 0.00000001,
  inputs: [{ owner: 'Chris', value: 0.60000001, blockIndex: 2 }],
  outputs: [
    { index: 0, kind: 'payment', owner: 'Minas', value: 0.25, spent: false, spentIn: null },
    { index: 1, kind: 'change', owner: 'Chris', value: 0.35, spent: true, spentIn: 5 }
  ] };

describe('BlockTransactions', () => {
  it('lists every transaction on one line with its count', () => {
    render(<BlockTransactions transactions={[coinbase, payment]} />);
    const region = screen.getByRole('region', { name: 'Transactions' });
    expect(within(region).getByText('2')).toBeTruthy();
    const rows = within(screen.getByRole('list', { name: 'Transactions' })).getAllByRole('button');
    expect(rows[0].textContent).toContain('Coinbase → Lars');
    expect(rows[0].textContent).toContain('3.125');
    expect(rows[1].textContent).toContain('Chris → Minas');
    expect(rows[1].textContent).toContain('1 coin · 0.35 change · 0.00000001 fee');
  });

  it('opens one transaction in place with coins and the whole TXID, then closes it', () => {
    render(<BlockTransactions transactions={[coinbase, payment]} />);
    const row = screen.getByRole('button', { name: /Chris → Minas/ });
    expect(screen.queryByText(TXID)).toBeNull();
    fireEvent.click(row);
    expect(row.getAttribute('aria-expanded')).toBe('true');
    expect(screen.getByText(TXID)).toBeTruthy();
    expect(screen.getByText('Chris · from #2')).toBeTruthy();
    expect(screen.getByText('0.60000001')).toBeTruthy();
    expect(screen.getByText('Chris · change · spent in #5')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /Coinbase → Lars/ }));
    expect(screen.queryByText(TXID)).toBeNull();
    expect(screen.getByText('Coinbase · new coins')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /Coinbase → Lars/ }));
    expect(screen.queryByText('Coinbase · new coins')).toBeNull();
  });

  it('hands the rest to the transaction dialog', () => {
    const onOpenDetails = vi.fn();
    render(<BlockTransactions transactions={[payment]} onOpenDetails={onOpenDetails} />);
    fireEvent.click(screen.getByRole('button', { name: /Chris → Minas/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Scripts, signature and raw bytes' }));
    expect(onOpenDetails).toHaveBeenCalledWith(payment);
  });

  it('marks a transaction changed after mining', () => {
    render(<BlockTransactions transactions={[coinbase, payment]} editedTx={[1]} />);
    expect(screen.getByRole('button', { name: /Chris → Minas/ }).textContent).toContain('edited after mining');
    expect(screen.getByRole('button', { name: /Coinbase → Lars/ }).textContent).not.toContain('edited');
  });
});
