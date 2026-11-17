import { useEffect, useId, useState } from 'react';
import { BLOCK_SIZES, LISTED_LIMIT, sampleBlock, txidOf, verifyProof } from '../lib/merkleLab';
import { HeaderBytes } from './HeaderBytes';
import { hint, term } from '../lib/hints/labs';
import { CoachMark } from './workbench/CoachMark';
import { merkleEvidence } from '../lib/missionEvidence';
import './MerkleProof.css';

const DEFAULT_SIZE = 16;
const defaultIndex = size => Math.min(5, size - 1);
const count = (n, word, plural = `${word}s`) => `${n.toLocaleString('en-US')} ${n === 1 ? word : plural}`;
const hashes = n => count(n, 'hash', 'hashes');

// Prove a payment: an isolated Chain lab experiment. A light client holds the block header
// only; the proof is the chosen payment plus one sibling hash per tree level.
export function MerkleProof({ onLessonEvent, coach = null, source = null, onUseExample, onBack }) {
  const report = source ? undefined : onLessonEvent;
  // An unfinished proof belongs to this mounted experiment. Leaving or hiding
  // guidance discards its evidence along with the local inputs.
  useEffect(() => () => report?.({ type: 'lesson_reset' }), [report]);
  const id = useId();
  const [exampleSize, setSize] = useState(DEFAULT_SIZE);
  const size = source?.size ?? exampleSize;
  const [index, setIndex] = useState(source?.initialIndex ?? defaultIndex(DEFAULT_SIZE));
  const [text, setText] = useState(null); // null: the block's own payment text.
  const [changedTxid, setChangedTxid] = useState(null);
  const [siblings, setSiblings] = useState({}); // level -> edited sibling hash.
  const [indexInput, setIndexInput] = useState(String(source?.initialIndex ?? defaultIndex(DEFAULT_SIZE)));

  const block = source ?? sampleBlock(size);
  const proof = block.proofFor(index);
  const paymentText = text ?? block.texts[index];
  const txid = source ? changedTxid ?? block.txids[index] : txidOf(paymentText);
  const path = proof.path.map(step => ({ ...step, hash: siblings[step.level] ?? step.hash }));
  const result = verifyProof(txid, path, block.root, proof.levels);
  const top = proof.path.length;
  const edited = text !== null || changedTxid !== null || Object.keys(siblings).length > 0;

  function choose(nextIndex, nextSize = size, shouldReport = true) {
    setIndex(nextIndex);
    setIndexInput(String(nextIndex));
    setText(null);
    setChangedTxid(null);
    setSiblings({});
    report?.({ type: 'lesson_reset' });
    if (shouldReport) {
      const nextBlock = source ?? sampleBlock(nextSize);
      const nextProof = nextBlock.proofFor(nextIndex);
      report?.(merkleEvidence(nextBlock.txids[nextIndex], nextProof.path, nextBlock.root, nextProof.levels));
    }
  }
  function changeSize(nextSize) {
    setSize(nextSize);
    choose(defaultIndex(nextSize), nextSize, false);
  }
  function reset() {
    if (source) choose(source.initialIndex, source.size, false);
    else { setSize(DEFAULT_SIZE); choose(defaultIndex(DEFAULT_SIZE), DEFAULT_SIZE, false); }
  }
  function typeIndex(value) {
    setIndexInput(value);
    const parsed = /^\d+$/.test(value.trim()) ? Number(value) : NaN;
    if (Number.isInteger(parsed) && parsed >= 0 && parsed < size) {
      choose(parsed);
    }
  }
  const indexInvalid = !(/^\d+$/.test(indexInput.trim()) && Number(indexInput) < size);

  function editSibling(level, value) {
    const next = { ...siblings, [level]: value.trim() };
    setSiblings(next);
    const nextPath = proof.path.map(step => ({ ...step, hash: next[step.level] ?? step.hash }));
    // Only a sibling edit of the block's own payment can count as one.
    report?.(merkleEvidence(txid, nextPath, block.root, proof.levels, text === null ? proof.path : null));
  }

  function levelName(level) {
    if (level === 0) return 'Level 0 · transaction';
    return level === top ? `Level ${level} · root` : `Level ${level}`;
  }
  let verdict;
  if (result.valid) verdict = `The computed root matches the header’s Merkle root using ${hashes(top)} from the proof.`;
  else if (result.malformed) {
    verdict = result.malformed.what === 'txid' ? 'The transaction ID must contain 64 hexadecimal characters.'
      : `The sibling at level ${result.malformed.level} is not a 64-character hash, so level ${result.failedAt} cannot be computed.`;
  } else if (source && result.computedRoot === source.treeRoot && source.treeRoot !== source.root) {
    verdict = 'The copied transactions produce a different root from the mined header. Reset proof cannot undo an edit made in the workbench.';
  } else verdict = `The proof fails at level ${result.failedAt}. From there the computed hashes differ from the block’s tree, and the computed root does not match the header’s merkle root.`;

  return <section className="merkle-proof" aria-labelledby={`${id}-title`}>
    <header className="merkle-proof-header">
      <h2 id={`${id}-title`}>Is this payment in the block?</h2>
      <button type="button" className="btn btn-default" {...hint(source ? 'lab.merkle.reset-proof' : 'lab.merkle.reset')} onClick={reset}>{source ? 'Reset proof' : 'Reset example'}</button>
    </header>

    {source && <section className="merkle-proof-source" aria-label="Workbench block copy">
      <h3>Your block #{source.blockIndex} · {count(size, 'transaction')}</h3>
      <p>This copy keeps the header and transactions as they were when you opened it. Edits here leave your workbench unchanged.</p>
      <div className="merkle-proof-source-actions">
        {onBack && <button type="button" className="btn btn-default" onClick={onBack}>Back to workbench</button>}
        {onUseExample && <button type="button" className="btn btn-transparent" onClick={onUseExample}>Use example block</button>}
      </div>
      {source.treeRoot !== source.root && <p className="merkle-proof-negative">These transactions no longer match the mined header’s Merkle root. An edit in the workbench changed the block after mining. Reset proof restores this copy, not the original block.</p>}
      {(!source.headerHashValid || !source.workValid) && <p className="merkle-proof-negative">The copied header does not match its stored block hash or proof-of-work target. Inclusion alone does not make this block valid.</p>}
    </section>}
    <div className={`merkle-proof-controls${source ? ' is-workbench' : ''}`}>
      {!source && <fieldset className="merkle-proof-sizes"><legend>Block size</legend>
        {BLOCK_SIZES.map(option => <label key={option} {...hint('lab.merkle.size', option)}>
          <input type="radio" name={`${id}-size`} value={option} checked={size === option} onChange={() => changeSize(option)} />
          {count(option, 'transaction')}
        </label>)}
      </fieldset>}
      <p className="merkle-proof-saving"><strong {...term('lab.merkle.saving')}>{hashes(top)} instead of {count(size, 'transaction')}</strong>
        <span>plus this transaction and the 80-byte header. The other transactions are not needed.</span></p>
    </div>

    <CoachMark target="chain-lab.merkle-payment" coach={coach} className="merkle-proof-coach">
    {size <= LISTED_LIMIT ? <div className="merkle-proof-list">
      <h3>Transactions in the block</h3>
      <ol start={0}>{block.texts.map((payment, position) => <li key={position}>
        <button type="button" className="merkle-proof-tx" aria-pressed={position === index} {...hint('lab.merkle.tx', position)} onClick={() => choose(position)}>
          <span className="merkle-proof-tx-number">Tx {position}</span>{' '}<span>{payment}</span>
        </button>
      </li>)}</ol>
    </div> : <div className="merkle-proof-pick">
      <label htmlFor={`${id}-index`}>Transaction number (0–{(size - 1).toLocaleString('en-US')})</label>
      <input id={`${id}-index`} inputMode="numeric" value={indexInput} aria-invalid={indexInvalid} {...hint('lab.merkle.pick')}
        aria-describedby={indexInvalid ? `${id}-index-error` : undefined} onChange={event => typeIndex(event.target.value)} />
      {indexInvalid && <p id={`${id}-index-error`} className="merkle-proof-error">Enter a whole number from 0 to {(size - 1).toLocaleString('en-US')}. The proof still shows transaction {index}.</p>}
      <p className="merkle-proof-hint">The other {count(size - 1, 'transaction')} stay hidden: the proof does not need them.</p>
    </div>}

    </CoachMark>
    <div className="merkle-proof-header-card">
      <h3 {...term('lab.merkle.header')}>Block header (what the light client holds)</h3>
      <dl className="merkle-proof-kv">
        <dt {...term('lab.merkle.root')}>Merkle root</dt><dd><code>{block.root}</code></dd>
        <dt {...term('lab.merkle.block-hash')}>Block hash</dt><dd><code>{block.hash}</code></dd>
      </dl>
      <details><summary {...hint('lab.merkle.inspect')}>Inspect the 80 header bytes</summary><HeaderBytes header={block.header} hash={source?.headerHash ?? block.hash} /></details>
    </div>

    {source ? <div className="merkle-proof-payment">
      <label htmlFor={`${id}-txid`}>Transaction ID of transaction {index}</label>
      <input id={`${id}-txid`} className="merkle-proof-hash-input" spellCheck={false} value={txid} {...hint('lab.merkle.txid')}
        aria-invalid={!/^[0-9a-f]{64}$/.test(txid)} onChange={event => setChangedTxid(event.target.value.trim().toLowerCase())} />
      <p className="merkle-proof-hint">Double SHA-256 of the copied raw transaction bytes, displayed byte-reversed. Change one hex character here or in a sibling to test the proof.</p>
      <details><summary>Copied raw transaction bytes</summary><code className="merkle-proof-hash">{source.transactions[index].hex}</code></details>
      {size === 1 && <p className="merkle-proof-hint">A one-transaction block needs no siblings: its TXID is the Merkle root. Change the TXID to break this proof.</p>}
    </div> : <div className="merkle-proof-payment">
      <label htmlFor={`${id}-text`}>Payment text of transaction {index}</label>
      <textarea id={`${id}-text`} rows={2} maxLength={300} value={paymentText} {...hint('lab.merkle.text')} onChange={event => { setText(event.target.value); report?.({ type: 'lesson_reset' }); }} />
    </div>}

    <h3 className="merkle-proof-path-title" {...term('lab.merkle.path')}>Proof path for transaction {index}</h3>
    <ol className="merkle-proof-path" aria-label="Proof path">
      {result.steps.map(step => {
        const failed = step.level === result.failedAt;
        const sibling = path[step.level];
        const siblingInvalid = result.malformed?.what === 'sibling' && result.malformed.level === step.level;
        return <li key={step.level} className={`merkle-proof-level${failed ? ' is-failed' : ''}`} aria-label={levelName(step.level)}>
          <div className="merkle-proof-level-head">
            <strong>{levelName(step.level)}</strong>
            {failed && <span className="merkle-proof-negative">{!step.hash ? 'Cannot be computed here' : source && step.level === top && step.hash === source.treeRoot && source.treeRoot !== source.root ? 'Does not match the mined header’s root' : 'Differs from the block’s tree here'}</span>}
          </div>
          <p className="merkle-proof-formula">{step.level === 0 ? (source ? 'txid = SHA-256d(raw transaction bytes)' : 'txid = SHA-256d(payment text)')
            : `= SHA-256d(${path[step.level - 1].side === 'left' ? `sibling ‖ level ${step.level - 1}` : `level ${step.level - 1} ‖ sibling`})`}</p>
          <code className="merkle-proof-hash">{step.hash ?? 'Cannot compute: an input below is not a hash.'}</code>
          {sibling && <CoachMark target={step.level === 0 ? 'chain-lab.merkle-sibling' : undefined} coach={coach} className="merkle-proof-coach"><div className="merkle-proof-sibling">
            <label htmlFor={`${id}-sibling-${step.level}`}>Sibling at level {step.level} (on the {sibling.side})</label>
            <input id={`${id}-sibling-${step.level}`} className="merkle-proof-hash-input" spellCheck={false} value={sibling.hash} {...hint('lab.merkle.sibling', sibling.side)}
              aria-invalid={siblingInvalid} aria-describedby={siblingInvalid ? `${id}-sibling-${step.level}-error` : undefined}
              onChange={event => editSibling(step.level, event.target.value)} />
            {siblingInvalid && <p id={`${id}-sibling-${step.level}-error`} className="merkle-proof-error">Enter 64 hexadecimal characters.</p>}
          </div></CoachMark>}
        </li>;
      })}
    </ol>

    <dl className="merkle-proof-kv merkle-proof-compare">
      <dt {...term('lab.merkle.computed')}>Computed root</dt><dd><code>{result.computedRoot ?? 'Cannot compute'}</code></dd>
      <dt {...term('lab.merkle.root')}>Header’s Merkle root</dt><dd><code>{block.root}</code></dd>
    </dl>
    <p className={`merkle-proof-verdict ${result.valid ? 'merkle-proof-positive' : 'merkle-proof-negative'}`} role="status">
      <strong>{result.valid ? 'Inclusion proven' : 'Inclusion not proven'}</strong> · {verdict}</p>
    {edited && <p className="merkle-proof-hint">An edit changes one hash; every level above it changes too. {source ? 'Reset proof restores the copied transaction and siblings.' : 'Reset example restores the block’s own proof.'}</p>}

    <p className="merkle-proof-note">Hashes are shown byte-reversed, like block explorers; each level is the double SHA-256 of its two children in internal byte order. An odd level pairs its last hash with itself. {source ? 'These are your simulated transactions. A matching proof demonstrates inclusion only; it does not check signatures, balances or network consensus. Nothing here changes your workbench, wallets or mining pool.' : 'The payment texts are toy records, not signed transactions; this experiment never changes your simulator, wallets or mining pool.'}</p>
  </section>;
}
