// Read the real template/accepted block. No clicks, navigation or search progress
// count as a fee-market result. Nothing here changes the ledger or sends telemetry.
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
