// Mission evidence: the events lib/missions.js reduces, derived from what really happened.
// The workbench's come from the events of its session (lib/workbenchSession.js), a lab's
// from its own check. Pure: nothing here changes the ledger or sends telemetry.
import { ledgerOf } from './workbenchSession';
import { verifyProof } from './merkleLab';

// Read the real template/accepted block. No clicks, navigation or search progress
// count as a fee-market result.
export function feeMarketEvidence(chain, acceptedBlock = null) {
  const template = chain.blockTemplate();
  const ids = chain.memPool.map(tx => tx.createHash());
  return {
    type: 'fee_market_checked', chainValid: chain.isChainValid(),
    waiting: template.waiting.map(index => ({ txid: ids[index], reason: template.reasons[index], rate: template.entries[index].rate })),
    packages: template.entries.flatMap(entry => entry.parents.map(parent => ({
      parent: ids[parent], child: ids[entry.index],
      higherFee: entry.rate > template.entries[parent].rate,
      selected: template.included.includes(parent) && template.included.includes(entry.index)
    }))),
    acceptedBlock: acceptedBlock?.hash ?? null,
    confirmed: acceptedBlock?.transactions.map(tx => tx.createHash()) ?? []
  };
}

// Only an edit the chain applied counts; a refused one is no evidence.
export function tamperEvidence(event) {
  return event.applied ? [{ type: 'block_tampered', blockIndex: event.blockIndex, signed: event.signed, newest: event.newest }] : [];
}

// What a re-mine left: hashes, targets and links checked, the signature, and the edit still there.
export function signatureEvidence(event) {
  return { type: 'block_remined', blockIndex: event.blockIndex, chainValid: event.chainValid,
    hashesAndLinksValid: event.hashesAndLinksValid, signatureInvalid: event.signatureInvalid, editPresent: event.editPresent };
}

/** The mission evidence of one workbench session event, read with the snapshot after it. */
export function evidenceOf(event, snapshot) {
  switch (event.type) {
    case 'block-accepted':
      // The demo's block is no mined block of the learner's.
      return event.demo ? [] : [{ type: 'block_mined', backedWon: event.backedWon, epoch: event.epoch },
        feeMarketEvidence(ledgerOf(snapshot), event.block)];
    // Difficulty adapts every 10 mined blocks towards the target block time: the chain's
    // retarget on accepting the block ('auto'), or the learner's change ('manual').
    case 'difficulty-changed':
      return [{ type: 'difficulty_changed', direction: event.to > event.from ? 'up' : 'down', ...(event.source === 'manual' ? { manual: true } : {}) }];
    case 'block-remined': return [signatureEvidence(event)];
    case 'block-tampered': return tamperEvidence(event);
    case 'transaction-created':
      return [...(event.source === 'manual' ? [{ type: 'transaction_created' }] : []), feeMarketEvidence(ledgerOf(snapshot))];
    case 'edit-undone': return [{ type: 'edit_undone' }];
    case 'miner-backed': return [{ type: 'miner_backed', name: event.name }];
    case 'reset': return [{ type: 'reset' }];
    default: return [];
  }
}

// The Merkle lab's check of one proof: `path` as shown, verified against the header's `root`.
// `original` is the block's own path while the payment text is unchanged (null otherwise);
// exactly one changed sibling character against it counts as an edited sibling.
export function merkleEvidence(txid, path, root, levels, original = null) {
  const checked = verifyProof(txid, path, root, levels);
  return { type: 'merkle_checked', root, txid, valid: checked.valid,
    malformed: Boolean(checked.malformed), failedAt: checked.failedAt,
    editedSibling: original !== null && path.reduce((changes, step, i) => changes +
      [...step.hash].filter((character, position) => character !== original[i].hash[position]).length, 0) === 1 };
}
