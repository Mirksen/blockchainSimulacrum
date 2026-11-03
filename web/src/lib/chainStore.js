// The simulator chain saved in this browser, so a reload continues where the learner was.
// What is saved is everything the chain cannot recompute: the blocks as stored (header
// fields and the raw bytes of every transaction, including edits), the mempool, the
// participants with their recovery phrases, the open edits and the experiment settings.
// Everything else (UTXO set, statuses, balances) is derived again on load, so a saved
// state is checked by the same rules as a live one. Reset clears it.
import { Block, Blockchain, MAX_HASHPOWER, Participant } from './blockchain';
import { Transaction } from './tx/transaction';

export const CHAIN_KEY = 'proofofwork-chain';
export const CHAIN_VERSION = 1;
// localStorage holds about 5 MB per site; a chain beyond this is no longer saved.
export const MAX_SAVED_CHARS = 2_000_000;

const HASH = /^[0-9a-f]{64}$/;
const HEX = /^(?:[0-9a-f]{2})+$/;

function blockRecord(block) {
  return {
    version: block.version, time: block.time, previousHash: block.previousHash, bits: block.bits, difficulty: block.difficulty,
    txRoot: block.txRoot, nonce: block.nonce, hash: block.hash, halved: block.halved === true, subsidy: block.subsidy ?? null,
    transactions: block.transactions.map(tx => tx.serialize())
  };
}

/** The saved form of `chain`, a plain JSON object. */
export function serializeChain(chain) {
  return {
    version: CHAIN_VERSION,
    genesis: chain.blockArray[0].hash,
    name: chain.name, miningDifficulty: chain.miningDifficulty, blockReward: chain.blockReward, halvingEvent: chain.halvingEvent,
    historyEdited: chain.historyEdited,
    participants: chain.participants.map(p => ({ name: p.name, colorKey: p.colorKey, seedPhrase: p.seedPhrase, isMiner: p.isMiner,
      hashpower: p.hashpower, minerEnabled: p.minerEnabled, blocksWon: p.blocksWon, activeMiner: p.activeMiner })),
    blocks: chain.blockArray.slice(1).map(blockRecord),
    memPool: chain.memPool.map(tx => tx.serialize()),
    edits: [...chain.tamperedOriginals.values()].map(({ blockIndex, txIndex, value }) => ({ blockIndex, txIndex, value })),
    miningLog: chain.miningLog
  };
}

const fail = reason => { throw new Error(`Saved chain refused: ${reason}`); };
const isCount = value => Number.isSafeInteger(value) && value >= 0;

/**
 * A Blockchain rebuilt from `saved`, or an Error naming why it cannot be. A saved chain
 * must start at this site's genesis, and a chain that was never edited must still be
 * valid; an edited one may be invalid, exactly as it was left.
 */
export function deserializeChain(saved) {
  if (!saved || saved.version !== CHAIN_VERSION) fail('unknown version');
  const chain = new Blockchain(saved.name, saved.miningDifficulty, saved.blockReward, saved.halvingEvent);
  if (saved.genesis !== chain.blockArray[0].hash) fail('another genesis');
  if (typeof saved.name !== 'string' || !isCount(saved.miningDifficulty) || !(saved.blockReward > 0) || !(saved.halvingEvent >= 1)) fail('settings');
  if (!Array.isArray(saved.participants) || !Array.isArray(saved.blocks) || !Array.isArray(saved.memPool) || !Array.isArray(saved.edits)) fail('shape');
  for (const record of saved.participants) {
    const participant = new Participant(record.name, record.isMiner === true, record.seedPhrase);
    if (participant.seedPhrase !== record.seedPhrase) fail('recovery phrase');
    Object.assign(participant, {
      colorKey: String(record.colorKey ?? record.name).toLowerCase(),
      hashpower: Math.max(1, Math.min(MAX_HASHPOWER, Math.round(Number(record.hashpower) || 5))),
      minerEnabled: record.minerEnabled !== false, blocksWon: isCount(record.blocksWon) ? record.blocksWon : 0,
      activeMiner: record.activeMiner === true
    });
    chain.participants.push(participant);
  }
  saved.blocks.forEach((record, offset) => {
    if (!Array.isArray(record?.transactions) || !record.transactions.length || !record.transactions.every(hex => typeof hex === 'string' && HEX.test(hex))) fail(`block ${offset + 1}`);
    if (![record.previousHash, record.txRoot, record.hash].every(hash => HASH.test(hash ?? '')) || !isCount(record.time) || !isCount(record.nonce) ||
      !isCount(record.bits) || !isCount(record.version)) fail(`block ${offset + 1}`);
    const block = new Block(record.time, record.transactions.map(hex => Transaction.parse(hex)), record.previousHash, record.bits);
    // The stored fields win over what the constructor recomputes: an edited block keeps its old hash.
    Object.assign(block, { version: record.version, difficulty: record.difficulty, txRoot: record.txRoot, nonce: record.nonce, hash: record.hash,
      halved: record.halved === true, subsidy: record.subsidy });
    chain.blockArray.push(block);
  });
  chain.memPool = saved.memPool.map(hex => {
    if (typeof hex !== 'string' || !HEX.test(hex)) fail('mempool');
    return Transaction.parse(hex);
  });
  for (const { blockIndex, txIndex, value } of saved.edits) {
    if (!chain.blockArray[blockIndex]?.transactions[txIndex] || !isCount(value)) fail('edit');
    chain.tamperedOriginals.set(`${blockIndex}:${txIndex}`, { blockIndex, txIndex, value });
  }
  chain.historyEdited = saved.historyEdited === true;
  chain.miningLog = Array.isArray(saved.miningLog) ? saved.miningLog : [];
  chain.revision++;
  if (!chain.historyEdited && !chain.isChainValid()) fail('invalid chain');
  if (chain.memPool.length && !chain.ledger().memPool.every(entry => entry.valid) && !chain.historyEdited) fail('invalid mempool');
  return chain;
}

/** Saves `chain`; returns 'saved', 'too-large' (and removes the old save) or 'unavailable'. */
export function saveChain(storage, chain) {
  try {
    if (!storage) return 'unavailable';
    const text = JSON.stringify(serializeChain(chain));
    if (text.length > MAX_SAVED_CHARS) {
      storage.removeItem(CHAIN_KEY);
      return 'too-large';
    }
    storage.setItem(CHAIN_KEY, text);
    return 'saved';
  } catch {
    return 'unavailable';
  }
}

/** The saved chain, or null when there is none or it cannot be used (then it is removed). */
export function loadChain(storage) {
  let text = null;
  try { text = storage?.getItem(CHAIN_KEY) ?? null; } catch { return null; }
  if (!text) return null;
  try {
    return deserializeChain(JSON.parse(text));
  } catch {
    try { storage.removeItem(CHAIN_KEY); } catch { /* Storage blocked: nothing to clean up. */ }
    return null;
  }
}

export function clearChain(storage) {
  try { storage?.removeItem(CHAIN_KEY); } catch { /* Storage blocked: nothing saved. */ }
}
