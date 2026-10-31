// The ledger rules: a walk over every block that builds the UTXO set, and the only validator of
// chain and mempool. Nothing is stored between walks, so an edit of history cannot leave a stale set.

import { classifyScript } from './script';

export const MAX_MONEY = 21_000_000 * 1e8;
export const outpoint = (txid, vout) => `${txid}:${vout}`;

// Largest coins first until `target` satoshis are covered; null when the coins do not reach it.
export function selectCoins(coins, target) {
  const picked = [];
  let total = 0;
  for (const coin of [...coins].sort((a, b) => b.value - a.value)) {
    if (total >= target) break;
    picked.push(coin);
    total += coin.value;
  }
  return total >= target ? { coins: picked, total } : null;
}

function addOutputs(tx, txid, utxo, origin) {
  tx.outputs.forEach(({ value, scriptPubKey }, vout) => {
    // OP_RETURN can never be spent, so it never enters the set.
    if (classifyScript(scriptPubKey).type !== 'memo') {
      utxo.set(outpoint(txid, vout), { txid, vout, value, scriptPubKey, ...origin });
    }
  });
}

// Checks a spend against `utxo` without changing anything. Verification results are cached per
// input: a change to the transaction changes its txid, a change to its parent removes the coin.
function checkSpend(tx, txid, utxo, spenders, verified) {
  const issues = [];
  let inputs = 0;
  let complete = true;
  const seen = new Set();
  tx.inputs.forEach((input, index) => {
    const key = outpoint(input.txid, input.vout);
    const coin = seen.has(key) ? null : utxo.get(key);
    seen.add(key);
    if (!coin) {
      complete = false;
      issues.push({ reason: spenders.has(key) || seen.size <= index ? 'double-spend' : 'missing-input', input: index });
      return;
    }
    inputs += coin.value;
    const cacheKey = outpoint(txid, index);
    if (!verified.has(cacheKey)) verified.set(cacheKey, tx.verifyInput(index, coin.scriptPubKey));
    if (!verified.get(cacheKey)) issues.push({ reason: 'signature', input: index });
  });
  const outputs = tx.outputs.reduce((sum, output) => sum + output.value, 0);
  if ((complete && outputs > inputs) || outputs > MAX_MONEY) issues.push({ reason: 'overspend' });
  return { issues, fee: complete ? inputs - outputs : null };
}

function spend(tx, txid, utxo, spenders, origin) {
  for (const input of tx.inputs) {
    const key = outpoint(input.txid, input.vout);
    if (utxo.delete(key)) spenders.set(key, { txid, ...origin });
  }
  addOutputs(tx, txid, utxo, origin);
}

function checkBlock(block, index, utxo, spenders, verified) {
  const issues = [];
  const report = (txIndex, found) => found.forEach(issue => issues.push({ ...issue, txIndex }));
  const [coinbase, ...spends] = block.transactions;
  if (!coinbase?.isCoinbase) issues.push({ reason: 'coinbase-missing', txIndex: 0 });
  let fees = 0;
  spends.forEach((tx, i) => {
    const txid = tx.createHash();
    if (tx.isCoinbase) issues.push({ reason: 'coinbase-misplaced', txIndex: i + 1 });
    else {
      const { issues: found, fee } = checkSpend(tx, txid, utxo, spenders, verified);
      report(i + 1, found);
      fees = fee === null || fees === null ? null : fees + fee;
    }
    spend(tx, txid, utxo, spenders, { blockIndex: index });
  });
  if (coinbase?.isCoinbase) {
    const claimed = coinbase.outputs.reduce((sum, output) => sum + output.value, 0);
    if (fees !== null && claimed > block.subsidy + fees) issues.push({ reason: 'coinbase-overclaim', txIndex: 0 });
    addOutputs(coinbase, coinbase.createHash(), utxo, { blockIndex: index });
  }
  return { issues, fees };
}

/**
 * Walks `blocks`, then `memPool` as the virtual next block.
 * Returns { confirmed, pending, spenders, blocks: [{ issues, fees }], memPool: [{ valid, issues, fee }] }:
 * `confirmed` is the UTXO set of the chain, `pending` adds the valid mempool entries, `spenders` maps an
 * outpoint to its spender. An issue is { reason, txIndex, input? }, with reason one of signature,
 * missing-input, double-spend, overspend, coinbase-overclaim, coinbase-missing or coinbase-misplaced.
 *
 * The genesis output is skipped: like Satoshi's, it cannot be spent. Block transactions enter the set
 * even when invalid, so one broken spend is reported once and not again for every descendant.
 */
export function validateChain(blocks, memPool = [], verified = new Map()) {
  const utxo = new Map();
  const spenders = new Map();
  const results = blocks.map((block, index) => (index === 0 ? { issues: [], fees: 0 } : checkBlock(block, index, utxo, spenders, verified)));
  const confirmed = new Map(utxo);
  const pending = memPool.map(tx => {
    const txid = tx.createHash();
    const { issues, fee } = checkSpend(tx, txid, utxo, spenders, verified);
    const valid = issues.length === 0;
    if (valid) spend(tx, txid, utxo, spenders, { blockIndex: null });
    return { valid, issues, fee };
  });
  return { confirmed, pending: utxo, spenders, blocks: results, memPool: pending };
}
