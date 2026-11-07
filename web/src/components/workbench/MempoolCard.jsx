import { useRef, useState } from 'react';
import { DEFAULT_FEE_RATE, FEE_RATES } from '../../lib/blockchain';
import { CoachMark } from './CoachMark';
import { RepeatToggle } from './RepeatToggle';
import './cardKit.css';
import { hint, term } from '../../lib/hints';
import './MempoolCard.css';

// Mempool card (web/DESIGN.md, "Card grid" and "Interaction patterns"). "New
// transaction" sits in the header
// as the tinted second invitation and opens the form in place at the top of the card.
// transactions: [{ id?, tx?, from, to, amount, reference?, inputs?, change?, fee?, size?, rate?, waits? }] with names
//                already resolved, in the order the next block's miner takes them; `waits` says why one
//                has no room in it: 'full', 'parent' (its parent waits) or 'invalid' (an edit orphaned it)
// space:         optional { bytes, capacity, included, total }: the next block's room for payments
// participants:  [{ name }] or names, the choices for From and To
// reward:        optional coinbase amount (reward plus fees) shown on the coinbase line
// onCreateTransaction(from, to, amount, reference, feeRate) returns { success, error }
// onPreviewTransaction(from, amount, feeRate, reference) returns the planned coins, change, size and fee, or null
// onOpenTransaction(tx) opens the details of a pending transaction

function formatAmount(value) {
  if (typeof value !== 'number' || !Number.isFinite(value)) return String(value ?? '');
  const fixed = value.toFixed(8).replace(/0+$/, '');
  const [whole, fraction = ''] = fixed.split('.');
  return `${whole}.${fraction.padEnd(2, '0')}`;
}

const coinCount = count => `${count} ${count === 1 ? 'coin' : 'coins'}`;
const formatBytes = bytes => `${bytes.toLocaleString('en-US')} B`;
// Satoshis per byte: whole numbers from 10 on, one decimal below.
function formatRate(rate) {
  if (typeof rate !== 'number' || !Number.isFinite(rate)) return '';
  return `${rate >= 10 ? Math.round(rate) : rate.toFixed(1).replace(/\.0$/, '')} sat/B`;
}
const RATE_LABELS = { [FEE_RATES[0]]: 'low', [FEE_RATES[1]]: 'normal', [FEE_RATES[2]]: 'high' };
const WAITS = { full: 'waits · block full', parent: 'waits for its parent', invalid: 'orphaned by an edit' };

// What the form will spend, before anything is signed.
function SpendPreview({ plan, to }) {
  if (!plan) return null;
  if (!plan.funded) return <p className="card-kit-t3 mempool-card-preview" role="status">Not enough coins: this wallet can spend {formatAmount(plan.balance / 1e8)}.</p>;
  const total = plan.coins.reduce((sum, coin) => sum + coin.value, 0);
  return (
    <p className="card-kit-t3 mempool-card-preview" role="status">
      Spends {coinCount(plan.coins.length)} ({formatAmount(total / 1e8)}) · {formatAmount(plan.amount / 1e8)} to {to || 'recipient'}
      {' '}· {formatAmount(plan.change / 1e8)} change · {formatAmount(plan.fee / 1e8)} fee
      {plan.size ? ` (about ${formatBytes(plan.size)} at ${formatRate(plan.feeRate)})` : ''}
    </p>
  );
}

// One line under a pending transaction: where its value goes.
function spendSummary(tx) {
  if (tx.inputs === undefined) return null;
  const parts = [coinCount(tx.inputs)];
  if (tx.change > 0) parts.push(`${formatAmount(tx.change)} change`);
  if (tx.fee != null) parts.push(`${formatAmount(tx.fee)} fee`);
  if (tx.size) parts.push(formatBytes(tx.size));
  if (tx.rate != null) parts.push(formatRate(tx.rate));
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
  const [feeRate, setFeeRate] = useState(DEFAULT_FEE_RATE);
  const [error, setError] = useState('');
  const submit = event => {
    event.preventDefault();
    const value = Number(amount.trim());
    if (!from || !to) return setError('Choose who sends and who receives.');
    if (from === to) return setError('Sender and recipient must be different wallets.');
    if (!amount.trim() || !Number.isFinite(value) || value <= 0) return setError('Enter an amount greater than 0.');
    const result = onCreate?.(from, to, value, reference.trim(), feeRate) ?? { success: false, error: 'The transaction could not be added. Try again.' };
    if (result.success) onClose();
    else setError(result.error || 'The transaction could not be added. Try again.');
  };
  const edit = setter => event => { setter(event.target.value); setError(''); };
  const previewAmount = Number(amount.trim());
  const plan = from && previewAmount > 0 ? onPreview?.(from, previewAmount, feeRate, reference.trim()) ?? null : null;
  return (
    <form id="mempool-card-form" className="card-kit-form mempool-card-form" onSubmit={submit} aria-label="New transaction" noValidate
      onKeyDown={event => { if (event.key === 'Escape') onClose(); }}>
      <div className="mempool-card-fields">
        <label className="card-kit-field"><span {...term('mempool.from')}>From</span>
          <select className="card-kit-select" value={from} onChange={edit(setFrom)}>
            <option value="">Choose…</option>
            {names.map(name => <option key={name} value={name}>{name}</option>)}
          </select>
        </label>
        <label className="card-kit-field"><span {...term('mempool.to')}>To</span>
          <select className="card-kit-select" value={to} onChange={edit(setTo)}>
            <option value="">Choose…</option>
            {names.map(name => <option key={name} value={name}>{name}</option>)}
          </select>
        </label>
        <label className="card-kit-field"><span {...term('mempool.amount')}>Amount ({coinName})</span>
          <input className="card-kit-input is-mono" inputMode="decimal" placeholder="0.25" value={amount} onChange={edit(setAmount)}
            aria-invalid={error.startsWith('Enter an amount') ? 'true' : 'false'} />
        </label>
        <label className="card-kit-field mempool-card-ref"><span {...term('mempool.reference')}>Reference</span>
          <input className="card-kit-input" placeholder="Coffee (optional)" value={reference} maxLength={64} onChange={edit(setReference)} />
        </label>
        <label className="card-kit-field mempool-card-rate"><span {...term('mempool.fee-rate')}>Fee rate</span>
          <select className="card-kit-select" value={feeRate} onChange={event => { setFeeRate(Number(event.target.value)); setError(''); }}>
            {FEE_RATES.map(rate => <option key={rate} value={rate}>{rate} sat/B · {RATE_LABELS[rate]}</option>)}
          </select>
        </label>
      </div>
      <SpendPreview plan={plan} to={to} />
      {error && <p className="card-kit-error" role="alert">{error}</p>}
      <div className="card-kit-form-actions">
        <button type="submit" className="card-kit-btn" {...hint('mempool.add')}>Add to mempool</button>
        <button type="button" className="card-kit-btn is-ghost" onClick={onClose}>Cancel</button>
        <span className="card-kit-t3 mempool-card-form-hint">Waits here until a block has room; a higher fee per byte goes first.</span>
      </div>
    </form>
  );
}

// The next block's room for payments, filled by what fits.
function BlockSpace({ space, nextIndex }) {
  const share = space.capacity > 0 ? Math.min(1, space.bytes / space.capacity) : 0;
  const waiting = space.total - space.included;
  return (
    <div className="mempool-card-space" {...hint('mempool.space')}>
      <span className="mempool-card-space-label">Block space #{nextIndex}</span>
      <span className="mempool-card-space-meter" role="meter" aria-label={`Block space of #${nextIndex}`}
        aria-valuemin={0} aria-valuemax={space.capacity} aria-valuenow={space.bytes}><i style={{ width: `${share * 100}%` }} /></span>
      <span className="mempool-card-space-value">{formatBytes(space.bytes)} of {formatBytes(space.capacity)}</span>
      <span className="mempool-card-space-counts">{space.total} pending
        {waiting > 0 && <span className="mempool-card-space-waiting"> · {waiting} waiting</span>}
      </span>
    </div>
  );
}

export function MempoolCard({
  transactions = [], space = null, nextIndex, mining = false, remining = null, participants = [], coinName = 'powfyicoin', reward,
  onCreateTransaction, onPreviewTransaction, onOpenTransaction, autoTransact = false, onAutoTransact, newTxGlow = false, coach = null
}) {
  const [open, setOpen] = useState(false);
  const trigger = useRef(null);
  const closeForm = () => { setOpen(false); trigger.current?.focus(); };
  const names = participants.map(p => (typeof p === 'string' ? p : p.name)).filter(Boolean);
  const pending = transactions.length;
  const selecting = mining && remining === null;
  const included = space?.included ?? transactions.filter(tx => !tx.waits).length;
  return (
    <section className={`card-kit mempool-card${selecting ? ' is-mining' : ''}`} aria-label="Mempool">
      <div className="card-kit-head">
        <h2 className="card-kit-title" {...term('mempool.title')}>Mempool</h2>
        {pending > 0
          ? <span className={`card-kit-pill ${selecting ? 'is-live' : 'is-pending'}`}><i aria-hidden="true" />{selecting ? `${included} in #${nextIndex}` : `${pending} pending`}</span>
          : <span className="card-kit-pill is-none">Empty</span>}
        <span className="card-kit-aside mempool-card-aside">{selecting ? `candidate #${nextIndex}`
          : remining !== null ? `waiting during re-mine #${remining}`
          : space && space.included < space.total ? `${space.included} of ${space.total} fit into #${nextIndex}` : `goes into #${nextIndex}`}</span>
        <div className="mempool-card-action" role="group" aria-label="Transaction controls">
          <CoachMark target="workbench.new-transaction" coach={coach} className="mempool-card-coach">
            <button ref={trigger} type="button" className={`btn-tinted${open ? ' is-open' : newTxGlow ? '' : ' is-quiet'}`}
              aria-expanded={open ? 'true' : 'false'} aria-controls={open ? 'mempool-card-form' : undefined}
              {...hint('mempool.new')} onClick={() => setOpen(value => !value)}>
              <PlusIcon />New transaction
            </button>
          </CoachMark>
          <RepeatToggle name="Auto-transact" pressed={autoTransact} onToggle={onAutoTransact} hint={hint('mempool.auto', autoTransact)} />
        </div>
      </div>
      {open && <NewTransactionForm names={names} coinName={coinName} onCreate={onCreateTransaction} onPreview={onPreviewTransaction} onClose={closeForm} />}
      {space && pending > 0 && <BlockSpace space={space} nextIndex={nextIndex} />}
      <ul className="mempool-card-list" aria-label="Pending transactions">
        {pending === 0 && (
          <li className="card-kit-empty mempool-card-empty">No transactions waiting.
            <small>Add one with New transaction, or mine #{nextIndex} with only its coinbase.</small></li>
        )}
        {transactions.map((tx, i) => (
          <li key={tx.id ?? i} className={`mempool-card-tx${selecting && !tx.waits ? ' is-mining' : ''}${tx.waits ? ' is-waiting' : ''}`}>
            <span className="mempool-card-what">
              {onOpenTransaction && tx.tx
                ? <button type="button" className="mempool-card-open" aria-label={`Details of ${tx.from} to ${tx.to}, ${formatAmount(tx.amount)}`} {...hint('mempool.tx')} onClick={() => onOpenTransaction(tx.tx)}><b>{tx.from} → {tx.to}</b></button>
                : <b>{tx.from} → {tx.to}</b>}
              {tx.reference ? <small>{tx.reference}</small> : null}
              {spendSummary(tx) && <small className="mempool-card-spend">{spendSummary(tx)}</small>}
            </span>
            {tx.waits ? <span className={`mempool-card-state is-${tx.waits}`} {...hint('mempool.wait', tx.waits)}><i aria-hidden="true" />{WAITS[tx.waits]}</span>
              : selecting && <span className="mempool-card-state"><i aria-hidden="true" />being mined into #{nextIndex}</span>}
            <span className="mempool-card-amt">{formatAmount(tx.amount)}</span>
          </li>
        ))}
        <li className="mempool-card-tx is-coinbase">
          <span className="mempool-card-what"><b {...term('mempool.coinbase')}>Coinbase → winner</b><small>added when #{nextIndex} is mined</small></span>
          <span className="mempool-card-amt">{reward != null ? formatAmount(reward) : ''}</span>
        </li>
      </ul>
    </section>
  );
}
