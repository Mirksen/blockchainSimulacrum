import { useEffect, useRef, useState } from 'react';
import { inspectChain, remineBlock, sampleChain } from '../lib/chainLab';
import { SEARCH_LIMIT } from '../lib/hashLab';
import './ChainLab.css';

export function ChainLab({ onClose, embedded = false, onLessonEvent }) {
  const [blocks, setBlocks] = useState(sampleChain);
  const [searching, setSearching] = useState(null);
  const initialData = useRef(blocks[0].data);
  const [feedback, setFeedback] = useState('Try changing the data in Block 1, then re-mine each block in order.');
  const active = useRef(null);
  useEffect(() => () => { active.current?.abort(); active.current = null; }, []);
  const checks = inspectChain(blocks);
  const consistent = checks.every(check => check.valid);

  function cancel() {
    active.current?.abort();
    active.current = null;
    setSearching(null);
  }
  function edit(index, patch) {
    cancel();
    const next = blocks.map((block, position) => position === index ? { ...block, ...patch } : block);
    setBlocks(next);
    onLessonEvent?.({ type: 'chain_checked', consistent: inspectChain(next).every(check => check.valid),
      changedFirstBlock: next[0].data !== initialData.current });
    setFeedback('Input changed. Stored hashes and links stay as they were until you re-mine a block.');
  }
  function reset() {
    cancel();
    setBlocks(sampleChain());
    onLessonEvent?.({ type: 'lesson_reset' });
    setFeedback('Example restored. Change the first block to start again.');
  }
  async function mine(index) {
    cancel();
    const controller = new AbortController();
    active.current = controller;
    setSearching(index);
    setFeedback(`Re-mining Block ${index + 1}… 0 candidates checked.`);
    const result = await remineBlock(blocks, index, { signal: controller.signal, onProgress: attempts => {
      if (active.current === controller) setFeedback(`Re-mining Block ${index + 1}… ${attempts.toLocaleString()} candidates checked.`);
    } });
    if (active.current !== controller) return;
    active.current = null;
    setSearching(null);
    if (result.status === 'found' && !controller.signal.aborted) {
      const next = blocks.map((block, position) => position === index ? result.block : block);
      setBlocks(next);
      onLessonEvent?.({ type: 'chain_checked', consistent: inspectChain(next).every(check => check.valid),
        changedFirstBlock: next[0].data !== initialData.current });
      setFeedback(`Block ${index + 1} re-mined in ${result.attempts.toLocaleString()} ${result.attempts === 1 ? 'attempt' : 'attempts'}. Other blocks are unchanged; check the next link.`);
    } else {
      setFeedback(`${result.status === 'stopped' || controller.signal.aborted ? 'Stopped' : 'No match'} after ${result.attempts.toLocaleString()} attempts. No stored block was changed.`);
    }
  }

  return <section className="chain-lab" aria-labelledby="chain-lab-title">
    <header className="chain-lab-header">
      <div><h2 id="chain-lab-title">Change the past. Follow the links.</h2>
        <p>Each block includes the previous block’s stored hash. Repair one fingerprint and see what the next block still remembers.</p></div>
      {!embedded && <button className="btn btn-transparent" onClick={() => { cancel(); onClose(); }}>Back to simulator</button>}
    </header>
    <div className="chain-lab-summary">
      <p className={consistent ? 'chain-lab-positive' : 'chain-lab-negative'}><strong>{consistent ? 'Toy chain consistent' : 'Toy chain inconsistent'}</strong></p>
      <button className="btn btn-default" onClick={reset}>Reset chain lab</button>
    </div>
    <p className="chain-lab-help">Change Block 1’s data, then re-mine 1, 2 and 3. The target is one leading hex zero. Editing data leaves the stored hashes and links untouched.</p>
    <ol className="chain-lab-blocks">
      {blocks.map((block, index) => {
        const check = checks[index];
        return <li key={block.number}>
          <article aria-labelledby={`chain-block-${index}-title`} className="chain-lab-block">
            <header><h3 id={`chain-block-${index}-title`}>Block {block.number}</h3>
              <span className={check.valid ? 'chain-lab-positive' : 'chain-lab-negative'}>{check.valid ? 'Valid through here' : 'Invalid through here'}</span></header>
            <label htmlFor={`chain-data-${index}`}>Block {block.number} data</label>
            <textarea id={`chain-data-${index}`} rows={2} maxLength={300} value={block.data}
              onChange={event => edit(index, { data: event.target.value })} />
            <label htmlFor={`chain-nonce-${index}`}>Block {block.number} nonce</label>
            <input id={`chain-nonce-${index}`} inputMode="numeric" value={block.nonce}
              aria-invalid={!!check.error} aria-describedby={check.error ? `chain-error-${index}` : undefined}
              onChange={event => edit(index, { nonce: event.target.value })} />
            {check.error && <p id={`chain-error-${index}`} className="chain-lab-negative" role="alert">{check.error}</p>}
            <dl className="chain-lab-hashes">
              <dt>Previous stored hash{index === 0 ? ' (starting anchor)' : ''}</dt><dd><code>{block.previousHash}</code></dd>
              <dt>Stored hash</dt><dd><code>{block.hash}</code></dd>
            </dl>
            <ul className="chain-lab-checks" aria-label={`Block ${block.number} checks`}>
              <li className={check.hashMatches ? 'chain-lab-positive' : 'chain-lab-negative'}>{check.hashMatches ? 'Hash matches input' : 'Hash does not match input'}</li>
              <li className={check.workValid ? 'chain-lab-positive' : 'chain-lab-negative'}>{check.workValid ? 'Stored hash meets target' : 'Stored hash misses target'}</li>
              <li className={check.linkMatches ? 'chain-lab-positive' : 'chain-lab-negative'}>{check.linkMatches ? 'Previous link matches' : 'Previous link does not match'}</li>
              {index > 0 && <li className={check.ancestorsValid ? 'chain-lab-positive' : 'chain-lab-negative'}>{check.ancestorsValid ? 'Earlier blocks valid' : 'Earlier block invalid'}</li>}
            </ul>
            {searching === index ? <button className="btn btn-negative" onClick={() => active.current?.abort()}>Stop search</button>
              : <button className="btn btn-emphasized" disabled={!!check.error || searching !== null} onClick={() => mine(index)}>Re-mine Block {block.number}</button>}
            <details className="chain-lab-input"><summary>Inspect Block {block.number} input</summary>
              <p>SHA-256 hashes this exact UTF-8 JSON text:</p><code>{check.trial?.preimage || 'Enter a valid nonce to inspect the input.'}</code>
              <p>Recomputed hash:</p><code>{check.trial?.hash || 'Waiting for a valid nonce'}</code>
              <p>Re-mining uses the preceding stored hash and searches nonces from zero. A successful result replaces only this block.</p>
            </details>
          </article>
        </li>;
      })}
    </ol>
    <p className="chain-lab-feedback" role="status">{feedback}</p>
    <p className="chain-lab-help">Search checks up to {SEARCH_LIMIT.toLocaleString()} candidates and can be stopped. Editing, resetting or closing cancels pending work.</p>
    <p className="chain-lab-note">This separate text-only chain demonstrates hashes, links and proof of work. A consistent toy chain does not repair transaction signatures or balances, or gain agreement from a network. Your simulator stays unchanged.</p>
  </section>;
}
