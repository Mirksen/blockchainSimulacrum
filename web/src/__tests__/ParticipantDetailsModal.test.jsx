// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { ParticipantDetailsModal } from '../components/ParticipantDetailsModal';
import { Participant } from '../lib/blockchain';

// Native dialog behavior is exercised by the browser acceptance checks.
vi.mock('../components/Modal', () => ({ Modal: ({ children }) => <div role="dialog">{children}</div> }));
const PHRASE = `${'abandon '.repeat(11)}about`; // Public BIP39 zero-entropy fixture.
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

it('verifies recovery locally without changing the participant or its miner settings', () => {
  const participant = Participant.fromSeedPhrase('Fixture Miner', PHRASE, true);
  participant.hashpower = 7;
  participant.blocksWon = 3;
  const before = { ...participant };
  const recover = vi.spyOn(Participant, 'fromSeedPhrase');
  render(<ParticipantDetailsModal participant={participant} blocks={[]} onClose={() => {}} isMining={false} />);
  expect(screen.getByText('Demo recovery phrase (BIP39)')).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: 'Verify recovery' }));
  expect(recover).toHaveBeenCalledTimes(1);
  expect(screen.getByRole('status').textContent).toBe('Verified: this phrase recovers the same demo public key.');
  expect(participant).toEqual(before);
  expect(screen.getByText(/empty passphrase/)).toBeTruthy();
});

it('shows a fixed failure message if phrase and public key do not match', () => {
  const participant = Participant.fromSeedPhrase('Fixture Wallet', PHRASE);
  participant.publicKey = 'synthetic-mismatched-public-key';
  render(<ParticipantDetailsModal participant={participant} blocks={[]} onClose={() => {}} />);
  fireEvent.click(screen.getByRole('button', { name: 'Verify recovery' }));
  expect(screen.getByRole('status').textContent).toBe('Recovery could not be verified.');
});
