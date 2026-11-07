import { describe, it, expect, vi } from 'vitest';
import { shareFind } from '../lib/shareFind';
const find = { name: 'test-miner', bestHash: '0000' + 'a'.repeat(60) };
const location = { origin: 'https://example.test', pathname: '/', search: '?private=excluded' };
describe('share a find', () => {
  it('uses native share and omits query strings', async () => {
    const share = vi.fn().mockResolvedValue();
    const writeText = vi.fn();
    expect(await shareFind(find, { navigator: { share, clipboard: { writeText } }, location })).toBe('Find shared.');
    expect(share.mock.calls[0][0]).toEqual({ title: 'A proof of work', text: expect.stringContaining('4 leading zeros'), url: 'https://example.test/#/pool/test-miner' });
    expect(writeText).not.toHaveBeenCalled();
  });
  it('copies text, exact hash and link without native share or when it fails', async () => {
    for (const share of [undefined, vi.fn().mockRejectedValue(new Error('unsupported'))]) {
      const writeText = vi.fn().mockResolvedValue();
      expect(await shareFind(find, { navigator: { share, clipboard: { writeText } }, location })).toBe('Find and link copied.');
      expect(writeText).toHaveBeenCalledWith(expect.stringContaining(find.bestHash + '\nhttps://example.test/#/pool/test-miner'));
    }
  });
  it('respects cancellation and reports clipboard failures', async () => {
    const writeText = vi.fn();
    expect(await shareFind(find, { navigator: { share: vi.fn().mockRejectedValue({ name: 'AbortError' }), clipboard: { writeText } }, location })).toBe('Sharing cancelled.');
    expect(writeText).not.toHaveBeenCalled();
    expect(await shareFind(find, { navigator: {}, location })).toContain('Could not copy.');
  });
});
