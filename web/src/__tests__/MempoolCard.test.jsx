// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { MempoolCard } from '../components/workbench/MempoolCard';

afterEach(cleanup);

const participants = [{ name: 'Alice' }, { name: 'Bob' }, { name: 'Chris' }];
const transactions = [{ from: 'Alice', to: 'Bob', amount: 0.25, reference: 'Coffee' }, { from: 'Chris', to: 'Alice', amount: 0.1, reference: 'Rent split' }];
const card = () => screen.getByRole('region', { name: 'Mempool' });
const newTx = () => screen.getByRole('button', { name: 'New transaction' });

describe('MempoolCard', () => {
  it('idle: pending pill, rows, coinbase line and a glowing New transaction', () => {
    render(<MempoolCard transactions={transactions} nextIndex={5} participants={participants} reward={1.5625} newTxGlow />);
    const text = card().textContent;
    expect(text).toContain('2 pending');
    expect(text).toContain('goes into #5');
    expect(text).toContain('Alice → BobCoffee');
    expect(text).toContain('0.25');
    expect(text).toContain('0.10');
    expect(text).toContain('Coinbase → winner');
    expect(text).toContain('added when #5 is mined');
    expect(text).toContain('1.5625');
    expect(text).not.toContain('being mined into');
    expect(newTx().classList.contains('btn-tinted')).toBe(true);
    expect(newTx().classList.contains('is-quiet')).toBe(false);
  });

  it('mining: rows read "being mined into #N" and New transaction loses its glow', () => {
    render(<MempoolCard transactions={transactions} nextIndex={5} mining participants={participants} newTxGlow={false} />);
    expect(screen.getAllByText('being mined into #5')).toHaveLength(2);
    expect(card().textContent).toContain('2 in #5');
    expect(newTx().classList.contains('is-quiet')).toBe(true);
  });

  it('empty: says what is recorded and the next step', () => {
    render(<MempoolCard transactions={[]} nextIndex={3} participants={participants} />);
    expect(card().textContent).toContain('Empty');
    expect(card().textContent).toContain('No transactions waiting.');
    expect(card().textContent).toContain('added when #3 is mined');
  });

  it('New transaction opens the form at the top of the card and validates it', () => {
    const onCreateTransaction = vi.fn();
    render(<MempoolCard transactions={transactions} nextIndex={5} participants={participants} onCreateTransaction={onCreateTransaction} />);
    expect(newTx().getAttribute('aria-expanded')).toBe('false');
    fireEvent.click(newTx());
    expect(newTx().getAttribute('aria-expanded')).toBe('true');
    const form = screen.getByRole('form', { name: 'New transaction' });
    expect(form.compareDocumentPosition(screen.getByRole('list', { name: 'Pending transactions' })) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    const submit = within(form).getByRole('button', { name: 'Add to mempool' });

    fireEvent.click(submit);
    expect(screen.getByRole('alert').textContent).toBe('Choose who sends and who receives.');
    fireEvent.change(within(form).getByLabelText('From'), { target: { value: 'Alice' } });
    fireEvent.change(within(form).getByLabelText('To'), { target: { value: 'Alice' } });
    fireEvent.click(submit);
    expect(screen.getByRole('alert').textContent).toBe('Sender and recipient must be different wallets.');
    fireEvent.change(within(form).getByLabelText('To'), { target: { value: 'Bob' } });
    fireEvent.change(within(form).getByLabelText(/^Amount/), { target: { value: '0' } });
    fireEvent.click(submit);
    expect(screen.getByRole('alert').textContent).toBe('Enter an amount greater than 0.');
    expect(onCreateTransaction).not.toHaveBeenCalled();
  });

  it('creates a transaction, keeps inputs on error and closes on success', () => {
    const onCreateTransaction = vi.fn()
      .mockReturnValueOnce({ success: false, error: 'Insufficient funds. Balance: 0.6, Required: 0.90000001' })
      .mockReturnValueOnce({ success: true });
    render(<MempoolCard transactions={transactions} nextIndex={5} participants={['Alice', 'Bob']} onCreateTransaction={onCreateTransaction} />);
    fireEvent.click(newTx());
    const form = screen.getByRole('form', { name: 'New transaction' });
    fireEvent.change(within(form).getByLabelText('From'), { target: { value: 'Alice' } });
    fireEvent.change(within(form).getByLabelText('To'), { target: { value: 'Bob' } });
    fireEvent.change(within(form).getByLabelText(/^Amount/), { target: { value: '0.9' } });
    fireEvent.change(within(form).getByLabelText('Reference'), { target: { value: ' Lunch ' } });
    fireEvent.click(within(form).getByRole('button', { name: 'Add to mempool' }));
    expect(onCreateTransaction).toHaveBeenLastCalledWith('Alice', 'Bob', 0.9, 'Lunch');
    expect(screen.getByRole('alert').textContent).toContain('Insufficient funds');
    expect(within(form).getByLabelText(/^Amount/).value).toBe('0.9');
    fireEvent.click(within(form).getByRole('button', { name: 'Add to mempool' }));
    expect(onCreateTransaction).toHaveBeenCalledTimes(2);
    expect(screen.queryByRole('form')).toBeNull();
  });

  it('marks New transaction as the coach target', () => {
    render(<MempoolCard transactions={transactions} nextIndex={5} participants={participants}
      coach={{ target: 'workbench.new-transaction', label: 'Step 1 · new transaction' }} />);
    const mark = document.querySelector('[data-coach-target="workbench.new-transaction"]');
    expect(mark.classList.contains('is-active')).toBe(true);
    expect(mark.contains(newTx())).toBe(true);
  });
});
