import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { candidateHash, createBlockchain } from '../lib/blockchain';
import { meetsTarget } from '../../../shared/bitcoin-block.mjs';
import { feeMarketEvidence } from '../lib/missionEvidence';
import { activeMission, initialProgress, load, MISSIONS, reduce, STORAGE_KEY } from '../lib/missions';
import { sampleBlock, verifyProof } from '../lib/merkleLab';

const fixture = vi.hoisted(() => ({ wallet: 0 }));
vi.mock('../lib/wallet', async original => ({ ...await original(), deriveWallet: () => {
  const privateKey = new Uint8Array(32);
  privateKey[31] = ++fixture.wallet;
  return { privateKey, seedPhrase: 'synthetic wallet fixture' };
} }));
beforeEach(() => { fixture.wallet = 0; vi.spyOn(Date, 'now').mockReturnValue(1767355200000); });
afterEach(() => vi.restoreAllMocks());
const start = id => ({ ...initialProgress(), completed: MISSIONS.slice(0, MISSIONS.findIndex(m => m.id === id)).map(m => m.id) });
const chainFixture = () => createBlockchain({ participants: ['Miner Fixture', 'Wallet A', 'Wallet B'], miners: ['Miner Fixture'], miningDifficulty: 1 });
function mine(chain, index) {
  const candidate = index == null ? chain.prepareCandidate(chain.getActiveMiner()) : chain.prepareRemine(index).candidate;
  let nonce = 0;
  while (!meetsTarget(candidateHash(candidate, nonce), candidate.bits)) nonce++;
  const result = index == null ? chain.acceptBlock(candidate, nonce, candidateHash(candidate, nonce)) : chain.acceptRemine(candidate, nonce, candidateHash(candidate, nonce));
  expect(result.status).toBe('accepted');
  return result.block;
}

describe('new missions use real results', () => {
  it('requires a waiting low-fee parent, a selected higher-fee child and both in an accepted block', () => {
    const chain = chainFixture();
    for (let n = 0; n < 8; n++) mine(chain);
    chain.createTransactionAtRate('Miner Fixture', 'Wallet A', 0.5, 1);
    for (let n = 0; n < 6; n++) chain.createTransactionAtRate('Miner Fixture', 'Wallet B', 0.01, 5);
    let progress = reduce(start('get-payment-in'), feeMarketEvidence(chain));
    expect(progress.step).toBe(1);
    const parent = progress.data.parent;
    expect(reduce(progress, { type: 'navigate' })).toBe(progress);
    expect(reduce(progress, { type: 'block_mined' })).toBe(progress);
    chain.createTransactionAtRate('Wallet A', 'Wallet B', 0.1, 20);
    progress = reduce(progress, feeMarketEvidence(chain));
    expect(progress.step).toBe(2);
    expect(progress.data.parent).toBe(parent);
    expect(reduce(progress, feeMarketEvidence(chain))).toBe(progress);
    expect(reduce(progress, { ...feeMarketEvidence(chain), acceptedBlock: 'c'.repeat(64), confirmed: [parent] })).toEqual(start('get-payment-in'));
    const block = mine(chain);
    expect(reduce(progress, feeMarketEvidence(chain, block)).completed).toContain('get-payment-in');
    const reset = reduce(progress, { type: 'reset' });
    expect(reset).toEqual(start('get-payment-in'));
    expect(reduce(reset, feeMarketEvidence(chain, block)).completed).not.toContain('get-payment-in');
  });

  it('requires the same Merkle payment and one well-formed edited sibling, not navigation, text edits or reset', () => {
    const block = sampleBlock(16), proof = block.proofFor(5), txid = block.txids[5];
    const good = verifyProof(txid, proof.path, block.root, proof.levels);
    const event = checked => ({ type: 'merkle_checked', root: block.root, txid, valid: checked.valid,
      malformed: Boolean(checked.malformed), failedAt: checked.failedAt, editedSibling: !checked.valid });
    const fresh = start('prove-a-payment');
    const progress = reduce(fresh, event(good));
    expect(progress.step).toBe(1);
    const path = proof.path.map((step, i) => i === 0 ? { ...step, hash: (step.hash[0] === '0' ? '1' : '0') + step.hash.slice(1) } : step);
    const bad = event(verifyProof(txid, path, block.root, proof.levels));
    for (const noise of [{ type: 'navigate' }, { ...bad, malformed: true }, { ...bad, txid: 'c'.repeat(64) }, { ...bad, editedSibling: false }, { ...bad, failedAt: 0 }]) expect(reduce(progress, noise)).toBe(progress);
    expect(reduce(progress, bad).completed).toContain('prove-a-payment');
    expect(reduce(reduce(progress, { type: 'lesson_reset' }), bad)).toEqual(fresh);
  });

  it('requires real re-mined hashes and links while the signed tip stays invalid; undo and cancellation cannot finish', () => {
    const chain = chainFixture();
    mine(chain);
    chain.createTransactionAtRate('Miner Fixture', 'Wallet A', 0.5, 5);
    mine(chain);
    chain.tamperTransaction(2, 1, 0.4);
    const progress = reduce(start('test-a-signature'), { type: 'block_tampered', blockIndex: 2, signed: true, newest: true });
    expect(progress.step).toBe(1);
    const evidence = () => {
      const checks = chain.inspectBlocks();
      return { type: 'block_remined', blockIndex: 2, chainValid: chain.isChainValid(),
        hashesAndLinksValid: checks.every(c => c.hashMatches && c.meetsTarget && c.linkIntact),
        signatureInvalid: checks[2].status === 'signature-invalid', editPresent: chain.getTamperedEdits().some(edit => edit.txIndex === 1) };
    };
    expect(reduce(progress, evidence())).toBe(progress);
    expect(reduce(progress, { type: 'search_cancelled' })).toBe(progress);
    mine(chain, 2);
    expect(evidence()).toMatchObject({ chainValid: false, hashesAndLinksValid: true, signatureInvalid: true, editPresent: true });
    expect(reduce(progress, evidence()).completed).toContain('test-a-signature');
    const undone = reduce(progress, { type: 'edit_undone' });
    chain.undoTamper(2);
    expect(reduce(undone, evidence())).toEqual(start('test-a-signature'));
  });

  it('keeps all nine old completions at version 1 and restarts new runtime evidence on reload', () => {
    const old = MISSIONS.slice(0, 9).map(m => m.id);
    const read = value => load({ getItem: key => key === STORAGE_KEY ? JSON.stringify(value) : null });
    const restored = read({ version: 1, completed: old, step: 2, data: { parent: 'a'.repeat(64) } });
    expect(restored).toEqual(start('get-payment-in'));
    expect(activeMission(restored).id).toBe('get-payment-in');
  });
});
