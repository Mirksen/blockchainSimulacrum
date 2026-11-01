import { useState } from 'react';
import { CoachMark } from './CoachMark';
import './cardKit.css';
import './MempoolCard.css';

// Mempool card (web/DESIGN.md, "Card grid" and "Interaction patterns"). "New
// transaction" sits in the header
// as the tinted second invitation and opens the form in place at the top of the card.
// transactions: [{ id?, tx?, from, to, amount, reference?, inputs?, change?, fee? }] with names already resolved
// participants:  [{ name }] or names, the choices for From and To
// reward:        optional coinbase amount (reward plus fees) shown on the coinbase line
// onCreateTransaction(from, to, amount, reference) returns { success, error }
// onPreviewTransaction(from, amount) returns the planned coins, change and fee, or null
// onOpenTransaction(tx) opens the details of a pending transaction

function formatAmount(value) {
  if (typeof value !== 'number' || !Number.isFinite(value)) return String(value ?? '');
  const fixed = value.toFixed(8).replace(/0+$/, '');
  const [whole, fraction = ''] = fixed.split('.');
  return `${whole}.${fraction.padEnd(2, '0')}`;
}

const coinCount = count => `${count} ${count === 1 ? 'coin' : 'coins'}`;

// What the form will spend, before anything is signed.
function SpendPreview({ plan, to }) {
  if (!plan) return null;
  if (!plan.funded) return <p className="card-kit-t3 mempool-card-preview" role="status">Not enough coins: this wallet can spend {formatAmount(plan.balance / 1e8)}.</p>;
  const total = plan.coins.reduce((sum, coin) => sum + coin.value, 0);
  return (
    <p className="card-kit-t3 mempool-card-preview" role="status">
      Spends {coinCount(plan.coins.length)} ({formatAmount(total / 1e8)}) · {formatAmount(plan.amount / 1e8)} to {to || 'recipient'}
      {' '}· {formatAmount(plan.change / 1e8)} change · {formatAmount(plan.fee / 1e8)} fee
    </p>
  );
}

// One line under a pending transaction: where its value goes.
function spendSummary(tx) {
  if (tx.inputs === undefined) return null;
  const parts = [coinCount(tx.inputs)];
  if (tx.change > 0) parts.push(`${formatAmount(tx.change)} change`);
  if (tx.fee != null) parts.push(`${formatAmount(tx.fee)} fee`);
  return parts.join(' · ');
}

const PlusIcon = () => (
  <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true"><path d="M6 2v8M2 6h8" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" /></svg>
);

function NewTransactionForm({ names, coinName, onCreate, onPreview, onClose }) {
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [amount, setAmount] = useState('');
  const [reference, setReference] = useState('');
  const [error, setError] = useState('');
  const submit = event => {
    event.preventDefault();
    const value = Number(amount.trim());
    if (!from || !to) return setError('Choose who sends and who receives.');
    if (from === to) return setError('Sender and recipient must be different wallets.');
    if (!amount.trim() || !Number.isFinite(value) || value <= 0) return setError('Enter an amount greater than 0.');
    const result = onCreate?.(from, to, value, reference.trim()) ?? { success: false, error: 'The transaction could not be added. Try again.' };
    if (result.success) onClose();
    else setError(result.error || 'The transaction could not be added. Try again.');
  };
  const edit = setter => event => { setter(event.target.value); setError(''); };
  const previewAmount = Number(amount.trim());
  const plan = from && previewAmount > 0 ? onPreview?.(from, previewAmount) ?? null : null;
  return (
    <form id="mempool-card-form" className="card-kit-form mempool-card-form" onSubmit={submit} aria-label="New transaction" noValidate
      onKeyDown={event => { if (event.key === 'Escape') onClose(); }}>
      <div className="mempool-card-fields">
        <label className="card-kit-field">From
          <select className="card-kit-select" value={from} onChange={edit(setFrom)}>
            <option value="">Choose…</option>
            {names.map(name => <option key={name} value={name}>{name}</option>)}
          </select>
        </label>
        <label className="card-kit-field">To
          <select className="card-kit-select" value={to} onChange={edit(setTo)}>
            <option value="">Choose…</option>
            {names.map(name => <option key={name} value={name}>{name}</option>)}
          </select>
        </label>
        <label className="card-kit-field">Amount ({coinName})
          <input className="card-kit-input is-mono" inputMode="decimal" placeholder="0.25" value={amount} onChange={edit(setAmount)}
            aria-invalid={error.startsWith('Enter an amount') ? 'true' : 'false'} />
        </label>
        <label className="card-kit-field mempool-card-ref">Reference
          <input className="card-kit-input" placeholder="Coffee (optional)" value={reference} maxLength={64} onChange={edit(setReference)} />
        </label>
      </div>
      <SpendPreview plan={plan} to={to} />
      {error && <p className="card-kit-error" role="alert">{error}</p>}
      <div className="card-kit-form-actions">
        <button type="submit" className="card-kit-btn">Add to mempool</button>
        <button type="button" className="card-kit-btn is-ghost" onClick={onClose}>Cancel</button>
        <span className="card-kit-t3 mempool-card-form-hint">Waits here until the next block is mined.</span>
      </div>
    </form>
  );
}

export function MempoolCard({
  transactions = [], nextIndex, mining = false, participants = [], coinName = 'powfyicoin', reward,
  onCreateTransaction, onPreviewTransaction, onOpenTransaction, autoTransact = false, onAutoTransact, newTxGlow = false, coach = null
}) {
  const [open, setOpen] = useState(false);
  const names = participants.map(p => (typeof p === 'string' ? p : p.name)).filter(Boolean);
  const pending = transactions.length;
  return (
    <section className={`card-kit mempool-card${mining ? ' is-mining' : ''}`} aria-label="Mempool">
      <div className="card-kit-head">
        <h2 className="card-kit-title">Mempool</h2>
        {pending > 0
          ? <span className={`card-kit-pill ${mining ? 'is-live' : 'is-pending'}`}><i aria-hidden="true" />{mining ? `${pending} in #${nextIndex}` : `${pending} pending`}</span>
          : <span className="card-kit-pill is-none">Empty</span>}
        <span className="card-kit-aside mempool-card-aside">{mining ? `candidate #${nextIndex}` : `goes into #${nextIndex}`}</span>
        <button type="button" className="mempool-card-repeat" aria-label="Auto-transact" aria-pressed={autoTransact}
          title="Automatically fill an empty mempool with sample transfers between funded wallets. Waits while mining; turn off to stop filling. Existing transfers stay."
          onClick={() => onAutoTransact?.(!autoTransact)}>
          <svg width="14" height="14" viewBox="0 0 16 16" aria-hidden="true"><path d="M12 3.5H5a3 3 0 0 0-3 3M10 1.5l2 2-2 2M4 12.5h7a3 3 0 0 0 3-3M6 10.5l-2 2 2 2" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /></svg>
          <span>Auto<span className="mempool-card-repeat-rest">-transact</span></span>
        </button>
        <CoachMark target="workbench.new-transaction" coach={coach} className="mempool-card-coach">
          <button type="button" className={`btn-tinted${open ? ' is-open' : newTxGlow ? '' : ' is-quiet'}`}
            aria-expanded={open ? 'true' : 'false'} aria-controls={open ? 'mempool-card-form' : undefined}
            title="From, to, amount and a reference · opens here" onClick={() => setOpen(value => !value)}>
            <PlusIcon />New transaction
          </button>
        </CoachMark>
      </div>
      {open && <NewTransactionForm names={names} coinName={coinName} onCreate={onCreateTransaction} onPreview={onPreviewTransaction} onClose={() => setOpen(false)} />}
      <ul className="mempool-card-list" aria-label="Pending transactions">
        {pending === 0 && (
          <li className="card-kit-empty mempool-card-empty">No transactions waiting.
            <small>Add one with New transaction, or mine #{nextIndex} with only its coinbase.</small></li>
        )}
        {transactions.map((tx, i) => (
          <li key={tx.id ?? i} className={`mempool-card-tx${mining ? ' is-mining' : ''}`}>
            <span className="mempool-card-what">
              {onOpenTransaction && tx.tx
                ? <button type="button" className="mempool-card-open" aria-label={`Details of ${tx.from} to ${tx.to}, ${formatAmount(tx.amount)}`} onClick={() => onOpenTransaction(tx.tx)}><b>{tx.from} → {tx.to}</b></button>
                : <b>{tx.from} → {tx.to}</b>}
              {tx.reference ? <small>{tx.reference}</small> : null}
              {spendSummary(tx) && <small className="mempool-card-spend">{spendSummary(tx)}</small>}
            </span>
            {mining && <span className="mempool-card-state"><i aria-hidden="true" />being mined into #{nextIndex}</span>}
            <span className="mempool-card-amt">{formatAmount(tx.amount)}</span>
          </li>
        ))}
        <li className="mempool-card-tx is-coinbase">
          <span className="mempool-card-what"><b>Coinbase → winner</b><small>added when #{nextIndex} is mined</small></span>
          <span className="mempool-card-amt">{reward != null ? formatAmount(reward) : ''}</span>
        </li>
      </ul>
    </section>
  );
}
