import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { createPages, inspectPages, PAGE_TEXTS, repairPages, sealOf, START_SEAL } from '../lib/sealedPages';

const digest = text => createHash('sha256').update(text).digest('hex');
const statuses = (pages, zeros) => inspectPages(pages, zeros).pages.map(page => page.status);
const editText = (pages, index, text) => pages.map((page, at) => (at === index ? { ...page, text } : page));

describe('sealedPages', () => {
  it('seals a page as SHA-256 of the previous seal, the text and the lucky number', () => {
    expect(sealOf(START_SEAL, 'Alice pays Bob 10', 7)).toBe(digest(`${START_SEAL} Alice pays Bob 10 7`));
  });

  it('creates a valid chain in which every page builds on the seal before it', () => {
    const pages = createPages(0);
    expect(pages.map(page => page.text)).toEqual([...PAGE_TEXTS]);
    expect(pages[0].previous).toBe(START_SEAL);
    expect(pages[1].previous).toBe(pages[0].seal);
    expect(pages[2].previous).toBe(pages[1].seal);
    expect(inspectPages(pages, 0)).toEqual({ valid: true, pages: pages.map(page => ({ status: 'fits', fits: true, current: page.seal })) });
  });

  it('breaks the edited page and marks every later page as built on it', () => {
    const pages = createPages(0);
    const first = editText(pages, 0, 'Alice pays Bob 100');
    expect(statuses(first, 0)).toEqual(['broken', 'built-on-broken', 'built-on-broken']);
    expect(inspectPages(first, 0).valid).toBe(false);
    const second = editText(pages, 1, 'Bob pays Carol 40');
    expect(statuses(second, 0)).toEqual(['fits', 'broken', 'built-on-broken']);
    // Changing the text back restores the seal.
    expect(inspectPages(editText(first, 0, 'Alice pays Bob 10'), 0).valid).toBe(true);
  });

  it('breaks a page whose stored previous seal no longer matches the page before', () => {
    const pages = createPages(0);
    const relinked = pages.map((page, at) => (at === 1 ? { ...page, previous: digest('elsewhere') } : page));
    expect(statuses(relinked, 0)).toEqual(['fits', 'broken', 'built-on-broken']);
  });

  it('repairs without guessing in exactly one hash per page, three in total', () => {
    const broken = editText(createPages(0), 0, 'Alice pays Bob 100');
    const result = repairPages(broken, 0);
    expect(result.hashes).toEqual([1, 1, 1]);
    expect(result.total).toBe(3);
    expect(result.pages[0].text).toBe('Alice pays Bob 100');
    expect(inspectPages(result.pages, 0).valid).toBe(true);
    expect(result.pages[1].previous).toBe(result.pages[0].seal);
  });

  it('repairs with guessing by trying lucky numbers from 0 until each seal starts with the zeros', () => {
    for (const zeros of [2, 3]) {
      const broken = editText(createPages(zeros), 0, 'Alice pays Bob 100');
      expect(inspectPages(broken, zeros).valid).toBe(false);
      const result = repairPages(broken, zeros);
      expect(inspectPages(result.pages, zeros).valid).toBe(true);
      result.pages.forEach((page, index) => {
        expect(page.seal.startsWith('0'.repeat(zeros))).toBe(true);
        expect(result.hashes[index]).toBe(page.number + 1);
        for (let number = 0; number < page.number; number++) {
          expect(sealOf(page.previous, page.text, number).startsWith('0'.repeat(zeros))).toBe(false);
        }
      });
      expect(result.total).toBe(result.hashes.reduce((sum, count) => sum + count, 0));
      expect(result.total).toBeGreaterThan(3);
    }
  });

  it.each([0, 2, 3])('keeps intact seals and counts only new search attempts at %i zeros', zeros => {
    const pages = createPages(zeros);
    for (const index of [0, 1, 2]) {
      const edited = editText(pages, index, 'Changed entry');
      const result = repairPages(edited, zeros);
      expect(result.pages.slice(0, index)).toEqual(pages.slice(0, index));
      expect(result.hashes).toEqual(result.pages.map((page, at) => at < index ? 0 : zeros ? page.number + 1 : 1));
      expect(inspectPages(result.pages, zeros).valid).toBe(true);
      expect(repairPages(result.pages, zeros)).toEqual({ pages: result.pages, hashes: [0, 0, 0], total: 0 });
    }
  });

  it('checks the guessing rule and rejects unknown settings', () => {
    const free = createPages(0);
    expect(inspectPages(free, 0).valid).toBe(true);
    expect(inspectPages(createPages(2), 2).valid).toBe(true);
    // A free chain whose seals happen not to start with 00 fails a 2-zero rule.
    if (!free.every(page => page.seal.startsWith('00'))) expect(inspectPages(free, 2).valid).toBe(false);
    expect(() => inspectPages(free, 1)).toThrow(RangeError);
    expect(() => repairPages(free, 4)).toThrow(RangeError);
  });
});
