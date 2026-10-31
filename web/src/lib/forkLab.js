import { meetsTarget } from '../../../shared/bitcoin-block.mjs';
import { blockHeader, blockTrial, inspectChain, ROOT_HASH, CHAIN_BITS } from './chainLab';
import { SEARCH_LIMIT } from './hashLab';
import { runSearch } from './powSearch';

export const BLOCK_WORK = 16; // Expected work at the fixed one-hex-zero target.
export const ROUND_LIMIT = 12;
const IDS = ['original', 'alternative'];
const RECORDS = ['Payment: demo wallet A pays shop 1 virtual coin.',
  'The shop records the payment.', 'A later record confirms the order.'];

function exampleBlock(number, data, previousHash, nonce) {
  const block = { number, data, previousHash, nonce };
  return { ...block, hash: blockTrial(block).hash };
}

export function createForkExperiment(scenario = 'competition') {
  if (!['competition', 'rewrite'].includes(scenario)) throw new RangeError('Unknown fork experiment.');
  const original = [];
  for (const [index, data] of RECORDS.entries()) {
    original.push(exampleBlock(index + 1, data, original.at(-1)?.hash ?? ROOT_HASH, [5, 6, 5][index]));
  }
  const alternative = scenario === 'competition'
    ? [...original.slice(0, 2).map(block => ({ ...block })),
      exampleBlock(3, 'A different later record confirms the order.', original[1].hash, 5)]
    : [exampleBlock(1, 'Payment: demo wallet A keeps the virtual coin.', ROOT_HASH, 2)];
  const state = { scenario, branches: { original, alternative }, selected: 'original', rounds: 0,
    reorganizations: 0, rewriteSucceeded: false };
  if (!IDS.every(id => inspectFork(state).branches[id].valid)) throw new Error('Invalid fork example.');
  return state;
}

function inspectBranch(blocks) {
  // inspectChain owns hash/link/target validation; the fork adds structural rules.
  const shaped = Array.isArray(blocks) && blocks.length > 0 && blocks.length <= ROUND_LIMIT + 3 &&
    Array.from(blocks).every((block, index) => block && block.number === index + 1 && typeof block.data === 'string' &&
      typeof block.hash === 'string' && typeof block.previousHash === 'string');
  const valid = Boolean(shaped && inspectChain(blocks).every(check => check.valid));
  return { valid, work: valid ? blocks.length * BLOCK_WORK : 0 };
}

export function inspectFork(state) {
  const branches = Object.fromEntries(IDS.map(id => [id, inspectBranch(state.branches[id])]));
  let selected = IDS.includes(state.selected) && branches[state.selected].valid ? state.selected : null;
  for (const id of IDS) {
    if (branches[id].valid && (!selected || branches[id].work > branches[selected].work)) selected = id;
  }
  let commonLength = 0;
  const original = Array.isArray(state.branches.original) ? state.branches.original : [];
  const alternative = Array.isArray(state.branches.alternative) ? state.branches.alternative : [];
  while (commonLength < Math.min(original.length, alternative.length) &&
    original[commonLength]?.hash && original[commonLength].hash === alternative[commonLength]?.hash) commonLength++;
  return { branches, selected, commonLength,
    tied: branches.original.valid && branches.alternative.valid && branches.original.work === branches.alternative.work };
}

function candidateFor(state, id) {
  const blocks = state.branches[id];
  return { number: blocks.length + 1, data: `${id === 'original' ? 'Original' : 'Alternative'} record ${blocks.length + 1}.`,
    previousHash: blocks.at(-1).hash, nonce: 0 };
}

// Randomness changes only attempt ownership and starting nonces. Every accepted
// proof is independently re-hashed. Re-running a stopped experiment does not replay
// a fixed prefix from nonce zero. Tests inject a serializable seed and nonce.
export async function mineForkRound(state, alternativePower, { signal, onProgress = () => {},
  seed, startNonce, searcher = runSearch, yieldControl } = {}) {
  if (!Number.isInteger(alternativePower) || alternativePower < 0 || alternativePower > 100) {
    throw new RangeError('Alternative hash power must be a whole percentage.');
  }
  const before = inspectFork(state);
  if (!IDS.every(id => before.branches[id].valid)) throw new Error('Both branches must be valid before mining.');
  const unchanged = (status, attempts = 0) => ({ status, state, attempts, winner: null, reorganized: false });
  if (signal?.aborted) return unchanged('stopped');
  if (state.rounds >= ROUND_LIMIT) return unchanged('exhausted');
  if (seed === undefined || startNonce === undefined) {
    const entropy = globalThis.crypto.getRandomValues(new Uint32Array(2));
    seed ??= entropy[0];
    // Stay a full search below the 32-bit ceiling, so a round cannot run out of nonces.
    startNonce ??= entropy[1] % (2 ** 32 - SEARCH_LIMIT);
  }
  const candidates = Object.fromEntries(IDS.map(id => [id, candidateFor(state, id)]));
  const entrants = IDS.map(id => ({ id, weight: id === 'original' ? 100 - alternativePower : alternativePower,
    header: blockHeader(candidates[id]), startNonce })).filter(entrant => entrant.weight > 0);
  const result = await searcher({ entrants, bits: CHAIN_BITS, limit: SEARCH_LIMIT, signal, onProgress,
    scheduling: 'weighted-random', seed, ...(yieldControl ? { yieldControl } : {}) });
  if (signal?.aborted || result.status !== 'found') return unchanged(signal?.aborted ? 'stopped' : result.status, result.attempts);
  if (!entrants.some(entrant => entrant.id === result.winner)) throw new Error('Unexpected mining branch.');
  const block = { ...candidates[result.winner], nonce: result.nonce, hash: result.hash };
  if (!Number.isSafeInteger(block.nonce) || block.nonce < startNonce ||
    blockTrial(block).hash !== block.hash || !meetsTarget(block.hash, CHAIN_BITS)) throw new Error('The fork proof is invalid.');
  const branches = { ...state.branches, [result.winner]: [...state.branches[result.winner], block] };
  const check = inspectFork({ ...state, branches });
  if (!check.branches[result.winner].valid) throw new Error('The mined branch is invalid.');
  const reorganized = check.selected !== before.selected;
  const next = { ...state, branches, selected: check.selected, rounds: state.rounds + 1,
    reorganizations: state.reorganizations + Number(reorganized),
    rewriteSucceeded: state.rewriteSucceeded || (state.scenario === 'rewrite' && check.selected === 'alternative') };
  return { status: 'found', state: next, attempts: result.attempts, winner: result.winner, reorganized };
}
