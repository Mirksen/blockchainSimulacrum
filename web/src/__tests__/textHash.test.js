import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { searchText, textHash } from '../lib/textHash';

const sha = text => createHash('sha256').update(text).digest('hex');

describe('text hash encoding and search identity', () => {
  it.each(['', 'abc', 'abc ', 'abc\n', 'Lerntext 🚀', 'broken \ud800'])('matches UTF-8 SHA-256 for %j', text => {
    expect(textHash(text)).toBe(sha(text));
  });
  it.each(['Lerntext 🚀 99', 'broken \ud800 99'])('uses identical UTF-8 encoding and visible numbered text for %j', async text => {
    const result = await searchText({ text, zeros: 1, onProgress: () => {} });
    expect(result.status).toBe('found');
    const visible = `${result.prefix}${result.nonce}`;
    expect(result.prefix).toBe(text.toWellFormed().replace(/ \d+$/, '') + ' ');
    expect(result.hash).toBe(sha(visible));
    expect(result.hash).toBe(textHash(visible));
    expect(result.hash.startsWith('0')).toBe(true);
  });
});
