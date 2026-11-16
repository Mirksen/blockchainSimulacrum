// A detached copy for the inclusion experiment. Keep the mined header's root even when
// the current transactions were edited: rebuilding the tree must never repair the evidence.
import { displayHash, headerHex, meetsTarget } from '../../../shared/bitcoin-block.mjs';
import { sha256d } from './blockHeader';
import { buildTree } from './merkleLab';

export function captureBlockProof(block, blockIndex, describeTx, initialIndex = 0) {
  if (!block || !Number.isInteger(blockIndex) || blockIndex < 0 || !block.transactions.length ||
    !Number.isInteger(initialIndex) || initialIndex < 0 || initialIndex >= block.transactions.length) {
    throw new RangeError('Choose a transaction in a mined block.');
  }
  const transactions = Object.freeze(block.transactions.map(tx => {
    const view = describeTx(tx);
    const hex = tx.serialize();
    return Object.freeze({ hex, txid: displayHash(hex, sha256d),
      label: `${view.coinbase ? 'Coinbase' : view.from} → ${view.to} · ${view.amount.toFixed(8)}` });
  }));
  const tree = buildTree(transactions.map(tx => tx.txid));
  const header = headerHex({ version: block.version, previousHash: block.previousHash, merkleRoot: block.txRoot,
    time: block.time, bits: block.bits, nonce: block.nonce });
  const computedHash = displayHash(header, sha256d);
  return Object.freeze({ kind: 'workbench', blockIndex, initialIndex, size: transactions.length, transactions,
    texts: Object.freeze(transactions.map(tx => tx.label)), txids: Object.freeze([...tree.txids]),
    root: block.txRoot, treeRoot: tree.root, header, hash: block.hash, headerHash: computedHash,
    headerHashValid: computedHash === block.hash, workValid: meetsTarget(computedHash, block.bits),
    proofFor: tree.proofFor });
}
