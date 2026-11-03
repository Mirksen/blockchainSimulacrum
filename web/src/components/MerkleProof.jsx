import { useId, useState } from 'react';
import { BLOCK_SIZES, LISTED_LIMIT, sampleBlock, txidOf, verifyProof } from '../lib/merkleLab';
import { HeaderBytes } from './HeaderBytes';
import './MerkleProof.css';

const DEFAULT_SIZE = 16;
const defaultIndex = size => Math.min(5, size - 1);
const count = (n, word, plural = `${word}s`) => `${n.toLocaleString('en-US')} ${n === 1 ? word : plural}`;
const hashes = n => count(n, 'hash', 'hashes');

// Prove a payment: an isolated Chain lab experiment. A light client holds the block header
// only; the proof is the chosen payment plus one sibling hash per tree level.
export function MerkleProof() {
  const id = useId();
  const [size, setSize] = useState(DEFAULT_SIZE);
  const [index, setIndex] = useState(defaultIndex(DEFAULT_SIZE));
  const [text, setText] = useState(null); // null: the block's own payment text.
  const [siblings, setSiblings] = useState({}); // level -> edited sibling hash.
  const [indexInput, setIndexInput] = useState(String(defaultIndex(DEFAULT_SIZE)));

  const block = sampleBlock(size);
  const proof = block.proofFor(index);
  const paymentText = text ?? block.texts[index];
  const txid = txidOf(paymentText);
  const path = proof.path.map(step => ({ ...step, hash: siblings[step.level] ?? step.hash }));
  const result = verifyProof(txid, path, block.root, proof.levels);
  const top = proof.path.length;
  const edited = text !== null || Object.keys(siblings).length > 0;

  function choose(nextIndex) {
    setIndex(nextIndex);
    setIndexInput(String(nextIndex));
    setText(null);
    setSiblings({});
  }
  function changeSize(nextSize) {
    setSize(nextSize);
    choose(defaultIndex(nextSize));
  }
  function reset() {
    setSize(DEFAULT_SIZE);
    choose(defaultIndex(DEFAULT_SIZE));
  }
  function typeIndex(value) {
    setIndexInput(value);
    const parsed = /^\d+$/.test(value.trim()) ? Number(value) : NaN;
    if (Number.isInteger(parsed) && parsed >= 0 && parsed < size) {
      setIndex(parsed);
      setText(null);
      setSiblings({});
    }
  }
  const indexInvalid = !(/^\d+$/.test(indexInput.trim()) && Number(indexInput) < size);

  function levelName(level) {
    if (level === 0) return 'Level 0 · transaction';
    return level === top ? `Level ${level} · root` : `Level ${level}`;
  }
  let verdict;
  if (result.valid) verdict = `The computed root matches the header’s merkle root with ${hashes(top)}.`;
  else if (result.malformed) {
    verdict = result.malformed.what === 'txid' ? 'The payment has no valid txid.'
      : `The sibling at level ${result.malformed.level} is not a 64-character hash, so level ${result.failedAt} cannot be computed.`;
  } else verdict = `The proof fails at level ${result.failedAt}. From there the computed hashes differ from the block’s tree, and the computed root does not match the header’s merkle root.`;

  return <section className="merkle-proof" aria-labelledby={`${id}-title`}>
    <header className="merkle-proof-header">
      <h2 id={`${id}-title`}>Is this payment in the block?</h2>
      <button type="button" className="btn btn-default" onClick={reset}>Reset example</button>
    </header>

    <div className="merkle-proof-controls">
      <fieldset className="merkle-proof-sizes"><legend>Block size</legend>
        {BLOCK_SIZES.map(option => <label key={option}>
          <input type="radio" name={`${id}-size`} value={option} checked={size === option} onChange={() => changeSize(option)} />
          {count(option, 'transaction')}
        </label>)}
      </fieldset>
      <p className="merkle-proof-saving"><strong>{hashes(top)} instead of {count(size, 'transaction')}</strong>
        <span>plus the 80-byte header: the light client never downloads the other payments.</span></p>
    </div>

    {size <= LISTED_LIMIT ? <div className="merkle-proof-list">
      <h3>Transactions in the block</h3>
      <ol start={0}>{block.texts.map((payment, position) => <li key={position}>
        <button type="button" className="merkle-proof-tx" aria-pressed={position === index} onClick={() => choose(position)}>
          <span className="merkle-proof-tx-number">Tx {position}</span>{' '}<span>{payment}</span>
        </button>
      </li>)}</ol>
    </div> : <div className="merkle-proof-pick">
      <label htmlFor={`${id}-index`}>Transaction number (0–{(size - 1).toLocaleString('en-US')})</label>
      <input id={`${id}-index`} inputMode="numeric" value={indexInput} aria-invalid={indexInvalid}
        aria-describedby={indexInvalid ? `${id}-index-error` : undefined} onChange={event => typeIndex(event.target.value)} />
      {indexInvalid && <p id={`${id}-index-error`} className="merkle-proof-error">Enter a whole number from 0 to {(size - 1).toLocaleString('en-US')}. The proof still shows transaction {index}.</p>}
      <p className="merkle-proof-hint">The other {count(size - 1, 'transaction')} stay hidden: the proof does not need them.</p>
    </div>}

    <div className="merkle-proof-header-card">
      <h3>Block header (what the light client holds)</h3>
      <dl className="merkle-proof-kv">
        <dt>Merkle root</dt><dd><code>{block.root}</code></dd>
        <dt>Block hash</dt><dd><code>{block.hash}</code></dd>
      </dl>
      <details><summary>Inspect the 80 header bytes</summary><HeaderBytes header={block.header} hash={block.hash} /></details>
    </div>

    <div className="merkle-proof-payment">
      <label htmlFor={`${id}-text`}>Payment text of transaction {index}</label>
      <textarea id={`${id}-text`} rows={2} maxLength={300} value={paymentText} onChange={event => setText(event.target.value)} />
    </div>

    <h3 className="merkle-proof-path-title">Proof path for transaction {index}</h3>
    <ol className="merkle-proof-path" aria-label="Proof path">
      {result.steps.map(step => {
        const failed = step.level === result.failedAt;
        const sibling = path[step.level];
        const siblingInvalid = result.malformed?.what === 'sibling' && result.malformed.level === step.level;
        return <li key={step.level} className={`merkle-proof-level${failed ? ' is-failed' : ''}`} aria-label={levelName(step.level)}>
          <div className="merkle-proof-level-head">
            <strong>{levelName(step.level)}</strong>
            {failed && <span className="merkle-proof-negative">{step.hash ? 'Differs from the block’s tree here' : 'Cannot be computed here'}</span>}
          </div>
          <p className="merkle-proof-formula">{step.level === 0 ? 'txid = SHA-256d(payment text)'
            : `= SHA-256d(${path[step.level - 1].side === 'left' ? `sibling ‖ level ${step.level - 1}` : `level ${step.level - 1} ‖ sibling`})`}</p>
          <code className="merkle-proof-hash">{step.hash ?? 'Cannot compute: an input below is not a hash.'}</code>
          {sibling && <div className="merkle-proof-sibling">
            <label htmlFor={`${id}-sibling-${step.level}`}>Sibling at level {step.level} (on the {sibling.side})</label>
            <input id={`${id}-sibling-${step.level}`} className="merkle-proof-hash-input" spellCheck={false} value={sibling.hash}
              aria-invalid={siblingInvalid} aria-describedby={siblingInvalid ? `${id}-sibling-${step.level}-error` : undefined}
              onChange={event => setSiblings(current => ({ ...current, [step.level]: event.target.value.trim() }))} />
            {siblingInvalid && <p id={`${id}-sibling-${step.level}-error`} className="merkle-proof-error">Enter 64 hexadecimal characters.</p>}
          </div>}
        </li>;
      })}
    </ol>

    <dl className="merkle-proof-kv merkle-proof-compare">
      <dt>Computed root</dt><dd><code>{result.computedRoot ?? 'Cannot compute'}</code></dd>
      <dt>Header’s merkle root</dt><dd><code>{block.root}</code></dd>
    </dl>
    <p className={`merkle-proof-verdict ${result.valid ? 'merkle-proof-positive' : 'merkle-proof-negative'}`} role="status">
      <strong>{result.valid ? 'Payment proven' : 'Payment not proven'}</strong> · {verdict}</p>
    {edited && <p className="merkle-proof-hint">An edit changes one hash; every level above it changes too. Reset example restores the block’s own proof.</p>}

    <p className="merkle-proof-note">Hashes are shown byte-reversed, like block explorers; each level is the double SHA-256 of its two children in internal byte order. An odd level pairs its last hash with itself. The payment texts are toy records, not signed transactions; this experiment never changes your simulator, wallets or mining pool.</p>
  </section>;
}
