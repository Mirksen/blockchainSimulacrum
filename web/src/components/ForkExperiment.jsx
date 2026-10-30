import { useEffect, useId, useRef, useState } from 'react';
import { BLOCK_WORK, ROUND_LIMIT, createForkExperiment, inspectFork, mineForkRound } from '../lib/forkLab';
import { CoachMark } from './workbench/CoachMark';
import './ForkExperiment.css';

const nameOf = branch => branch === 'alternative' ? 'Alternative' : 'Original';
const initialFeedback = 'Both branches need valid proofs. Mine a block to compare their work.';

function BlockRecord({ block }) {
  return <li className="fork-experiment-block">
    <strong>Block {block.number}</strong>
    <p>{block.data}</p>
    <code className="fork-experiment-short-hash"><strong>{block.hash.slice(0, 1)}</strong>{block.hash.slice(1, 6)}…{block.hash.slice(-2)}</code>
    <details><summary>Inspect block {block.number}</summary>
      <dl><dt>Nonce</dt><dd>{block.nonce}</dd><dt>Stored hash</dt><dd><code>{block.hash}</code></dd>
        <dt>Previous hash</dt><dd><code>{block.previousHash}</code></dd></dl>
    </details>
  </li>;
}

export function ForkExperiment({ onLessonEvent, coach = null }) {
  const [experiment, setExperiment] = useState(createForkExperiment);
  const [power, setPower] = useState(50);
  const [running, setRunning] = useState(false);
  const [attempts, setAttempts] = useState(0);
  const [feedback, setFeedback] = useState(initialFeedback);
  const [error, setError] = useState(false);
  const active = useRef(null);
  const id = useId();
  const check = inspectFork(experiment);
  const capped = experiment.rounds >= ROUND_LIMIT;
  const shared = experiment.branches.original.slice(0, check.commonLength);

  useEffect(() => () => {
    const owner = active.current;
    active.current = null;
    owner?.controller.abort();
    owner?.cancelDelay?.();
  }, []);

  function cancel() {
    const owner = active.current;
    active.current = null;
    owner?.controller.abort();
    owner?.cancelDelay?.();
    setRunning(false);
  }

  function reset(scenario = experiment.scenario, nextPower = power) {
    cancel();
    setExperiment(createForkExperiment(scenario));
    setPower(nextPower);
    setAttempts(0);
    setError(false);
    setFeedback(initialFeedback);
    onLessonEvent?.({ type: 'fork_reset' });
  }

  function changePower(nextPower) {
    cancel();
    setPower(nextPower);
    setError(false);
    setFeedback('Hash power changed. Completed blocks stay; the next search uses the new split.');
  }

  function stop() {
    cancel();
    setFeedback('Experiment stopped. Completed blocks stay; unfinished work was discarded.');
  }

  async function mine(automatic) {
    if (active.current || capped) return;
    const owner = { controller: new AbortController(), cancelDelay: null };
    active.current = owner;
    const owns = () => active.current === owner && !owner.controller.signal.aborted;
    setRunning(true);
    setError(false);
    let next = experiment;
    try {
      do {
        setAttempts(0);
        setFeedback(`Mining block ${next.rounds + 1} of ${ROUND_LIMIT}…`);
        const result = await mineForkRound(next, power, { signal: owner.controller.signal,
          onProgress: progress => { if (owns()) setAttempts(progress.attempts); } });
        if (!owns()) return;
        setAttempts(result.attempts);
        if (result.status !== 'found') {
          setFeedback(result.status === 'stopped'
            ? 'Search stopped. No block was added. Run the experiment to try again.'
            : 'No proof found within this search limit. No block was added. Run the experiment to try again.');
          break;
        }
        next = result.state;
        const nextCheck = inspectFork(next);
        setExperiment(next);
        onLessonEvent?.({ type: 'fork_round', scenario: next.scenario, rounds: next.rounds,
          originalWork: nextCheck.branches.original.work, alternativeWork: nextCheck.branches.alternative.work,
          selected: nextCheck.selected, reorganized: result.reorganized });
        setFeedback(`${nameOf(result.winner)} found a proof in ${result.attempts.toLocaleString()} ${result.attempts === 1 ? 'attempt' : 'attempts'}. ${result.reorganized ? `Selection switched to ${nameOf(nextCheck.selected)}.` : `${nameOf(nextCheck.selected)} stays selected.`}${next.rounds >= ROUND_LIMIT ? ` Experiment complete: ${ROUND_LIMIT} new blocks mined.` : ''}`);
        if (!automatic || next.rounds >= ROUND_LIMIT || !owns()) break;
        // The same owner covers the visible gap and the next search.
        const continueRun = await new Promise(resolve => {
          const timer = setTimeout(() => { owner.cancelDelay = null; resolve(true); }, 450);
          owner.cancelDelay = () => { clearTimeout(timer); owner.cancelDelay = null; resolve(false); };
        });
        if (!continueRun || !owns()) return;
      } while (next.rounds < ROUND_LIMIT);
    } catch {
      if (!owns()) return;
      setError(true);
      setFeedback('The proof search could not finish. Completed blocks are safe. Retry the experiment to continue.');
    } finally {
      if (owns()) { active.current = null; setRunning(false); }
    }
  }

  return <section className="fork-experiment" aria-labelledby={`${id}-title`}>
    <header className="fork-experiment-header"><div>
      <h2 id={`${id}-title`}>Which history wins?</h2>
    </div><span className="fork-experiment-rounds">{experiment.rounds} / {ROUND_LIMIT} new blocks</span></header>

    <div className="fork-experiment-controls">
      <CoachMark target="chain-lab.fork-scenario" coach={coach}>
        <fieldset className="fork-experiment-scenarios"><legend>Scenario</legend>
          <label><input type="radio" name={`${id}-scenario`} value="competition" checked={experiment.scenario === 'competition'} onChange={() => reset('competition')} />Competition</label>
          <label><input type="radio" name={`${id}-scenario`} value="rewrite" checked={experiment.scenario === 'rewrite'} onChange={() => reset('rewrite')} />Rewrite history</label>
        </fieldset>
      </CoachMark>
      <div className="fork-experiment-power">
        <label htmlFor={`${id}-power`}>Alternative hash power</label>
        <input id={`${id}-power`} type="range" min="0" max="100" step="1" value={power} onChange={event => changePower(Number(event.target.value))} aria-describedby={`${id}-power-help`} />
        <div className="fork-experiment-power-values"><span>Original {100 - power}%</span><span>Alternative {power}%</span></div>
        <p id={`${id}-power-help`}>Power changes the odds. Completed blocks stay.</p>
      </div>
    </div>

    <p className="fork-experiment-scenario-note">{experiment.scenario === 'competition'
      ? 'The branches share two blocks, then record different histories with equal starting work.'
      : 'The original has three blocks. The alternative starts at the same root with one altered toy payment. It must catch up, then gain strictly more valid work.'}</p>
    <CoachMark target="chain-lab.fork-mine" coach={coach}>
      <div className="fork-experiment-actions">
        <button className="btn btn-emphasized" disabled={!running && capped} onClick={running ? stop : () => mine(true)}>{running ? 'Stop experiment' : error ? 'Retry experiment' : 'Run experiment'}</button>
        <button className="btn btn-default" disabled={running || capped} onClick={() => mine(false)}>Mine one block</button>
        <button className="btn btn-transparent" onClick={() => reset()}>Reset fork experiment</button>
      </div>
    </CoachMark>
    <p className={`fork-experiment-feedback${error ? ' is-error' : ''}`} role="status">{feedback}</p>
    <p className="fork-experiment-attempts">{running ? 'Current or last search' : 'Last search'}: {attempts.toLocaleString()} observed {attempts === 1 ? 'attempt' : 'attempts'} · {experiment.reorganizations} selection {experiment.reorganizations === 1 ? 'switch' : 'switches'}</p>
    <div className="fork-experiment-diagram" aria-label="Competing branch diagram">
      <div className="fork-experiment-ancestor"><h3>{shared.length ? 'Shared ancestor' : 'Shared starting anchor'}</h3>
        {shared.length ? <ol className="fork-experiment-blocks">{shared.map(block => <BlockRecord key={block.hash} block={block} />)}</ol>
          : <p>Both histories begin at the same root hash.</p>}
      </div>
      <div className="fork-experiment-branches">
        {['original', 'alternative'].map(branch => <article key={branch} aria-labelledby={`${id}-${branch}`} className={`fork-experiment-branch${check.selected === branch ? ' is-selected' : ''}`}>
          <header><h3 id={`${id}-${branch}`}>{nameOf(branch)}</h3><span>{check.selected === branch ? 'Selected history' : 'Competing history'}</span></header>
          <p className="fork-experiment-work"><strong>{check.branches[branch].work} work units</strong> · {experiment.branches[branch].length} blocks · {check.branches[branch].valid ? 'All proofs valid' : 'Invalid branch'}</p>
          <ol className="fork-experiment-blocks" start={check.commonLength + 1}>{experiment.branches[branch].slice(check.commonLength).map(block => <BlockRecord key={block.hash} block={block} />)}</ol>
        </article>)}
      </div>
    </div>

    <p className="fork-experiment-selection"><strong>{nameOf(check.selected)} is selected.</strong> {check.tied
      ? 'Work is tied. A tie keeps the current branch; it does not switch history.'
      : 'Only a fully valid branch with strictly more accumulated work can replace the selected history.'}</p>
    {experiment.scenario === 'rewrite' && <p className="fork-experiment-rewrite">{experiment.rewriteSucceeded
      ? 'Rewrite observed: the alternative gained more valid work and became selected. This toy payment text changed history; it did not forge a signature.'
      : 'Rewrite not observed yet. Catching up to equal work is not enough to replace the original history.'}</p>}

    <p className="fork-experiment-note">Both branches use the same target: one leading hex zero. Each valid block adds {BLOCK_WORK} expected-work units; observed attempts are luck. A lucky hash with extra zeros adds no extra work.</p>
    <p className="fork-experiment-note">This is a local network model with a {ROUND_LIMIT}-new-block limit, not a measured Bitcoin attack probability. Changing payment text is not forging a signature. Your simulator, wallets and mining pool stay untouched.</p>
  </section>;
}
