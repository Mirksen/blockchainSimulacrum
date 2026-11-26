import { useId, useState } from 'react';
import { blockTrial } from '../lib/chainLab';
import { BLOCK_WORK, createForkExperiment, inspectFork } from '../lib/forkLab';
import { createHints } from '../lib/hints';
import './NodeViews.css';

const { hint, term } = createHints({
  deliver: { title: 'Deliver blocks', text: 'Give each node the blocks named on the button. Each node chooses a history from the blocks it has received.' },
  reset: { title: 'Start over', text: 'Restore both nodes to the same first two blocks so you can see the delivery order again.' },
  tip: { title: 'Selected tip', text: 'The last block in the history this node is using.' },
  work: { title: 'Work units', text: 'Work is added up from all the blocks in a history, including the shared blocks. At this fixed target every valid block adds the same work.' },
});

const { branches } = createForkExperiment();
const shared = branches.original.slice(0, 2);
const blockA = { ...branches.original[2], label: '3A' };
const blockB = { ...branches.alternative[2], label: '3B' };
const extension = { number: 4, data: 'One more record on branch A.', previousHash: blockA.hash, nonce: 3 };
const block4A = { ...extension, hash: blockTrial(extension).hash, label: '4A' };

const STEPS = [
  {
    action: 'Deliver competing blocks',
    observation: 'Both nodes start at block 2. Blocks 3A and 3B are valid and both build on block 2.',
  },
  {
    action: 'Deliver block 4A to Node 1',
    observation: 'Each node has both blocks, but the order was reversed. The histories have equal work, so each node keeps the tip it saw first.',
    deliveries: { 1: [['original', blockA], ['alternative', blockB]], 2: [['alternative', blockB], ['original', blockA]] },
  },
  {
    action: 'Deliver block 4A to Node 2',
    observation: 'Block 4A extends branch A. Node 1 sees the extra work and advances to 4A. Node 2 is still at 3B.',
    deliveries: { 1: [['original', block4A]] },
  },
  {
    action: 'Replay example',
    observation: 'Node 2 receives block 4A and switches to branch A, which now has more total work. Both nodes select the same tip.',
    deliveries: { 2: [['original', block4A]] },
  },
];

function nodeView(number, step) {
  const histories = { original: shared, alternative: shared };
  const arrivals = [];
  let check = inspectFork({ branches: histories });
  for (const event of STEPS.slice(1, step + 1)) {
    for (const [branch, block] of event.deliveries[number] ?? []) {
      histories[branch] = [...histories[branch], block];
      check = inspectFork({ branches: histories, selected: check.selected });
      arrivals.push(block.label);
    }
  }
  const tip = histories[check.selected].at(-1);
  return { tip: tip.label ?? tip.number, histories, arrivals, work: check.branches };
}

function NodeCard({ number, step, id }) {
  const { tip, histories, arrivals, work } = nodeView(number, step);
  return <article className="node-views-card" aria-labelledby={id}>
    <h3 id={id}>Node {number}</h3>
    <p><span {...term('tip')}>Selected tip</span> <strong>Block {tip}</strong></p>
    <p>Delivery order <strong>{arrivals.length ? arrivals.join(', then ') : 'Waiting for blocks'}</strong></p>
    <dl className="node-views-work">
      {[['original', 'A'], ['alternative', 'B']].map(([branch, label]) => <div key={branch}>
        <dt>Branch {label}</dt>
        <dd>{histories[branch].length > shared.length ? `${work[branch].work} work units` : 'Awaiting block'}</dd>
      </div>)}
    </dl>
  </article>;
}

export function NodeViews() {
  const id = useId();
  const [step, setStep] = useState(0);
  const { action, observation } = STEPS[step];
  const complete = step === STEPS.length - 1;

  return <div className="node-views">
    <p>In this example, two nodes keep separate copies of the chain in this browser. Each valid block adds <span {...term('work')}>{BLOCK_WORK} work units</span>.</p>
    <div className="node-views-actions">
      <button type="button" className="btn btn-emphasized" {...hint(complete ? 'reset' : 'deliver')}
        onClick={() => setStep(complete ? 0 : step + 1)}>{action}</button>
      {step > 0 && !complete && <button type="button" className="btn btn-transparent" {...hint('reset')}
        onClick={event => {
          event.currentTarget.previousElementSibling.focus();
          setStep(0);
        }}>Reset node views</button>}
    </div>
    <p className="node-views-observation" role="status">{observation}</p>
    <div className="node-views-cards">
      <NodeCard number={1} step={step} id={`${id}-node-1`} />
      <NodeCard number={2} step={step} id={`${id}-node-2`} />
    </div>
  </div>;
}
