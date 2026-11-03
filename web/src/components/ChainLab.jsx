import { useEffect, useRef, useState } from 'react';
import { inspectChain, remineBlock, sampleChain } from '../lib/chainLab';
import { SEARCH_LIMIT } from '../lib/hashLab';
import { CoachMark } from './workbench/CoachMark';
import { ForkExperiment } from './ForkExperiment';
import { HeaderBytes } from './HeaderBytes';
import { MerkleProof } from './MerkleProof';
import { hint, term } from '../lib/hints';
import './ChainLab.css';

const TITLES = { repair: 'Change the past. Follow the links.', fork: 'Competing branches', merkle: 'Prove a payment' };
const INTROS = {
  repair: 'Each block includes the previous block’s stored hash. Repair one fingerprint and see what the next block still remembers.',
  fork: 'Explore which valid history this local network model follows, and why.',
  merkle: 'A light client holds only the block header. A few sibling hashes, one per tree level, prove that one payment is in the block.'
};

export function ChainLab({ onClose, embedded = false, onLessonEvent, coach = null, experiment, onExperimentChange }) {
  const [localExperiment, setLocalExperiment] = useState(() => coach?.target?.startsWith('chain-lab.fork-') ? 'fork' : 'repair');
  const shownExperiment = experiment ?? localExperiment;
  const [blocks, setBlocks] = useState(sampleChain);
  const [searching, setSearching] = useState(null);
  const initialData = useRef(blocks[0].data);
  const [feedback, setFeedback] = useState('Try changing the data in Block 1, then re-mine each block in order.');
  const active = useRef(null);
  useEffect(() => () => { active.current?.abort(); active.current = null; }, []);
  const checks = inspectChain(blocks);
  const consistent = checks.every(check => check.valid);
  const firstBroken = checks.findIndex(check => !check.valid);

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

  function switchExperiment(next) {
    if (next === shownExperiment) return;
    cancel();
    onLessonEvent?.({ type: 'fork_reset' });
    setLocalExperiment(next);
    onExperimentChange?.(next);
  }

  return <section className="chain-lab" aria-labelledby="chain-lab-title">
    <header className="chain-lab-header">
      <div><h2 id="chain-lab-title">{TITLES[shownExperiment] ?? TITLES.repair}</h2>
        <p>{INTROS[shownExperiment] ?? INTROS.repair}</p></div>
      {!embedded && <button className="btn btn-transparent" {...hint('lab.back')} onClick={() => { cancel(); onClose(); }}>Back to simulator</button>}
    </header>
    <nav className="chain-lab-experiments" aria-label="Chain lab experiment">
      <button type="button" className="btn btn-default" aria-pressed={shownExperiment === 'repair'} {...hint('lab.chain.repair')}
        onClick={() => switchExperiment('repair')}>Repair a chain</button>
      <button type="button" className="btn btn-default" aria-pressed={shownExperiment === 'fork'} {...hint('lab.chain.fork')}
        onClick={() => switchExperiment('fork')}>Competing branches</button>
      <button type="button" className="btn btn-default" aria-pressed={shownExperiment === 'merkle'} {...hint('lab.chain.merkle')}
        onClick={() => switchExperiment('merkle')}>Prove a payment</button>
    </nav>
    {shownExperiment === 'fork' ? <ForkExperiment onLessonEvent={onLessonEvent} coach={coach} />
      : shownExperiment === 'merkle' ? <MerkleProof /> : <>
    <div className="chain-lab-summary">
      <p className={consistent ? 'chain-lab-positive' : 'chain-lab-negative'}><strong {...term('lab.chain.status', consistent)}>{consistent ? 'Toy chain consistent' : 'Toy chain inconsistent'}</strong></p>
      <button className="btn btn-default" {...hint('lab.chain.reset')} onClick={reset}>Reset chain lab</button>
    </div>
    <p className="chain-lab-help">Change Block 1’s data, then re-mine 1, 2 and 3. The target is one leading hex zero. Editing data leaves the stored hashes and links untouched.</p>
    <ol className="chain-lab-blocks">
      {blocks.map((block, index) => {
        const check = checks[index];
        return <li key={block.number}>
          <article aria-labelledby={`chain-block-${index}-title`} className="chain-lab-block">
            <header><h3 id={`chain-block-${index}-title`}>Block {block.number}</h3>
              <span className={check.valid ? 'chain-lab-positive' : 'chain-lab-negative'} {...term('lab.chain.valid', check.valid)}>{check.valid ? 'Valid through here' : 'Invalid through here'}</span></header>
            <label htmlFor={`chain-data-${index}`}>Block {block.number} data</label>
            <CoachMark target={index === 0 ? 'chain-lab.block-1' : undefined} coach={index === 0 ? coach : null}>
              <textarea id={`chain-data-${index}`} rows={2} maxLength={300} value={block.data} {...hint('lab.chain.data', block.number)}
                onChange={event => edit(index, { data: event.target.value })} />
            </CoachMark>
            <label htmlFor={`chain-nonce-${index}`} {...term('lab.chain.nonce')}>Block {block.number} nonce</label>
            <input id={`chain-nonce-${index}`} inputMode="numeric" value={block.nonce}
              aria-invalid={!!check.error} aria-describedby={check.error ? `chain-error-${index}` : undefined} {...hint('lab.chain.nonce')}
              onChange={event => edit(index, { nonce: event.target.value })} />
            {check.error && <p id={`chain-error-${index}`} className="chain-lab-negative" role="alert">{check.error}</p>}
            <dl className="chain-lab-hashes">
              <dt {...term('lab.chain.previous', index === 0)}>Previous stored hash{index === 0 ? ' (starting anchor)' : ''}</dt><dd><code>{block.previousHash}</code></dd>
              <dt {...term('lab.chain.stored')}>Stored hash</dt><dd><code>{block.hash}</code></dd>
            </dl>
            <ul className="chain-lab-checks" aria-label={`Block ${block.number} checks`}>
              <li className={check.hashMatches ? 'chain-lab-positive' : 'chain-lab-negative'} {...term('lab.chain.check-hash', check.hashMatches)}>{check.hashMatches ? 'Hash matches input' : 'Hash does not match input'}</li>
              <li className={check.workValid ? 'chain-lab-positive' : 'chain-lab-negative'} {...term('lab.chain.check-target', check.workValid)}>{check.workValid ? 'Stored hash meets target' : 'Stored hash misses target'}</li>
              <li className={check.linkMatches ? 'chain-lab-positive' : 'chain-lab-negative'} {...term('lab.chain.check-link', check.linkMatches)}>{check.linkMatches ? 'Previous link matches' : 'Previous link does not match'}</li>
              {index > 0 && <li className={check.ancestorsValid ? 'chain-lab-positive' : 'chain-lab-negative'} {...term('lab.chain.check-ancestors', check.ancestorsValid)}>{check.ancestorsValid ? 'Earlier blocks valid' : 'Earlier block invalid'}</li>}
            </ul>
            <CoachMark target={index === firstBroken ? 'chain-lab.remine' : undefined} coach={index === firstBroken ? coach : null}>
              {searching === index ? <button className="btn btn-negative" {...hint('lab.chain.stop')} onClick={() => active.current?.abort()}>Stop search</button>
                : <span className="hint-wrap" {...hint('lab.chain.remine', block.number)}><button className="btn btn-emphasized" disabled={!!check.error || searching !== null} onClick={() => mine(index)}>Re-mine Block {block.number}</button></span>}
            </CoachMark>
            <details className="chain-lab-input"><summary {...hint('lab.chain.inspect', block.number)}>Inspect Block {block.number} input</summary>
              <p>Double SHA-256 hashes these 80 header bytes. The block’s data stands in for its transactions: the merkle root is its double SHA-256.</p>
              {check.trial ? <HeaderBytes header={check.trial.header} hash={check.trial.hash} /> : <code>Enter a valid nonce to inspect the input.</code>}
              <p>Re-mining uses the preceding stored hash and searches nonces from zero. A successful result replaces only this block.</p>
            </details>
          </article>
        </li>;
      })}
    </ol>
    <p className="chain-lab-feedback" role="status">{feedback}</p>
    <p className="chain-lab-help">Search checks up to {SEARCH_LIMIT.toLocaleString()} candidates and can be stopped. Editing, resetting or closing cancels pending work.</p>
    <p className="chain-lab-note">This separate toy chain demonstrates hashes, links and proof of work. A consistent toy chain does not repair transaction signatures or balances, or gain agreement from a network. Your simulator stays unchanged.</p>
    </>}
  </section>;
}
