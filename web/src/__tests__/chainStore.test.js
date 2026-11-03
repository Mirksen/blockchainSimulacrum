import { describe, expect, it } from 'vitest';
import { candidateHash, createBlockchain } from '../lib/blockchain';
import { CHAIN_KEY, deserializeChain, loadChain, MAX_SAVED_CHARS, saveChain, serializeChain } from '../lib/chainStore';
import { meetsTarget } from '../../../shared/bitcoin-block.mjs';

function mineNext(chain, miner = chain.getActiveMiner()) {
  const candidate = chain.prepareCandidate(miner);
  let nonce = 0;
  while (!meetsTarget(candidateHash(candidate, nonce), candidate.bits)) nonce++;
  expect(chain.acceptBlock(candidate, nonce, candidateHash(candidate, nonce)).status).toBe('accepted');
}
function memoryStorage() {
  const items = new Map();
  return { items, getItem: key => items.get(key) ?? null, setItem: (key, value) => items.set(key, String(value)), removeItem: key => items.delete(key) };
}
// Miner, A and B; two blocks, one pending transfer.
function playedChain() {
  const chain = createBlockchain({ participants: ['Miner', 'A', 'B'], miners: ['Miner'], miningDifficulty: 1, halvingEvent: 3 });
  mineNext(chain);
  chain.createTransactionAtRate('Miner', 'A', 1, 5, 'Rent');
  mineNext(chain);
  chain.createTransactionAtRate('A', 'B', 0.25, 20);
  chain.renameParticipant('A', 'Ada');
  chain.setMinerHashpower('Miner', 8);
  return chain;
}
const view = chain => ({
  hashes: chain.blockArray.map(block => block.hash),
  statuses: chain.inspectBlocks().map(check => check.status),
  balances: chain.getAllBalances().map(({ name, balance }) => [name, balance]),
  mempool: chain.memPool.map(tx => tx.createHash()),
  keys: chain.participants.map(p => [p.name, p.publicKey, p.colorKey, p.hashpower, p.blocksWon, p.isMiner]),
  settings: [chain.name, chain.miningDifficulty, chain.blockReward, chain.halvingEvent],
  edits: chain.getTamperedEdits(),
  valid: chain.isChainValid()
});
const roundTrip = chain => deserializeChain(JSON.parse(JSON.stringify(serializeChain(chain))));

describe('chain store', () => {
  it('restores blocks, mempool, participants and settings exactly', () => {
    const chain = playedChain();
    const restored = roundTrip(chain);
    expect(view(restored)).toEqual(view(chain));
    expect(restored.participants.find(p => p.name === 'Ada').seedPhrase).toBe(chain.participants.find(p => p.name === 'Ada').seedPhrase);
    // The restored chain keeps working: the pending transfer is mined into the next block.
    mineNext(restored);
    expect(restored.isChainValid()).toBe(true);
    expect(restored.memPool).toHaveLength(0);
  });
  it('keeps an edit as it was left: invalid, with its original for undo', () => {
    const chain = playedChain();
    chain.tamperTransaction(2, 1, 0.5);
    const restored = roundTrip(chain);
    expect(view(restored)).toEqual(view(chain));
    expect(restored.inspectBlocks()[2].status).toBe('hash-mismatch');
    expect(restored.undoTamper(2)).toEqual({ success: true, restored: 1 });
    expect(restored.isChainValid()).toBe(true);
  });
  it('refuses a chain of another genesis, an unknown version and a forged unedited block', () => {
    const saved = serializeChain(playedChain());
    expect(() => deserializeChain({ ...saved, genesis: '0'.repeat(64) })).toThrow(/another genesis/);
    expect(() => deserializeChain({ ...saved, version: 99 })).toThrow(/unknown version/);
    const forged = structuredClone(saved);
    forged.blocks[0].hash = 'f'.repeat(64);
    expect(() => deserializeChain(forged)).toThrow(/invalid chain/);
    const badPhrase = structuredClone(saved);
    badPhrase.participants[0].seedPhrase = 'not a phrase';
    expect(() => deserializeChain(badPhrase)).toThrow();
  });
  it('saves and loads through storage, and drops a save it cannot use', () => {
    const storage = memoryStorage();
    const chain = playedChain();
    expect(saveChain(storage, chain)).toBe('saved');
    expect(view(loadChain(storage))).toEqual(view(chain));
    storage.setItem(CHAIN_KEY, '{ not json');
    expect(loadChain(storage)).toBeNull();
    expect(storage.items.has(CHAIN_KEY)).toBe(false);
    expect(loadChain(storage)).toBeNull();
  });
  it('reports a blocked storage and a chain too long to save', () => {
    const blocked = { getItem: () => { throw new Error('blocked'); }, setItem: () => { throw new Error('blocked'); }, removeItem: () => {} };
    expect(saveChain(blocked, playedChain())).toBe('unavailable');
    expect(loadChain(blocked)).toBeNull();
    const storage = memoryStorage();
    const chain = playedChain();
    expect(saveChain(storage, chain)).toBe('saved');
    chain.miningLog = Array.from({ length: MAX_SAVED_CHARS / 10 }, (_, i) => ({ blockNumber: i, nonce: i, hash: 'x' }));
    expect(saveChain(storage, chain)).toBe('too-large');
    expect(storage.items.has(CHAIN_KEY)).toBe(false);
  });
});
