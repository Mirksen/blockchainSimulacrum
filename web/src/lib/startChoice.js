// The learner's answer to the first-visit question "Where do you want to start?"
// (components/StartChoice.jsx). Pure module: no React, no DOM. Storage is only touched
// through the object passed to load() and save().
//
//   'new'  Hashes are new to me: the Basics course in plain words.
//   'hash' I know what a hash is: the fingerprint scenes are skipped.
//   'play' Just let me play: the simulator, the course and missions stay one click away.

export const START_KEY = 'proofofwork-start';

const CHOICES = Object.freeze(['new', 'hash', 'play']);
const HASH_SKIPS = Object.freeze(['see-a-fingerprint', 'change-one-letter']);

const isChoice = value => CHOICES.includes(value);

/** The stored choice ('new' | 'hash' | 'play'), or null when missing, unknown or blocked. */
export function load(storage) {
  try {
    const stored = storage?.getItem(START_KEY);
    return isChoice(stored) ? stored : null;
  } catch {
    return null;
  }
}

/** Stores a choice; returns false for an unknown choice or when storage is missing or refuses. */
export function save(storage, choice) {
  try {
    if (!storage || !isChoice(choice)) return false;
    storage.setItem(START_KEY, choice);
    return true;
  } catch {
    return false;
  }
}

/** The text tone of the mission texts (lib/missions.js, textOf): plain words for newcomers. */
export function toneOf(choice) {
  return choice === 'new' ? 'plain' : 'technical';
}

/**
 * The tone of the Basics course itself. Its scenes speak in pictures (page, seal, roll), so
 * everyone gets the plain course except a visitor who said they know hashes.
 */
export function courseToneOf(choice) {
  return choice === 'hash' ? 'technical' : 'plain';
}

/** The mission ids a choice skips (lib/missions.js, skip). */
export function skipsOf(choice) {
  return choice === 'hash' ? [...HASH_SKIPS] : [];
}
