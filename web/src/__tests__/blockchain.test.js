import { describe, expect, it } from 'vitest';
import { candidateHash, createBlockchain } from '../lib/blockchain';
import { meetsTarget as meetsBits } from '../../../shared/bitcoin-block.mjs';
const setup = () => createBlockchain({participants:['Miner One','Wallet Two'], miners:['Miner One'], miningDifficulty:1});
// Test helper: search nonces for the active miner's candidate, then hand the proof to the chain.
function mineNext(chain, miner = chain.getActiveMiner()) {
  const candidate = chain.prepareCandidate(miner);
  let nonce = 0;
  while (!meetsBits(candidateHash(candidate, nonce), candidate.bits)) nonce++;
  const outcome = chain.acceptBlock(candidate, nonce, candidateHash(candidate, nonce));
  expect(outcome.status).toBe('accepted');
  return outcome;
}
const funded = () => { const chain = setup(); mineNext(chain); return chain; };
describe('transaction boundaries', () => {
  it.each([NaN, Infinity, -1, 0, 0.000000001, 1e-15])('rejects invalid amount %s', amount => {
    const chain=funded();
    expect(() => chain.createTransaction('Miner One','Wallet Two',amount,0,'test')).toThrow();
    expect(chain.memPool).toHaveLength(0);
  });
  it.each([NaN, Infinity, -1, 1e-15])('rejects invalid fee %s', fee => {
    expect(() => setup().createTransaction('Miner One','Wallet Two',1,fee,'test')).toThrow();
  });
  it('can spend the exact balance including one smallest-unit fee', () => {
    const chain=funded();
    chain.createTransaction('Miner One','Wallet Two',3.12499999,0.00000001,'exact balance');
    expect(chain.memPool[0].outputs.map(output => output.value)).toEqual([312499999,0]);
    expect(chain.calculateBalance(chain.participants[0].publicKey)).toBe(0);
    mineNext(chain);
    expect(chain.isChainValid()).toBe(true);
  });
  it('reserves pending spend so a second transaction cannot overspend', () => {
    const chain=funded();
    chain.createTransaction('Miner One','Wallet Two',2.5,0.1,'first');
    expect(() => chain.createTransaction('Miner One','Wallet Two',0.6,0,'second')).toThrow(/Insufficient/);
    expect(chain.calculateConfirmedBalance(chain.participants[0].publicKey)).toBe(3.125);
    expect(chain.calculateBalance(chain.participants[0].publicKey)).toBe(0.525);
  });
  it('detects a modified signed transaction after it is mined', () => {
    const chain=funded();
    chain.createTransaction('Miner One','Wallet Two',1,0.01,'test');
    mineNext(chain);
    expect(chain.isChainValid()).toBe(true);
    chain.tamperTransaction(2,1,2);
    expect(chain.blockArray[2].isValid()).toBe(false);
    expect(chain.isChainValid()).toBe(false);
  });
});
describe('default participants', () => {
  it('starts with the wallets Alice, Bob, Chris and the miners Hal, Dorian, Laszlo', () => {
    const chain = createBlockchain();
    expect(chain.participants.map(p => p.name)).toEqual(['Alice', 'Bob', 'Chris', 'Hal', 'Dorian', 'Laszlo']);
    expect(chain.participants.filter(p => p.isMiner).map(p => p.name)).toEqual(['Hal', 'Dorian', 'Laszlo']);
    expect(chain.participants.map(p => p.colorKey)).toEqual(['alice', 'bob', 'chris', 'hal', 'dorian', 'laszlo']);
  });
});
describe('created participants', () => {
  it('gives a created miner the spare color and a created wallet none', () => {
    const chain = createBlockchain();
    expect(chain.addMiner('Quill').participant.colorKey).toBe('spare');
    expect(chain.addWallet('Rowan').participant.colorKey).toBe('rowan');
  });
  it('gives a created miner an equal share: the average hashpower of the racing miners', () => {
    const chain = createBlockchain();
    chain.setMinerShare('Hal', 40);
    expect(chain.addMiner('Quill').participant.hashpower).toBe(33);
    expect(createBlockchain().addMiner('Rowan').participant.hashpower).toBe(5);
  });
});
describe('setMinerShare', () => {
  const weights = chain => chain.getActiveMiners().map(p => [p.name, p.hashpower]);
  it('gives the miner its percent and the others the rest in their previous proportion', () => {
    const chain = createBlockchain();
    expect(chain.setMinerShare('Hal', 70)).toEqual({ Hal: 70, Dorian: 15, Laszlo: 15 });
    expect(weights(chain)).toEqual([['Hal', 70], ['Dorian', 15], ['Laszlo', 15]]);
    // Dorian and Laszlo keep their 1:1 when Dorian moves and Hal gives way with Laszlo.
    chain.setMinerShare('Dorian', 50);
    expect(weights(chain)).toEqual([['Hal', 41], ['Dorian', 50], ['Laszlo', 9]]);
    expect(chain.getActiveMiners().reduce((sum, p) => sum + p.hashpower, 0)).toBe(100);
  });
  it('keeps the share between 5 and 90 percent and every other miner at weight 1 or more', () => {
    const chain = createBlockchain();
    chain.setMinerShare('Hal', 100);
    expect(chain.getParticipantByName('Hal').hashpower).toBe(90);
    chain.setMinerShare('Hal', 0);
    expect(chain.getParticipantByName('Hal').hashpower).toBe(5);
    chain.setMinerShare('Dorian', 90);
    expect(weights(chain)).toEqual([['Hal', 1], ['Dorian', 90], ['Laszlo', 9]]);
  });
  it('changes nothing for a wallet, a switched-off miner, a lone miner or a non-number', () => {
    const chain = createBlockchain();
    expect(chain.setMinerShare('Alice', 50)).toBeNull();
    expect(chain.setMinerShare('Hal', Number.NaN)).toBeNull();
    chain.toggleMiner('Laszlo');
    expect(chain.setMinerShare('Laszlo', 50)).toBeNull();
    chain.toggleMiner('Dorian');
    expect(chain.setMinerShare('Hal', 50)).toBeNull();
    expect(chain.participants.filter(p => p.isMiner).map(p => p.hashpower)).toEqual([5, 5, 5]);
  });
});
describe('renameParticipant', () => {
  const twoMiners = () => createBlockchain({ participants: ['Quill', 'Rowan', 'Wallet3'], miners: ['Quill', 'Rowan'], miningDifficulty: 1 });
  it('renames a miner and keeps its keys, scripts, color and the blocks it mined', () => {
    const chain = twoMiners();
    const miner = chain.getParticipantByName('Quill');
    mineNext(chain, miner);
    const before = { publicKey: miner.publicKey, scriptPubKey: miner.scriptPubKey, address: miner.address, colorKey: miner.colorKey, isMiner: true };
    const result = chain.renameParticipant('Quill', '  Sable9 ');
    expect(result).toEqual({ success: true, error: null, participant: miner });
    expect(miner.name).toBe('Sable9');
    expect(miner).toMatchObject(before);
    expect(miner.colorKey).toBe('quill');
    expect(chain.getParticipantByName('Sable9')).toBe(miner);
    expect(chain.getParticipantByName('Quill')).toBeFalsy();
    expect(chain.blockArray[1].transactions[0].outputs[0].scriptPubKey).toBe(miner.scriptPubKey);
    expect(chain.isChainValid()).toBe(true);
  });
  it('may change only the letter case of its own name', () => {
    const chain = twoMiners();
    expect(chain.renameParticipant('Quill', 'QUILL')).toMatchObject({ success: true });
    expect(chain.getParticipantByName('QUILL').colorKey).toBe('quill');
  });
  it.each(['Rowan', 'rowan', ' WALLET3 '])('refuses the taken name %j regardless of letter case', next => {
    const chain = twoMiners();
    const result = chain.renameParticipant('Quill', next);
    expect(result).toEqual({ success: false, error: `A wallet named ${next.trim()} already exists.` });
    expect(chain.participants.map(p => p.name)).toEqual(['Quill', 'Rowan', 'Wallet3']);
  });
  it.each(['', 'Q', 'Abcdefghijklmnopq', 'has space', 'Quill!', null])('refuses the badly formed name %j', next => {
    const chain = twoMiners();
    expect(chain.renameParticipant('Quill', next)).toEqual({ success: false, error: 'Use 2–16 letters or digits for the miner name.' });
    expect(chain.renameParticipant('Wallet3', next)).toEqual({ success: false, error: 'Use 2–16 letters or digits for the wallet name.' });
    expect(chain.participants.map(p => p.name)).toEqual(['Quill', 'Rowan', 'Wallet3']);
  });
  it('refuses an unknown participant', () => {
    expect(twoMiners().renameParticipant('Nobody', 'Sable9')).toEqual({ success: false, error: 'Nobody does not exist.' });
  });
});
