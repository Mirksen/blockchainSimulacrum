import { useEffect, useState } from 'react';
import { CoachMark } from './CoachMark';
import './cardKit.css';
import './SelectedBlockCard.css';

// Selected block card (web/DESIGN.md, "Card grid"). Presentational: the parent passes the block as a view
// model with names already resolved, its check from `inspectBlocks()` and the
// stored hash of its predecessor.
//
// block:  { index, hash, previousHash, nonce, difficulty, isNewest?, miner?,
//           seconds?, tries?, reward?, transactions: [{ from, to, amount, reference? }] }
//         (`from: null` is the coinbase)
// status: inspectBlocks() entry { status, storedHash?, computedHash?, linkIntact? }
//         or just the status string; missing means 'valid'
// edit:   tamperedEdits entry { txIndex, from, to } for this block (or a list), null when unchanged

const STATUS = {
  valid: { cls: 'is-valid', text: 'Valid' },
  'hash-mismatch': { cls: 'is-err', text: 'Hash mismatch' },
  'link-broken': { cls: 'is-err', text: 'Link broken' },
  'signature-invalid': { cls: 'is-err', text: 'Signature invalid' },
  'built-on-broken': { cls: 'is-warn', text: 'Built on a broken block' }
};

const KNOWN_COLORS = ['lars', 'minas', 'alice', 'bob', 'chris'];

function formatAmount(value) {
  if (typeof value !== 'number' || !Number.isFinite(value)) return String(value ?? '');
  const fixed = value.toFixed(8).replace(/0+$/, '');
  const [whole, fraction = ''] = fixed.split('.');
  return `${whole}.${fraction.padEnd(2, '0')}`;
}

function leadingZeros(hash = '') {
  const match = /^0*/.exec(hash);
  return match ? match[0].length : 0;
}

function ShortHash({ hash, struck = false }) {
  if (!hash) return <span className="card-kit-mono card-kit-t3">none</span>;
  const head = hash.slice(0, 6);
  // A struck (no longer valid) hash shows no highlighted zeros.
  const zeros = struck ? 0 : leadingZeros(head);
  const body = (
    <>
      {zeros > 0 && <span className="card-kit-zero">{head.slice(0, zeros)}</span>}
      {head.slice(zeros)}…{hash.slice(-2)}
    </>
  );
  return <span className="card-kit-mono" title={hash}>{struck ? <s>{body}</s> : body}</span>;
}

function CopyButton({ value, label }) {
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    if (!copied) return undefined;
    const timer = setTimeout(() => setCopied(false), 1200);
    return () => clearTimeout(timer);
  }, [copied]);
  const copy = () => {
    try { void navigator.clipboard?.writeText(value)?.catch?.(() => {}); } catch { /* clipboard unavailable */ }
    setCopied(true);
  };
  return (
    <button type="button" className="card-kit-copy" onClick={copy} aria-label={copied ? `${label} copied` : `Copy ${label}`}>
      {copied ? 'Copied' : 'Copy'}
    </button>
  );
}

function Avatar({ name }) {
  const key = String(name).toLowerCase();
  const style = KNOWN_COLORS.includes(key) ? { '--av-color': `var(--${key})` } : undefined;
  return <span className={`card-kit-av is-xs${style ? '' : ' is-plain'}`} style={style} aria-hidden="true">{String(name).charAt(0).toUpperCase()}</span>;
}

const CheckIcon = () => (
  <svg width="10" height="10" viewBox="0 0 12 12" aria-hidden="true"><path d="M2.5 6.3l2.3 2.3 4.7-5" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round" /></svg>
);
const ExternalIcon = () => (
  <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true"><path d="M4.5 2.5h5v5M9.5 2.5L3 9" stroke="currentColor" strokeWidth="1.4" fill="none" strokeLinecap="round" strokeLinejoin="round" /></svg>
);
const PenIcon = () => (
  <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true"><path d="M2 10l1-3 5.5-5.5 2 2L5 9z" stroke="currentColor" strokeWidth="1.3" fill="none" strokeLinejoin="round" /></svg>
);
const UndoIcon = () => (
  <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true"><path d="M2.5 7a4 4 0 1 0 1.2-2.9M2.5 2v2.3h2.3" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" /></svg>
);

const txLabel = tx => `${tx.from ?? 'Coinbase'} → ${tx.to ?? 'unknown'}`;

function TamperEditor({ block, onSubmit, onCancel }) {
  const transactions = block.transactions;
  const [txIndex, setTxIndex] = useState('0');
  const [amount, setAmount] = useState(() => String(transactions[0]?.amount ?? ''));
  const [error, setError] = useState('');
  const pickTx = value => {
    setTxIndex(value);
    setAmount(String(transactions[Number(value)]?.amount ?? ''));
    setError('');
  };
  const submit = event => {
    event.preventDefault();
    const tx = transactions[Number(txIndex)];
    const trimmed = amount.trim();
    const value = Number(trimmed);
    if (!tx) return setError('Choose a transaction to change.');
    if (!trimmed || !Number.isFinite(value)) return setError('Enter an amount, for example 2.00.');
    if (value < 0) return setError('Enter an amount of 0 or more.');
    if (value === tx.amount) return setError('That is the current amount. Enter a different one.');
    onSubmit(Number(txIndex), value);
  };
  const errorId = `selected-block-${block.index}-tamper-error`;
  return (
    <form className="card-kit-form selected-block-editor" onSubmit={submit} aria-label={`Change a transaction amount in block ${block.index}`} noValidate>
      <div className="selected-block-editor-fields">
        <label className="card-kit-field">Transaction
          <select className="card-kit-select" value={txIndex} onChange={event => pickTx(event.target.value)}>
            {transactions.map((tx, i) => (
              <option key={i} value={String(i)}>{`tx ${i + 1} · ${txLabel(tx)} ${formatAmount(tx.amount)}`}</option>
            ))}
          </select>
        </label>
        <label className="card-kit-field">New amount
          <input className="card-kit-input is-mono" inputMode="decimal" value={amount}
            aria-invalid={error ? 'true' : 'false'} aria-describedby={error ? errorId : undefined}
            onChange={event => { setAmount(event.target.value); setError(''); }} />
        </label>
      </div>
      {error && <p className="card-kit-error" role="alert" id={errorId}>{error}</p>}
      <div className="card-kit-form-actions">
        <button type="submit" className="card-kit-btn">Change amount</button>
        <button type="button" className="card-kit-btn is-ghost" onClick={onCancel}>Cancel</button>
        <span className="card-kit-t3 selected-block-editor-hint">The block keeps its stored hash, so the change shows.</span>
      </div>
    </form>
  );
}

export function SelectedBlockCard({ block, status, prevHash, edit, onOpenDetails, onOpenChainLab, onTamper, onUndo, coach = null }) {
  // The editor belongs to one block; selecting another block closes it.
  const [editorFor, setEditorFor] = useState(null);

  if (!block) {
    return (
      <section className="card-kit selected-block" aria-label="Selected block">
        <div className="card-kit-head"><h2 className="card-kit-title">Selected block</h2></div>
        <p className="card-kit-empty">No block selected.<small>Select a block in the chain to see its hash, link and transactions.</small></p>
      </section>
    );
  }

  const check = typeof status === 'string' ? { status } : (status ?? {});
  const kind = STATUS[check.status] ? check.status : 'valid';
  const pill = STATUS[kind];
  const edits = Array.isArray(edit) ? edit : (edit ? [edit] : []);
  const transactions = block.transactions ?? [];
  const difficulty = block.difficulty ?? 0;
  const target = '0'.repeat(difficulty);
  const isGenesis = block.index === 0;
  const linkIntact = isGenesis ? true
    : (prevHash != null ? block.previousHash === prevHash : check.linkIntact !== false);
  const storedHash = check.storedHash ?? block.hash;
  const computedHash = check.computedHash ?? block.hash;
  const minerName = block.miner ?? null;
  const editorOpen = editorFor === block.index;

  const aside = {
    valid: isGenesis ? 'first block · no miner' : `${block.isNewest ? 'newest · ' : ''}mined by ${minerName ?? 'unknown'}`,
    'hash-mismatch': `${edits.length ? 'edited after mining' : 'content changed'}${minerName ? ` · mined by ${minerName}` : ''}`,
    'link-broken': `stores an old hash of #${block.index - 1}`,
    'built-on-broken': 'its own link is intact',
    'signature-invalid': 're-mined after an edit'
  }[kind];

  const hashRow = kind === 'hash-mismatch' ? (
    <>
      <div className="card-kit-kv"><dt>Hash now</dt><dd>
        <ShortHash hash={computedHash} /><CopyButton value={computedHash} label="hash" />
        <span className="card-kit-bad">{Math.min(leadingZeros(computedHash), difficulty)}/{difficulty} zeros</span>
        <span className="card-kit-t3">· does not start with {target}</span>
      </dd></div>
      <div className="card-kit-kv"><dt>As mined</dt><dd>
        <ShortHash hash={storedHash} struck />
        <span className="card-kit-t3">{block.isNewest ? 'the hash stored when it was mined' : `what #${block.index + 1} still stores as its previous hash`}</span>
      </dd></div>
    </>
  ) : (
    <div className="card-kit-kv"><dt>Hash</dt><dd>
      <ShortHash hash={block.hash} /><CopyButton value={block.hash} label="hash" />
      <span className="card-kit-t3">{target ? `starts with ${target}` : 'no target for Genesis'}</span>
    </dd></div>
  );

  const previousRow = (
    <div className="card-kit-kv"><dt>Previous</dt><dd>
      {isGenesis ? <span className="card-kit-t3">none · Genesis is the first block</span> : linkIntact ? (
        <>
          <ShortHash hash={block.previousHash} />
          <span className="card-kit-t3">= hash of #{block.index - 1}</span>
          <span className="card-kit-ok"><CheckIcon />link intact</span>
        </>
      ) : (
        <>
          <ShortHash hash={block.previousHash} struck />
          <span className="card-kit-t3">#{block.index - 1} is now <ShortHash hash={prevHash} /></span>
          <span className="card-kit-bad">link broken</span>
        </>
      )}
    </dd></div>
  );

  const nonceRow = kind === 'hash-mismatch' ? null : (
    <div className="card-kit-kv"><dt>Nonce</dt><dd>
      <span>{Number(block.nonce ?? 0).toLocaleString('en-US')}</span>
      <span className="card-kit-t3">{target ? `· makes the hash start with ${target}` : '· Genesis needs no proof of work'}</span>
    </dd></div>
  );

  const minerFacts = [
    block.seconds != null ? `${Number(block.seconds).toFixed(1)} s` : null,
    block.tries != null ? `${Number(block.tries).toLocaleString('en-US')} tries` : null,
    block.reward != null ? `reward ${formatAmount(block.reward)}` : null
  ].filter(Boolean);
  const minerRow = (
    <div className="card-kit-kv"><dt>Miner</dt><dd>
      {minerName ? (
        <><Avatar name={minerName} /><span>{minerName}</span>{minerFacts.length > 0 && <span className="card-kit-t3">· {minerFacts.join(' · ')}</span>}</>
      ) : <span className="card-kit-t3">none · Genesis was not mined</span>}
    </dd></div>
  );

  const firstEdit = edits[0];
  const editedTx = firstEdit ? transactions[firstEdit.txIndex] : null;
  const lastRow = firstEdit ? (
    <div className="card-kit-kv"><dt>Your edit</dt><dd>
      <span className="selected-block-edit">{editedTx ? txLabel(editedTx) : `tx ${firstEdit.txIndex + 1}`}{' '}
        <span className="card-kit-t3">{formatAmount(firstEdit.from)}</span> → <b>{formatAmount(firstEdit.to)}</b></span>
      <span className="card-kit-t3">· tx {firstEdit.txIndex + 1} of {transactions.length}{edits.length > 1 ? ` · ${edits.length - 1} more` : ''}</span>
    </dd></div>
  ) : (
    <div className="card-kit-kv"><dt>Transactions</dt><dd>
      <span>{transactions.length}</span>
      {transactions.length > 0 && (
        <span className="card-kit-t3 selected-block-txs">· {txLabel(transactions[0])} {formatAmount(transactions[0].amount)}
          {transactions.length > 1 ? ` and ${transactions.length - 1} more` : ''}</span>
      )}
    </dd></div>
  );

  const canTamper = transactions.length > 0 && typeof onTamper === 'function';

  return (
    <section className={`card-kit selected-block is-${kind}`} aria-label={`Selected block ${block.index}`}>
      <div className="card-kit-head">
        <h2 className="card-kit-title">Selected block #{block.index}</h2>
        <span className={`card-kit-pill ${pill.cls}`}>{kind === 'valid' ? <CheckIcon /> : <i aria-hidden="true" />}{pill.text}</span>
        <span className="card-kit-aside">{aside}</span>
      </div>
      <dl className="card-kit-kv-list selected-block-rows">
        {hashRow}
        {previousRow}
        {nonceRow}
        {minerRow}
        {lastRow}
      </dl>
      {kind === 'signature-invalid' && (
        <p className="selected-block-note" role="note">Re-mining fixes the hash, not the signature. Undo the edit to repair.</p>
      )}
      {editorOpen ? (
        <TamperEditor key={block.index} block={{ ...block, transactions }}
          onCancel={() => setEditorFor(null)}
          onSubmit={(txIndex, amount) => { setEditorFor(null); onTamper(block.index, txIndex, amount); }} />
      ) : (
        <div className="selected-block-actions">
          <button type="button" className="card-kit-btn" onClick={() => onOpenChainLab?.(block.index)}>
            Open in Chain lab<ExternalIcon />
          </button>
          {edits.length > 0 ? (
            <button type="button" className="card-kit-btn" onClick={() => onUndo?.(block.index)}><UndoIcon />Undo edit</button>
          ) : (
            <CoachMark target="workbench.selected-block.tamper" coach={coach} placement="above" className="selected-block-coach">
              <button type="button" className="card-kit-btn" disabled={!canTamper}
                title={canTamper ? 'Change one transaction amount in this block' : 'This block has no transaction to change'}
                onClick={() => setEditorFor(block.index)}><PenIcon />Tamper with this block</button>
            </CoachMark>
          )}
          <button type="button" className="card-kit-btn is-ghost selected-block-details" onClick={() => onOpenDetails?.(block.index)}>Details</button>
        </div>
      )}
    </section>
  );
}
