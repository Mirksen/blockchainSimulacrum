import { describe, expect, it } from 'vitest';
import { START_KEY, load, save, skipsOf, toneOf } from '../lib/startChoice';
import { MISSIONS } from '../lib/missions';

// A Storage-like object over a Map, as missions.test.js uses.
function memoryStorage(entries = {}) {
  const map = new Map(Object.entries(entries));
  return { getItem: key => (map.has(key) ? map.get(key) : null), setItem: (key, value) => map.set(key, String(value)), map };
}
const blocked = {
  getItem() { throw new DOMException('Blocked', 'SecurityError'); },
  setItem() { throw new DOMException('Blocked', 'SecurityError'); }
};

describe('startChoice storage', () => {
  it('uses its own key', () => {
    expect(START_KEY).toBe('proofofwork-start');
  });

  it.each(['new', 'hash', 'play'])('loads the stored choice %s', choice => {
    expect(load(memoryStorage({ [START_KEY]: choice }))).toBe(choice);
  });

  it.each([undefined, '', 'NEW', 'basics', '1', '{"choice":"new"}'])('loads null for anything else (%s)', stored => {
    expect(load(memoryStorage(stored === undefined ? {} : { [START_KEY]: stored }))).toBeNull();
  });

  it('loads null without storage or when storage is blocked', () => {
    expect(load(null)).toBeNull();
    expect(load(undefined)).toBeNull();
    expect(load(blocked)).toBeNull();
  });

  it('saves a known choice and reads it back', () => {
    const storage = memoryStorage();
    expect(save(storage, 'hash')).toBe(true);
    expect(storage.map.get(START_KEY)).toBe('hash');
    expect(load(storage)).toBe('hash');
    expect(save(storage, 'play')).toBe(true);
    expect(load(storage)).toBe('play');
  });

  it('refuses unknown choices, missing and blocked storage', () => {
    const storage = memoryStorage();
    expect(save(storage, 'everything')).toBe(false);
    expect(save(storage, null)).toBe(false);
    expect(storage.map.size).toBe(0);
    expect(save(null, 'new')).toBe(false);
    expect(save(blocked, 'new')).toBe(false);
  });
});

describe('what a choice means', () => {
  it('speaks plainly only to newcomers', () => {
    expect(toneOf('new')).toBe('plain');
    expect(toneOf('hash')).toBe('technical');
    expect(toneOf('play')).toBe('technical');
    expect(toneOf(null)).toBe('technical');
  });

  it('skips the two fingerprint scenes for someone who knows hashes, nothing otherwise', () => {
    expect(skipsOf('hash')).toEqual(['see-a-fingerprint', 'change-one-letter']);
    for (const id of skipsOf('hash')) expect(MISSIONS.find(mission => mission.id === id)?.view).toBe('basics');
    expect(skipsOf('new')).toEqual([]);
    expect(skipsOf('play')).toEqual([]);
    expect(skipsOf(null)).toEqual([]);
  });

  it('hands out a fresh list each time', () => {
    const first = skipsOf('hash');
    first.push('copy-problem');
    expect(skipsOf('hash')).toEqual(['see-a-fingerprint', 'change-one-letter']);
  });
});
