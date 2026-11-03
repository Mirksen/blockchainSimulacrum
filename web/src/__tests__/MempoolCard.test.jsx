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
    expect(onCreateTransaction).toHaveBeenLastCalledWith('Alice', 'Bob', 0.9, 'Lunch', 5);
    expect(screen.getByRole('alert').textContent).toContain('Insufficient funds');
    expect(within(form).getByLabelText(/^Amount/).value).toBe('0.9');
    fireEvent.click(within(form).getByRole('button', { name: 'Add to mempool' }));
    expect(onCreateTransaction).toHaveBeenCalledTimes(2);
    expect(screen.queryByRole('form')).toBeNull();
  });

  it('joins the Auto-transact toggle to the right of New transaction, as Auto-mine beside Mining', () => {
    const onAutoTransact = vi.fn();
    render(<MempoolCard transactions={[]} nextIndex={5} participants={participants} onAutoTransact={onAutoTransact} />);
    const group = screen.getByRole('group', { name: 'Transaction controls' });
    const buttons = within(group).getAllByRole('button');
    expect(buttons.map(button => button.getAttribute('aria-label') ?? button.textContent)).toEqual(['New transaction', 'Auto-transact']);
    expect(buttons[1].textContent).toBe('Auto');
    expect(buttons[1].classList.contains('repeat-toggle')).toBe(true);
    fireEvent.click(buttons[1]);
    expect(onAutoTransact).toHaveBeenCalledWith(true);
  });

  it('full block: names the room, how many fit and why each other transfer waits', () => {
    const queued = [
      { id: 'a', from: 'Alice', to: 'Bob', amount: 0.25, inputs: 1, fee: 0.00005, size: 250, rate: 20 },
      { id: 'b', from: 'Bob', to: 'Chris', amount: 0.1, inputs: 1, fee: 0.00000226, size: 226, rate: 1, waits: 'full' },
      { id: 'c', from: 'Bob', to: 'Alice', amount: 0.1, fee: 0.0000452, size: 226, rate: 20, waits: 'parent' },
      { id: 'd', from: 'Chris', to: 'Alice', amount: 0.1, fee: null, size: 226, rate: null, waits: 'invalid' }
    ];
    render(<MempoolCard transactions={queued} nextIndex={7} participants={participants}
      space={{ bytes: 250, capacity: 1300, included: 1, total: 4 }} />);
    const text = card().textContent;
    expect(text).toContain('1 of 4 fit into #7');
    expect(text).toContain('Block space #7');
    expect(text).toContain('250 B of 1,300 B');
    expect(text).toContain('3 wait');
    expect(screen.getByRole('meter', { name: 'Block space of #7' }).getAttribute('aria-valuenow')).toBe('250');
    expect(text).toContain('250 B · 20 sat/B');
    expect(text).toContain('226 B · 1 sat/B');
    expect(screen.getByText('waits · block full').getAttribute('data-hint')).toContain('higher fee per byte');
    expect(screen.getByText('waits for its parent')).toBeTruthy();
    expect(screen.getByText('orphaned by an edit').className).toContain('is-invalid');
    expect(document.querySelectorAll('.mempool-card-tx.is-waiting')).toHaveLength(3);
  });

  it('mining with a full block: the fitting rows are mined, the others keep waiting', () => {
    const queued = [
      { id: 'a', from: 'Alice', to: 'Bob', amount: 0.25, size: 250, rate: 20 },
      { id: 'b', from: 'Bob', to: 'Chris', amount: 0.1, size: 226, rate: 1, waits: 'full' }
    ];
    render(<MempoolCard transactions={queued} nextIndex={7} mining participants={participants} space={{ bytes: 250, capacity: 1300, included: 1, total: 2 }} />);
    expect(screen.getAllByText('being mined into #7')).toHaveLength(1);
    expect(screen.getAllByText('waits · block full')).toHaveLength(1);
  });

  it('everything fits: no waiting count and the familiar "goes into #N"', () => {
    render(<MempoolCard transactions={transactions} nextIndex={5} participants={participants} space={{ bytes: 452, capacity: 1300, included: 2, total: 2 }} />);
    expect(card().textContent).toContain('goes into #5');
    expect(document.querySelector('.mempool-card-space-waiting')).toBeNull();
  });

  it('prices the transfer at the chosen fee rate and shows its size in the preview', () => {
    const onCreateTransaction = vi.fn().mockReturnValue({ success: true });
    const onPreviewTransaction = vi.fn((from, amount, rate) => ({ funded: true, coins: [{ value: 50000000 }], amount: amount * 1e8,
      change: 50000000 - amount * 1e8 - rate * 226, fee: rate * 226, size: 226, feeRate: rate }));
    render(<MempoolCard transactions={[]} nextIndex={5} participants={['Alice', 'Bob']} onCreateTransaction={onCreateTransaction} onPreviewTransaction={onPreviewTransaction} />);
    fireEvent.click(newTx());
    const form = screen.getByRole('form', { name: 'New transaction' });
    const rate = within(form).getByLabelText('Fee rate');
    expect([...rate.options].map(option => option.textContent)).toEqual(['1 sat/B · low', '5 sat/B · normal', '20 sat/B · high']);
    expect(rate.value).toBe('5');
    fireEvent.change(within(form).getByLabelText('From'), { target: { value: 'Alice' } });
    fireEvent.change(within(form).getByLabelText('To'), { target: { value: 'Bob' } });
    fireEvent.change(within(form).getByLabelText(/^Amount/), { target: { value: '0.1' } });
    fireEvent.change(rate, { target: { value: '20' } });
    expect(onPreviewTransaction).toHaveBeenLastCalledWith('Alice', 0.1, 20, '');
    expect(screen.getByRole('status').textContent).toContain('(about 226 B at 20 sat/B)');
    fireEvent.click(within(form).getByRole('button', { name: 'Add to mempool' }));
    expect(onCreateTransaction).toHaveBeenLastCalledWith('Alice', 'Bob', 0.1, '', 20);
  });

  it('marks New transaction as the coach target', () => {
    render(<MempoolCard transactions={transactions} nextIndex={5} participants={participants}
      coach={{ target: 'workbench.new-transaction', label: 'Step 1 · new transaction' }} />);
    const mark = document.querySelector('[data-coach-target="workbench.new-transaction"]');
    expect(mark.classList.contains('is-active')).toBe(true);
    expect(mark.contains(newTx())).toBe(true);
  });
});
