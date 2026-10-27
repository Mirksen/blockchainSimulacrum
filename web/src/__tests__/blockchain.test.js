import { describe, expect, it } from 'vitest';
import { createBlockchain } from '../lib/blockchain';
const setup = () => createBlockchain({participants:['Miner One','Wallet Two'], miners:['Miner One'], startingBalance:2, miningDifficulty:1});
describe('transaction boundaries', () => {
  it.each([NaN, Infinity, -1, 0, 0.000000001, 1e-15])('rejects invalid amount %s', amount => {
    const chain=setup();
    expect(() => chain.createTransaction('Miner One','Wallet Two',amount,0,'test')).toThrow();
    expect(chain.memPool).toHaveLength(0);
  });
  it.each([NaN, Infinity, -1, 1e-15])('rejects invalid fee %s', fee => {
    expect(() => setup().createTransaction('Miner One','Wallet Two',1,fee,'test')).toThrow();
  });
  it('can spend the exact balance including one smallest-unit fee', async () => {
    const chain=createBlockchain({participants:['Miner One','Wallet Two'], miners:['Miner One'], startingBalance:0.6, miningDifficulty:1});
    chain.createTransaction('Miner One','Wallet Two',0.59999999,0.00000001,'exact balance');
    expect(chain.calculateBalance(chain.participants[0].publicKey)).toBe(0);
    await chain.mineNextBlock(undefined,undefined,false);
    expect(chain.isChainValid()).toBe(true);
  });
  it('reserves pending spend so a second transaction cannot overspend', () => {
    const chain=setup();
    chain.createTransaction('Miner One','Wallet Two',1.5,0.1,'first');
    expect(() => chain.createTransaction('Miner One','Wallet Two',0.5,0,'second')).toThrow(/Insufficient/);
    expect(chain.calculateConfirmedBalance(chain.participants[0].publicKey)).toBe(2);
    expect(chain.calculateBalance(chain.participants[0].publicKey)).toBe(0.4);
  });
  it('detects a modified signed transaction after it is mined', async () => {
    const chain=setup();
    chain.createTransaction('Miner One','Wallet Two',1,0.01,'test');
    await chain.mineNextBlock(undefined,undefined,false);
    expect(chain.isChainValid()).toBe(true);
    chain.tamperTransaction(1,0,2);
    expect(chain.isChainValid()).toBe(false);
  });
});
