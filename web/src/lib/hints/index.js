import { WORKBENCH_HINTS } from './workbench';
import { LAB_HINTS } from './labs';
import { POOL_HINTS } from './pool';

// The explaining texts behind every hover and focus bubble (components/HintLayer.jsx).
// Written for someone who has never mined a block (web/DESIGN.md, "Hints"): say what the
// thing is, what a click does and why it matters, in two or three plain sentences.
//
// An entry is { title?, text } or a function of the arguments that returns one.
// `hint(key, ...args)` returns the props for a control (button, link, field);
// `term(key, ...args)` returns them for a word or label and adds the dotted underline
// that tells a learner "hover me". An unknown key throws, so a typo fails its test.

export const HINTS = { ...WORKBENCH_HINTS, ...LAB_HINTS, ...POOL_HINTS };

function resolve(key, args) {
  const entry = HINTS[key];
  if (!entry) throw new Error(`Unknown hint "${key}"`);
  const value = typeof entry === 'function' ? entry(...args) : entry;
  if (!value?.text) throw new Error(`Hint "${key}" has no text`);
  return value;
}

export function hint(key, ...args) {
  const { title, text } = resolve(key, args);
  return title ? { 'data-hint': text, 'data-hint-title': title } : { 'data-hint': text };
}

export function term(key, ...args) {
  return { ...hint(key, ...args), 'data-hint-term': '' };
}
