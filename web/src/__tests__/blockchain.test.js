import { describe, expect, it } from 'vitest';
import { candidateHash, createBlockchain } from '../lib/blockchain';
const setup = () => createBlockchain({participants:['Miner One','Wallet Two'], miners:['Miner One'], startingBalance:2, miningDifficulty:1});
// Test helper: search nonces for the active miner's candidate, then hand the proof to the chain.
function mineNext(chain, miner = chain.getActiveMiner()) {
  const candidate = chain.prepareCandidate(miner);
  let nonce = 0;
  while (!candidateHash(candidate, nonce).startsWith(candidate.target)) nonce++;
  const outcome = chain.acceptBlock(candidate, nonce, candidateHash(candidate, nonce));
  expect(outcome.status).toBe('accepted');
  return outcome;
}
describe('transaction boundaries', () => {
  it.each([NaN, Infinity, -1, 0, 0.000000001, 1e-15])('rejects invalid amount %s', amount => {
    const chain=setup();
    expect(() => chain.createTransaction('Miner One','Wallet Two',amount,0,'test')).toThrow();
    expect(chain.memPool).toHaveLength(0);
  });
  it.each([NaN, Infinity, -1, 1e-15])('rejects invalid fee %s', fee => {
    expect(() => setup().createTransaction('Miner One','Wallet Two',1,fee,'test')).toThrow();
  });
  it('can spend the exact balance including one smallest-unit fee', () => {
    const chain=createBlockchain({participants:['Miner One','Wallet Two'], miners:['Miner One'], startingBalance:0.6, miningDifficulty:1});
    chain.createTransaction('Miner One','Wallet Two',0.59999999,0.00000001,'exact balance');
    expect(chain.calculateBalance(chain.participants[0].publicKey)).toBe(0);
    mineNext(chain);
    expect(chain.isChainValid()).toBe(true);
  });
  it('reserves pending spend so a second transaction cannot overspend', () => {
    const chain=setup();
    chain.createTransaction('Miner One','Wallet Two',1.5,0.1,'first');
    expect(() => chain.createTransaction('Miner One','Wallet Two',0.5,0,'second')).toThrow(/Insufficient/);
    expect(chain.calculateConfirmedBalance(chain.participants[0].publicKey)).toBe(2);
    expect(chain.calculateBalance(chain.participants[0].publicKey)).toBe(0.4);
  });
  it('detects a modified signed transaction after it is mined', () => {
    const chain=setup();
    chain.createTransaction('Miner One','Wallet Two',1,0.01,'test');
    mineNext(chain);
    expect(chain.isChainValid()).toBe(true);
    chain.tamperTransaction(1,0,2);
    expect(chain.blockArray[1].isValid()).toBe(false);
    expect(chain.isChainValid()).toBe(false);
  });
});
