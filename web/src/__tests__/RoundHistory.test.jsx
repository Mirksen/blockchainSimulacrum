// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { RoundHistory } from '../components/RoundHistory';
import { getRounds } from '../lib/poolApi';
vi.mock('../lib/poolApi', async original => ({ ...await original(), getRounds: vi.fn() }));
afterEach(() => { cleanup(); vi.resetAllMocks(); });
it('shows finished-round winner and retained count with a profile link', async () => {
  vi.mocked(getRounds).mockResolvedValue([{ name: 'test-miner', round: { height: 900001, hash: 'a'.repeat(64) }, bestHash: '000a' + 'b'.repeat(60), bestZeros: 3, proofs: 45, miners: 2 }]);
  render(<RoundHistory />);
  expect((await screen.findByRole('link', { name: 'test-miner' })).getAttribute('href')).toBe('#/pool/test-miner');
  expect(screen.getByRole('cell', { name: '45' })).toBeTruthy();
});
it('distinguishes empty history from unavailability', async () => {
  vi.mocked(getRounds).mockResolvedValue([]);
  render(<RoundHistory />);
  await screen.findByText('No finished rounds with retained blocks yet.');
  cleanup();
  vi.mocked(getRounds).mockRejectedValue(new Error('down'));
  render(<RoundHistory />);
  await screen.findByText('Round history is unavailable right now.');
});
