// @vitest-environment jsdom
import { cleanup, render, screen, within } from '@testing-library/react';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { ParticipantDetailsModal } from '../components/ParticipantDetailsModal';
import { TransactionDetailsModal } from '../components/TransactionDetailsModal';
import { candidateHash, createBlockchain } from '../lib/blockchain';
import { meetsTarget } from '../../../shared/bitcoin-block.mjs';

vi.mock('../components/Modal', () => ({ Modal: ({ children }) => <div role="dialog">{children}</div> }));
afterEach(cleanup);

function mine(chain, name = 'Miner') {
  const candidate = chain.prepareCandidate(chain.getParticipantByName(name));
  let nonce = 0;
  while (!meetsTarget(candidateHash(candidate, nonce), candidate.bits)) nonce++;
  return chain.acceptBlock(candidate, nonce, candidateHash(candidate, nonce)).block;
}

let chain;
let transfer;
beforeAll(() => {
  chain = createBlockchain({ participants: ['Miner', 'Bob'], miners: ['Miner'], miningDifficulty: 1 });
  mine(chain);
  mine(chain);
  transfer = chain.createTransaction('Miner', 'Bob', 5, 0.25, 'Coffee');
});

describe('TransactionDetailsModal', () => {
  const list = name => within(screen.getByRole('list', { name }));

  it('shows the coins going in, the outputs coming out and the fee between them', () => {
    render(<TransactionDetailsModal transaction={chain.describer()(transfer)} blockIndex={null} onClose={() => {}} />);
    expect(screen.getByText('Inputs (2)')).toBeTruthy();
    expect(list('Inputs').getAllByRole('listitem')).toHaveLength(2);
    expect(list('Inputs').getAllByText('3.12500000')).toHaveLength(2);
    expect(screen.getByText('Outputs (3)')).toBeTruthy();
    const outputs = list('Outputs').getAllByRole('listitem').map(item => item.textContent);
    expect(outputs[0]).toMatch(/^PaymentBob5\.00000000/);
    expect(outputs[1]).toMatch(/^ChangeMiner1\.00000000/);
    expect(outputs[2]).toMatch(/^Memo0\.00000000Coffee · cannot be spent/);
    expect(screen.getByRole('group', { name: 'Fee' }).textContent).toContain('6.25000000 − 6.00000000 = 0.25000000');
    expect(screen.getByText('Every input passes its script')).toBeTruthy();
    expect(screen.getByText('Mempool')).toBeTruthy();
  });

  it('explains the scripts and shows the bytes behind the txid', () => {
    const view = chain.describer()(transfer);
    render(<TransactionDetailsModal transaction={view} blockIndex={2} onClose={() => {}} />);
    expect(screen.getByText(view.txid)).toBeTruthy();
    expect(screen.getByText(view.hex)).toBeTruthy();
    expect(screen.getByText(`Raw bytes (${view.size} bytes)`)).toBeTruthy();
    expect(screen.getAllByText(/^OP_DUP OP_HASH160 [0-9a-f]{40} OP_EQUALVERIFY OP_CHECKSIG$/).length).toBeGreaterThan(0);
  });

  it('shows a coinbase as new coins without inputs', () => {
    const coinbase = chain.describer()(chain.blockArray[1].transactions[0]);
    render(<TransactionDetailsModal transaction={coinbase} blockIndex={1} onClose={() => {}} />);
    expect(screen.getByText('Coinbase: new coins, no input spent')).toBeTruthy();
    expect(screen.getByText('No signature: a coinbase creates coins')).toBeTruthy();
    expect(screen.queryByRole('group', { name: 'Fee' })).toBeNull();
  });

  it('names an input whose coin no longer exists', () => {
    const edited = createBlockchain({ participants: ['Miner', 'Bob'], miners: ['Miner'], miningDifficulty: 1 });
    mine(edited);
    const pending = edited.createTransaction('Miner', 'Bob', 1, 0);
    edited.tamperTransaction(1, 0, 2);
    render(<TransactionDetailsModal transaction={edited.describer()(pending)} blockIndex={null} onClose={() => {}} />);
    expect(screen.getByText('output no longer exists')).toBeTruthy();
    expect(screen.getByText('An input fails its script or its coin is gone')).toBeTruthy();
  });
});

describe('ParticipantDetailsModal', () => {
  it('lists the unspent outputs whose sum is the balance', () => {
    const balances = chain.getAllBalances();
    const miner = chain.getParticipantByName('Miner');
    render(<ParticipantDetailsModal participant={miner} balance={balances[0]} blocks={chain.blockArray} describeTx={chain.describer()} onClose={() => {}} />);
    expect(screen.getByText('Coins (2 unspent outputs)')).toBeTruthy();
    expect(within(screen.getByRole('list', { name: 'Unspent outputs' })).getAllByRole('listitem')).toHaveLength(2);
    expect(screen.getByText(miner.address)).toBeTruthy();
    expect(miner.address).toMatch(/^1/);
  });
});
