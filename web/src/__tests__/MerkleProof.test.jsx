// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { ChainLab } from '../components/ChainLab';
import { MerkleProof } from '../components/MerkleProof';
import { sampleBlock } from '../lib/merkleLab';

afterEach(cleanup);
const verdict = () => screen.getByRole('status');
const level = name => screen.getByRole('listitem', { name });
const flip = hash => (hash[0] === '0' ? '1' : '0') + hash.slice(1);

describe('MerkleProof', () => {
  it('proves the chosen payment of the 16-transaction example with 4 hashes', () => {
    render(<MerkleProof />);
    const block = sampleBlock(16);
    expect(screen.getByText('4 hashes instead of 16 transactions')).toBeTruthy();
    expect(screen.getAllByRole('button', { name: /^Tx \d+/ })).toHaveLength(16);
    expect(screen.getByRole('button', { name: /^Tx 5 / }).getAttribute('aria-pressed')).toBe('true');
    expect(verdict().textContent).toMatch(/^Payment proven/);
    expect(screen.getAllByText(block.root).length).toBeGreaterThanOrEqual(2);
    const path = within(screen.getByRole('list', { name: 'Proof path' }));
    expect(path.getAllByRole('listitem')).toHaveLength(5);
    expect(within(level('Level 4 · root')).getByText(block.root)).toBeTruthy();
    expect(screen.queryByText('Differs from the block’s tree here')).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: /^Tx 12 / }));
    expect(screen.getByLabelText('Payment text of transaction 12').value).toBe(block.texts[12]);
    expect(within(level('Level 0 · transaction')).getByText(block.txids[12])).toBeTruthy();
    expect(verdict().textContent).toMatch(/^Payment proven/);
  });

  it('fails at level 0 when the payment text changes, and only there', () => {
    render(<MerkleProof />);
    fireEvent.change(screen.getByLabelText('Payment text of transaction 5'), { target: { value: 'Payment 5: demo wallet F pays shop 36 600 virtual coins.' } });
    expect(verdict().textContent).toMatch(/^Payment not proven.*fails at level 0/);
    expect(within(level('Level 0 · transaction')).getByText('Differs from the block’s tree here')).toBeTruthy();
    expect(screen.getAllByText('Differs from the block’s tree here')).toHaveLength(1);
    expect(level('Level 0 · transaction').className).toContain('is-failed');
    expect(level('Level 1').className).not.toContain('is-failed');
  });

  it('fails at the level above an edited sibling hash', () => {
    render(<MerkleProof />);
    const sibling = screen.getByLabelText(/^Sibling at level 1 /);
    fireEvent.change(sibling, { target: { value: flip(sibling.value) } });
    expect(verdict().textContent).toMatch(/fails at level 2/);
    expect(within(level('Level 2')).getByText('Differs from the block’s tree here')).toBeTruthy();
    expect(screen.getAllByText('Differs from the block’s tree here')).toHaveLength(1);

    fireEvent.change(sibling, { target: { value: 'abc' } });
    expect(screen.getByText('Enter 64 hexadecimal characters.')).toBeTruthy();
    expect(verdict().textContent).toMatch(/sibling at level 1 is not a 64-character hash/);
  });

  it('changes block size: larger blocks show only the chosen payment and its path', () => {
    render(<MerkleProof />);
    fireEvent.click(screen.getByLabelText('4 transactions'));
    expect(screen.getByText('2 hashes instead of 4 transactions')).toBeTruthy();
    expect(screen.getAllByRole('button', { name: /^Tx \d+/ })).toHaveLength(4);
    expect(verdict().textContent).toMatch(/^Payment proven/);

    fireEvent.click(screen.getByLabelText('4,096 transactions'));
    expect(screen.getByText('12 hashes instead of 4,096 transactions')).toBeTruthy();
    expect(screen.queryAllByRole('button', { name: /^Tx \d+/ })).toHaveLength(0);
    const pick = screen.getByLabelText('Transaction number (0–4,095)');
    fireEvent.change(pick, { target: { value: '4000' } });
    expect(screen.getByLabelText('Payment text of transaction 4000').value).toBe(sampleBlock(4096).texts[4000]);
    expect(within(screen.getByRole('list', { name: 'Proof path' })).getAllByRole('listitem')).toHaveLength(13);
    expect(verdict().textContent).toMatch(/^Payment proven/);
    fireEvent.change(pick, { target: { value: '5000' } });
    expect(screen.getByText(/Enter a whole number from 0 to 4,095/)).toBeTruthy();
    expect(screen.getByLabelText('Payment text of transaction 4000')).toBeTruthy();
  });

  it('restores the example with one reset', () => {
    render(<MerkleProof />);
    fireEvent.click(screen.getByLabelText('256 transactions'));
    fireEvent.change(screen.getByLabelText('Payment text of transaction 5'), { target: { value: 'An altered toy payment.' } });
    expect(verdict().textContent).toMatch(/^Payment not proven/);
    fireEvent.click(screen.getByRole('button', { name: 'Reset example' }));
    expect(screen.getByLabelText('16 transactions').checked).toBe(true);
    expect(screen.getByLabelText('Payment text of transaction 5').value).toBe(sampleBlock(16).texts[5]);
    expect(verdict().textContent).toMatch(/^Payment proven/);
  });
});

describe('Chain lab experiment switch', () => {
  it('offers Prove a payment as the third experiment', () => {
    render(<ChainLab onClose={() => {}} />);
    const nav = within(screen.getByRole('navigation', { name: 'Chain lab experiment' }));
    expect(nav.getAllByRole('button').map(button => button.textContent)).toEqual(['Repair a chain', 'Competing branches', 'Prove a payment']);
    fireEvent.click(nav.getByRole('button', { name: 'Prove a payment' }));
    expect(nav.getByRole('button', { name: 'Prove a payment' }).getAttribute('aria-pressed')).toBe('true');
    expect(screen.getByRole('heading', { level: 2, name: 'Prove a payment' })).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Is this payment in the block?' })).toBeTruthy();
    expect(screen.queryByLabelText('Block 1 data')).toBeNull();
    fireEvent.click(nav.getByRole('button', { name: 'Repair a chain' }));
    expect(screen.getByLabelText('Block 1 data')).toBeTruthy();
  });
});
