import { describe, expect, it } from 'vitest';
import { candidateHash, createBlockchain, DEFAULT_FEE, Transaction } from '../lib/blockchain';
import { selectCoins } from '../lib/tx/utxo';
import { meetsTarget } from '../../../shared/bitcoin-block.mjs';

const setup = () => createBlockchain({ participants: ['Miner', 'Other', 'Bob'], miners: ['Miner', 'Other'], miningDifficulty: 1 });
const named = (chain, name) => chain.getParticipantByName(name);
function mine(chain, who = 'Miner') {
  const candidate = chain.prepareCandidate(named(chain, who));
  let nonce = 0;
  while (!meetsTarget(candidateHash(candidate, nonce), candidate.bits)) nonce++;
  const outcome = chain.acceptBlock(candidate, nonce, candidateHash(candidate, nonce));
  expect(outcome.status).toBe('accepted');
  return outcome.block;
}
function remine(chain, index) {
  const { candidate, success } = chain.prepareRemine(index);
  expect(success).toBe(true);
  let nonce = 0;
  while (!meetsTarget(candidateHash(candidate, nonce), candidate.bits)) nonce++;
  expect(chain.acceptRemine(candidate, nonce, candidateHash(candidate, nonce)).status).toBe('accepted');
}
const balance = (chain, name) => chain.calculateConfirmedBalance(named(chain, name).publicKey);
const satoshis = (chain, name) => chain.coinsOf(named(chain, name).publicKey).reduce((sum, coin) => sum + coin.value, 0);
const statuses = chain => chain.inspectBlocks().map(check => check.status);
// A hand-built spend of `coin`, signed by `signer`, for checks the wallet itself never trips.
function spend(coin, signer, outputs, script = coin.scriptPubKey) {
  const tx = new Transaction({ inputs: [{ txid: coin.txid, vout: coin.vout }], outputs });
  tx.signInput(0, signer.keyPair, script);
  return tx;
}

describe('coins', () => {
  it('turns a mined block into one unspent output of its miner', () => {
    const chain = setup();
    const block = mine(chain);
    const [coin] = chain.coinsOf(named(chain, 'Miner').publicKey);
    expect(coin).toMatchObject({ txid: block.transactions[0].createHash(), vout: 0, value: 312500000, blockIndex: 1 });
    expect(balance(chain, 'Miner')).toBe(3.125);
  });

  it('selects the largest coins first and only as many as needed', () => {
    const coins = [{ value: 10 }, { value: 50 }, { value: 30 }];
    expect(selectCoins(coins, 40)).toEqual({ coins: [{ value: 50 }], total: 50 });
    expect(selectCoins(coins, 70).coins.map(coin => coin.value)).toEqual([50, 30]);
    expect(selectCoins(coins, 91)).toBeNull();
  });
});

describe('spending', () => {
  it('spends a coin into payment, change and memo, and the fee is what is left', () => {
    const chain = setup();
    mine(chain);
    const tx = chain.createTransaction('Miner', 'Bob', 1, 0.001, 'Coffee');
    expect(tx.inputs).toHaveLength(1);
    expect(tx.outputs.map(output => output.value)).toEqual([100000000, 212400000, 0]);
    expect(tx.outputs[0].scriptPubKey).toBe(named(chain, 'Bob').scriptPubKey);
    expect(tx.outputs[1].scriptPubKey).toBe(named(chain, 'Miner').scriptPubKey);
    expect(tx.memo).toBe('Coffee');
    const view = chain.describer()(tx);
    expect(view).toMatchObject({ from: 'Miner', to: 'Bob', amount: 1, fee: 0.001, change: 2.124, memo: 'Coffee', signed: true });
    const coins = [...chain.ledger().pending.values()];
    expect(coins.map(coin => coin.value).sort((a, b) => a - b)).toEqual([100000000, 212400000]);
    expect(view.outputs.map(output => output.kind)).toEqual(['payment', 'change', 'memo']);
    expect(tx.verifyInput(0, named(chain, 'Miner').scriptPubKey)).toBe(true);
  });

  it('combines coins when one does not cover the amount and pays no change on an exact spend', () => {
    const chain = setup();
    mine(chain);
    mine(chain);
    const tx = chain.createTransaction('Miner', 'Bob', 6.25 - DEFAULT_FEE, DEFAULT_FEE);
    expect(tx.inputs).toHaveLength(2);
    expect(tx.outputs).toHaveLength(1);
    mine(chain, 'Other');
    expect(balance(chain, 'Miner')).toBe(0);
    expect(chain.isChainValid()).toBe(true);
  });

  it('pays the fees to the miner and keeps supply equal to the subsidies', () => {
    const chain = setup();
    mine(chain);
    chain.createTransaction('Miner', 'Bob', 1, 0.25, 'first');
    chain.createTransaction('Miner', 'Bob', 0.5, 0.25, 'second');
    const block = mine(chain, 'Other');
    expect(block.transactions[0].outputs[0].value).toBe(312500000 + 50000000);
    expect(balance(chain, 'Other')).toBe(3.625);
    const supply = ['Miner', 'Other', 'Bob'].reduce((sum, name) => sum + satoshis(chain, name), 0);
    expect(supply).toBe(2 * 312500000);
    expect(chain.isChainValid()).toBe(true);
  });

  it('spends a pending change output, parent first in the block', () => {
    const chain = setup();
    mine(chain);
    const first = chain.createTransaction('Miner', 'Bob', 1, 0);
    const second = chain.createTransaction('Miner', 'Bob', 1, 0);
    expect(second.inputs[0].txid).toBe(first.createHash());
    const third = chain.createTransaction('Bob', 'Other', 1.5, 0);
    expect(third.inputs).toHaveLength(2);
    const block = mine(chain);
    expect(block.transactions.slice(1)).toEqual([first, second, third]);
    expect(chain.isChainValid()).toBe(true);
    expect(chain.memPool).toEqual([]);
  });

  it('refuses a reference over 80 bytes', () => {
    const chain = setup();
    mine(chain);
    expect(() => chain.createTransaction('Miner', 'Bob', 1, 0, '€'.repeat(27))).toThrow(/Reference must fit in 80 bytes/);
    expect(chain.createTransaction('Miner', 'Bob', 1, 0, 'x'.repeat(80)).memo).toHaveLength(80);
  });

  it('previews coins, change and fee without creating anything', () => {
    const chain = setup();
    mine(chain);
    expect(chain.previewTransaction('Miner', 1)).toMatchObject({ funded: true, amount: 100000000, fee: 1, change: 212499999 });
    expect(chain.previewTransaction('Bob', 1)).toMatchObject({ funded: false, balance: 0 });
    expect(chain.memPool).toEqual([]);
  });
});

describe('signatures', () => {
  it('always uses low S, as Bitcoin relay policy requires', () => {
    const chain = setup();
    const miner = named(chain, 'Miner');
    const halfOrder = BigInt('0x7fffffffffffffffffffffffffffffff5d576e7357a4501ddfe92f46681b20a0');
    for (let value = 1; value <= 16; value++) {
      const tx = new Transaction({ inputs: [{ txid: 'ab'.repeat(32), vout: 0 }], outputs: [{ value, scriptPubKey: miner.scriptPubKey }] });
      tx.signInput(0, miner.keyPair, miner.scriptPubKey);
      const der = tx.inputs[0].scriptSig.slice(2, -70);
      const rLength = parseInt(der.slice(6, 8), 16) * 2;
      const s = der.slice(12 + rLength);
      expect(BigInt(`0x${s}`) <= halfOrder).toBe(true);
    }
  });
});

describe('the mempool refuses', () => {
  const funded = () => {
    const chain = setup();
    mine(chain);
    return { chain, miner: named(chain, 'Miner'), bob: named(chain, 'Bob'), coin: chain.coinsOf(named(chain, 'Miner').publicKey)[0] };
  };
  const pay = (bob, value) => [{ value, scriptPubKey: bob.scriptPubKey }];

  it('a coin already spent by a pending transaction', () => {
    const { chain, miner, bob, coin } = funded();
    expect(chain.acceptToMempool(spend(coin, miner, pay(bob, 100))).success).toBe(true);
    expect(chain.acceptToMempool(spend(coin, miner, pay(bob, 200)))).toEqual({ success: false, reason: 'double-spend' });
    expect(chain.memPool).toHaveLength(1);
  });

  it('a coin already spent in a block', () => {
    const { chain, miner, bob, coin } = funded();
    chain.acceptToMempool(spend(coin, miner, pay(bob, 100)));
    mine(chain);
    expect(chain.acceptToMempool(spend(coin, miner, pay(bob, 200)))).toEqual({ success: false, reason: 'double-spend' });
  });

  it('the same coin twice in one transaction', () => {
    const { chain, miner, bob, coin } = funded();
    const tx = new Transaction({ inputs: [coin, coin].map(({ txid, vout }) => ({ txid, vout })), outputs: pay(bob, 100) });
    tx.signInput(0, miner.keyPair, coin.scriptPubKey);
    tx.signInput(1, miner.keyPair, coin.scriptPubKey);
    expect(chain.acceptToMempool(tx)).toEqual({ success: false, reason: 'double-spend' });
  });

  it('a coin that does not exist', () => {
    const { chain, miner, bob, coin } = funded();
    expect(chain.acceptToMempool(spend({ ...coin, txid: 'ab'.repeat(32) }, miner, pay(bob, 100)))).toEqual({ success: false, reason: 'missing-input' });
  });

  it('more value out than in', () => {
    const { chain, miner, bob, coin } = funded();
    expect(chain.acceptToMempool(spend(coin, miner, pay(bob, coin.value + 1)))).toEqual({ success: false, reason: 'overspend' });
  });

  it('a signature by the wrong key', () => {
    const { chain, bob, coin } = funded();
    expect(chain.acceptToMempool(spend(coin, bob, pay(bob, 100)))).toEqual({ success: false, reason: 'signature' });
  });

  it('accepts the exact coin value with no fee', () => {
    const { chain, miner, bob, coin } = funded();
    expect(chain.acceptToMempool(spend(coin, miner, pay(bob, coin.value))).success).toBe(true);
  });
});

describe('a block breaking the rules', () => {
  // Blocks with hand-placed transactions; the proof is real, so only the ledger rule can fail.
  function force(chain, tx) {
    const candidate = chain.prepareCandidate(named(chain, 'Miner'));
    const block = mine(chain);
    block.transactions.push(tx);
    expect(candidate.height).toBe(chain.blockArray.length - 1);
    remine(chain, chain.blockArray.length - 1);
  }

  it('reports a double spend across blocks as transaction-invalid with its reason', () => {
    const chain = setup();
    mine(chain);
    const miner = named(chain, 'Miner');
    const [coin] = chain.coinsOf(miner.publicKey);
    const pay = [{ value: 100, scriptPubKey: named(chain, 'Bob').scriptPubKey }];
    chain.acceptToMempool(spend(coin, miner, pay));
    mine(chain);
    force(chain, spend(coin, miner, [{ value: 200, scriptPubKey: named(chain, 'Bob').scriptPubKey }]));
    const check = chain.inspectBlocks().at(-1);
    expect(check).toMatchObject({ hashMatches: true, linkIntact: true, status: 'transaction-invalid', issue: { reason: 'double-spend', txIndex: 1 } });
    expect(chain.isChainValid()).toBe(false);
  });
});

describe('tampering under the ledger rules', () => {
  it('lowers an unspent coinbase: re-mining repairs the chain and the coin shrinks', () => {
    const chain = setup();
    mine(chain);
    mine(chain);
    chain.tamperTransaction(2, 0, 1);
    expect(statuses(chain)).toEqual(['valid', 'valid', 'hash-mismatch']);
    expect(chain.inspectBlocks()[2].issue).toBeNull();
    remine(chain, 2);
    expect(chain.isChainValid()).toBe(true);
    expect(balance(chain, 'Miner')).toBe(4.125);
  });

  it('refuses an overclaimed coinbase at once, and re-mining cannot fix it', () => {
    const chain = setup();
    mine(chain);
    expect(chain.isChainValid()).toBe(true);
    chain.tamperTransaction(1, 0, 99);
    expect(chain.inspectBlocks()[1]).toMatchObject({ status: 'hash-mismatch', issue: { reason: 'coinbase-overclaim', txIndex: 0 } });
    remine(chain, 1);
    expect(chain.inspectBlocks()[1]).toMatchObject({ hashMatches: true, status: 'transaction-invalid' });
    expect(chain.canExtend()).toBe(false);
  });

  it('reports a spent coinbase through its child: the txid changed, so the spend points at nothing', () => {
    const chain = setup();
    mine(chain);
    chain.createTransaction('Miner', 'Bob', 1, 0);
    mine(chain);
    chain.tamperTransaction(1, 0, 3);
    const checks = chain.inspectBlocks();
    expect(checks[1]).toMatchObject({ status: 'hash-mismatch', issue: null });
    expect(checks[2]).toMatchObject({ status: 'transaction-invalid', issue: { reason: 'missing-input', txIndex: 1 } });
    expect(chain.getTamperedEdits()).toHaveLength(1);
    chain.undoTamper(1);
    expect(chain.isChainValid()).toBe(true);
  });

  it('breaks the signature of a transfer and the undo restores it', () => {
    const chain = setup();
    mine(chain);
    chain.createTransaction('Miner', 'Bob', 1, 0);
    mine(chain);
    chain.tamperTransaction(2, 1, 2);
    expect(chain.inspectBlocks()[2]).toMatchObject({ status: 'hash-mismatch', signaturesValid: false, issue: { reason: 'signature' } });
    chain.undoTamper(2);
    expect(statuses(chain).every(status => status === 'valid')).toBe(true);
  });

  it('keeps an orphaned pending spend out of the next block and returns it on undo', () => {
    const chain = setup();
    mine(chain);
    const pending = chain.createTransaction('Miner', 'Bob', 1, 0);
    chain.tamperTransaction(1, 0, 1);
    expect(chain.ledger().memPool[0]).toMatchObject({ valid: false, issues: [{ reason: 'missing-input', input: 0 }] });
    chain.undoTamper(1);
    expect(chain.ledger().memPool[0].valid).toBe(true);
    chain.tamperTransaction(1, 0, 1);
    remine(chain, 1);
    expect(chain.isChainValid()).toBe(true);
    const block = mine(chain);
    expect(block.transactions).toHaveLength(1);
    expect(chain.isChainValid()).toBe(true);
    expect(chain.memPool).not.toContain(pending);
  });

  it('rejects a value outside the money range without editing', () => {
    const chain = setup();
    mine(chain);
    expect(chain.tamperTransaction(1, 0, 21_000_001)).toBe(false);
    expect(chain.tamperTransaction(1, 0, -1)).toBe(false);
    expect(chain.tamperTransaction(1, 0, Number.NaN)).toBe(false);
    expect(chain.tamperTransaction(1, 0, 3.125000001)).toBe(false);
    expect(chain.getTamperedEdits()).toEqual([]);
  });

  it('keeps old coinbases valid when the halving interval changes later', () => {
    const chain = setup();
    mine(chain);
    mine(chain);
    chain.halvingEvent = 2;
    mine(chain);
    expect(chain.isChainValid()).toBe(true);
  });
});
