import { useEffect, useRef, useState } from 'react';
import { CoachMark } from './CoachMark';
import { formatInterval, issueText } from './blockView';
import './cardKit.css';
import './SelectedBlockCard.css';

// Selected block card (web/DESIGN.md, "Card grid"). Presentational: the parent passes the block as a view
// model with names already resolved, its check from `inspectBlocks()` and the
// stored hash of its predecessor.
//
// block:  { index, hash, previousHash, nonce, difficulty, isNewest?, miner?,
//           seconds?, tries?, reward?, transactions: [{ from, to, amount, reference?, spentIn? }] }
//         (`from: null` is the coinbase; `spentIn` is the block that spends its first output)
// status: inspectBlocks() entry { status, storedHash?, computedHash?, linkIntact? }
//         or just the status string; missing means 'valid'
// edit:   tamperedEdits entry { txIndex, from, to } for this block (or a list), null when unchanged

const STATUS = {
  valid: { cls: 'is-valid', text: 'Valid' },
  'hash-mismatch': { cls: 'is-err', text: 'Hash mismatch' },
  'link-broken': { cls: 'is-err', text: 'Link broken' },
  'signature-invalid': { cls: 'is-err', text: 'Signature invalid' },
  'transaction-invalid': { cls: 'is-err', text: 'Transaction invalid' },
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

// All 64 characters, always: their length is part of what the card teaches. Where a
// line is too short for them they break once, in the middle.
function FullHash({ hash, struck = false }) {
  if (!hash) return <span className="card-kit-mono card-kit-t3">none</span>;
  // A struck (no longer valid) hash shows no highlighted zeros.
  const zeros = struck ? 0 : leadingZeros(hash);
  const half = Math.ceil(hash.length / 2);
  const part = (from, to) => {
    const lead = Math.max(0, Math.min(zeros, to) - from);
    return <span>{lead > 0 && <span className="card-kit-zero">{hash.slice(from, from + lead)}</span>}{hash.slice(from + lead, to)}</span>;
  };
  const body = <>{part(0, half)}{part(half, hash.length)}</>;
  return <span className="selected-block-hash">{struck ? <s>{body}</s> : body}</span>;
}

function CopyButton({ value, label }) {
  const [copied, setCopied] = useState(null);
  const latestRequest = useRef(null);
  useEffect(() => () => { latestRequest.current = null; }, []);
  useEffect(() => {
    if (!copied) return undefined;
    const timer = setTimeout(() => setCopied(null), 1200);
    return () => clearTimeout(timer);
  }, [copied]);
  const copy = async () => {
    const request = {};
    latestRequest.current = request;
    setCopied(null);
    try {
      const clipboard = navigator.clipboard;
      if (typeof clipboard?.writeText !== 'function') return;
      await clipboard.writeText(value);
      if (latestRequest.current === request) setCopied(request);
    } catch { /* Clipboard refused: keep the Copy label. */ }
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
const MAX_MONEY = 21000000;

// What an edit of this transaction will do, before the learner makes it.
function editConsequence(tx) {
  if (tx?.from != null) return 'Signed by its sender: any change breaks the signature, and re-mining cannot fix that.';
  if (tx?.spentIn != null) return `Block #${tx.spentIn} spends this coin. A new txid leaves that spend pointing at nothing.`;
  return 'No signature and nobody spent it yet. Lowering it can be re-mined; claiming more than reward plus fees cannot.';
}

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
    if (value > MAX_MONEY) return setError('Enter at most 21000000, every coin there will ever be.');
    if (Number(value.toFixed(8)) !== value) return setError('Use at most 8 decimal places: one satoshi is the smallest amount.');
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
        <span className="card-kit-t3 selected-block-editor-hint">{editConsequence(transactions[Number(txIndex)])}</span>
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
    'signature-invalid': 're-mined after an edit',
    'transaction-invalid': 're-mined after an edit'
  }[kind];

  const hashRow = kind === 'hash-mismatch' ? (
    <>
      <div className="card-kit-kv is-wrap"><dt>Hash now</dt><dd>
        <FullHash hash={computedHash} /><CopyButton key={`${block.index}:${computedHash}`} value={computedHash} label="hash" />
        <span className="card-kit-bad">{Math.min(leadingZeros(computedHash), difficulty)}/{difficulty} zeros</span>
        <span className="card-kit-t3">· does not start with {target}</span>
      </dd></div>
      <div className="card-kit-kv is-wrap"><dt>As mined</dt><dd>
        <FullHash hash={storedHash} struck />
        <span className="card-kit-t3">{block.isNewest ? 'the hash stored when it was mined' : `what #${block.index + 1} still stores as its previous hash`}</span>
      </dd></div>
    </>
  ) : (
    <div className="card-kit-kv"><dt>Hash</dt><dd>
      <FullHash hash={block.hash} /><CopyButton key={`${block.index}:${block.hash}`} value={block.hash} label="hash" />
    </dd></div>
  );

  const previousRow = (
    <div className={`card-kit-kv${linkIntact && !block.anchor ? '' : ' is-wrap'}`}><dt>Previous</dt><dd>
      {isGenesis ? (block.anchor
        ? <><FullHash hash={block.anchor.hash} /><span className="card-kit-t3">= Bitcoin block #{block.anchor.height}</span></>
        : <span className="card-kit-t3">none · Genesis is the first block</span>) : linkIntact ? (
        <>
          <FullHash hash={block.previousHash} />
          <span className="card-kit-ok" title={`Link intact: this is the hash of #${block.index - 1}`}>
            <CheckIcon />= #{block.index - 1}<span className="card-kit-sr">, the hash of the block before, link intact</span>
          </span>
        </>
      ) : (
        <>
          <FullHash hash={block.previousHash} struck />
          <span className="card-kit-t3">#{block.index - 1} is now <FullHash hash={prevHash} /></span>
          <span className="card-kit-bad">link broken</span>
        </>
      )}
    </dd></div>
  );

  const nonceRow = kind === 'hash-mismatch' ? null : (
    <div className="card-kit-kv"><dt>Nonce</dt><dd>
      <span>{Number(block.nonce ?? 0).toLocaleString('en-US')}</span>
      <span className="card-kit-t3">· makes the double SHA-256 of 80 bytes start with {target}</span>
    </dd></div>
  );

  const minerFacts = [
    formatInterval(block.seconds),
    block.tries != null ? `${Number(block.tries).toLocaleString('en-US')} tries` : null,
    block.reward != null ? `reward ${formatAmount(block.reward)}` : null
  ].filter(Boolean);
  const minerRow = (
    <div className="card-kit-kv"><dt>Miner</dt><dd>
      {minerName ? (
        <><Avatar name={minerName} /><span>{minerName}</span>{minerFacts.length > 0 && <span className="card-kit-t3">· {minerFacts.join(' · ')}</span>}</>
      ) : <span className="card-kit-t3">{isGenesis ? 'none · Genesis was mined once before launch' : 'unknown'}</span>}
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
      {kind === 'transaction-invalid' && (
        <p className="selected-block-note" role="note">{issueText(check.issue?.reason, block.index)} Undo the edit to repair.</p>
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
