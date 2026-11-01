// The view of a transaction the UI reads: who paid whom, which coins it spent, what came back as
// change and what was left as fee. Everything is derived from the bytes and the chain.

import { hexUtf8, addressOf } from './encoding';
import { classifyScript, parseScript, pubKeyHashOf, scriptAsm } from './script';
import { outpoint } from './utxo';

const coins = satoshis => satoshis / 1e8;

function addressFor(scriptPubKey) {
  const hash = pubKeyHashOf(scriptPubKey);
  return hash ? addressOf(hash) : null;
}

const pushes = hex => (parseScript(hex) ?? []).filter(op => op.data !== undefined).map(op => op.data);

// A signed P2PKH input proves its key; the owner is whoever that key hashes to.
function inputView(input, index, tx, txid, known, ownerOf, verified) {
  const parent = known.get(input.txid);
  const coin = parent?.tx.outputs[input.vout] ?? null;
  const state = verified.get(outpoint(txid, index));
  return {
    txid: input.txid, vout: input.vout, value: coin ? coins(coin.value) : null, owner: coin ? ownerOf(coin.scriptPubKey) : null,
    address: coin ? addressFor(coin.scriptPubKey) : null, blockIndex: parent?.blockIndex ?? null,
    scriptSig: input.scriptSig, scriptAsm: scriptAsm(input.scriptSig), signature: pushes(input.scriptSig)[0] ?? null,
    pubkey: pushes(input.scriptSig)[1] ?? null, lockAsm: coin ? scriptAsm(coin.scriptPubKey) : null,
    verified: coin && state !== undefined ? state : null
  };
}

function outputKind(tx, scriptPubKey, firstInputScript) {
  if (classifyScript(scriptPubKey).type === 'memo') return tx.isCoinbase ? 'commitment' : 'memo';
  if (tx.isCoinbase) return 'reward';
  return scriptPubKey === firstInputScript ? 'change' : 'payment';
}

/**
 * Builds describe(tx) over a validateChain result. `blocks` and `memPool` resolve spent coins, `names`
 * maps an output script to a wallet name. Views are cached per transaction for one describer.
 */
export function createDescriber({ blocks, memPool, ledger, names, verified }) {
  const known = new Map();
  blocks.forEach((block, blockIndex) => block.transactions.forEach(tx => known.set(tx.createHash(), { tx, blockIndex })));
  memPool.forEach(tx => known.set(tx.createHash(), { tx, blockIndex: null }));
  const ownerOf = script => names.get(script) ?? null;
  const views = new Map();

  const build = tx => {
    const txid = tx.createHash();
    const inputs = tx.isCoinbase ? [] : tx.inputs.map((input, index) => inputView(input, index, tx, txid, known, ownerOf, verified));
    const firstParent = tx.isCoinbase ? null : known.get(tx.inputs[0]?.txid)?.tx.outputs[tx.inputs[0].vout];
    const outputs = tx.outputs.map(({ value, scriptPubKey }, index) => {
      const kind = outputKind(tx, scriptPubKey, firstParent?.scriptPubKey);
      const spender = ledger.spenders.get(outpoint(txid, index));
      return { index, value: coins(value), satoshis: value, kind, owner: ownerOf(scriptPubKey), address: addressFor(scriptPubKey),
        scriptAsm: scriptAsm(scriptPubKey), memo: kind === 'memo' ? hexUtf8(classifyScript(scriptPubKey).data) : null,
        spentIn: spender ? spender.blockIndex : undefined, spent: Boolean(spender) };
    });
    const inputTotal = inputs.every(input => input.value !== null) ? inputs.reduce((sum, input) => sum + input.value * 1e8, 0) : null;
    const outputTotal = tx.outputs.reduce((sum, output) => sum + output.value, 0);
    const main = outputs[0];
    const change = outputs.filter(output => output.kind === 'change').reduce((sum, output) => sum + output.value, 0);
    return {
      txid, coinbase: tx.isCoinbase, hex: tx.serialize(), size: tx.size, version: tx.version, locktime: tx.locktime,
      inputs, outputs,
      coinbaseScriptAsm: tx.isCoinbase ? scriptAsm(tx.inputs[0].scriptSig) : null,
      from: tx.isCoinbase ? null : (inputs[0]?.owner ?? 'Unknown'),
      to: main?.owner ?? 'Unknown', amount: main?.value ?? 0, memo: tx.memo, change,
      fee: inputTotal === null || tx.isCoinbase ? null : coins(Math.round(inputTotal) - outputTotal),
      signed: tx.isCoinbase ? null : inputs.every(input => input.verified === true)
    };
  };

  return tx => {
    if (!views.has(tx)) views.set(tx, build(tx));
    return views.get(tx);
  };
}
