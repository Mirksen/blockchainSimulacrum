import { useState } from 'react';
import { CoachMark } from './CoachMark';
import './cardKit.css';
import './MempoolCard.css';

// Mempool card (web/DESIGN.md, "Card grid" and "Interaction patterns"). "New
// transaction" sits in the header
// as the tinted second invitation and opens the form in place at the top of the card.
// transactions: [{ from, to, amount, reference? }] with names already resolved
// participants:  [{ name }] or names, the choices for From and To
// reward:        optional coinbase amount shown on the coinbase line
// onCreateTransaction(from, to, amount, reference) returns { success, error }

function formatAmount(value) {
  if (typeof value !== 'number' || !Number.isFinite(value)) return String(value ?? '');
  const fixed = value.toFixed(8).replace(/0+$/, '');
  const [whole, fraction = ''] = fixed.split('.');
  return `${whole}.${fraction.padEnd(2, '0')}`;
}

const PlusIcon = () => (
  <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true"><path d="M6 2v8M2 6h8" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" /></svg>
);

function NewTransactionForm({ names, coinName, onCreate, onClose }) {
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
  onCreateTransaction, newTxGlow = false, coach = null
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
        <CoachMark target="workbench.new-transaction" coach={coach} className="mempool-card-coach">
          <button type="button" className={`btn-tinted${open ? ' is-open' : newTxGlow ? '' : ' is-quiet'}`}
            aria-expanded={open ? 'true' : 'false'} aria-controls={open ? 'mempool-card-form' : undefined}
            title="From, to, amount and a reference · opens here" onClick={() => setOpen(value => !value)}>
            <PlusIcon />New transaction
          </button>
        </CoachMark>
      </div>
      {open && <NewTransactionForm names={names} coinName={coinName} onCreate={onCreateTransaction} onClose={() => setOpen(false)} />}
      <ul className="mempool-card-list" aria-label="Pending transactions">
        {pending === 0 && (
          <li className="card-kit-empty mempool-card-empty">No transactions waiting.
            <small>Add one with New transaction, or mine #{nextIndex} with only its coinbase.</small></li>
        )}
        {transactions.map((tx, i) => (
          <li key={tx.id ?? i} className={`mempool-card-tx${mining ? ' is-mining' : ''}`}>
            <span className="mempool-card-what"><b>{tx.from} → {tx.to}</b>{tx.reference ? <small>{tx.reference}</small> : null}</span>
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
