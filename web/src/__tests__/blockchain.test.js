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
