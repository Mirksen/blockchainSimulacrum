import CryptoJS from 'crypto-js/core.js';
import 'crypto-js/sha256.js';
import { runSearch } from './powSearch';

// Exactly the visible text, encoded as UTF-8, once through SHA-256.
export const textHash = text => CryptoJS.SHA256(text.toWellFormed()).toString();
export const textTargetMet = (hash, zeros) => hash.startsWith('0'.repeat(zeros));

export function searchText({ text, zeros, signal, onProgress }) {
  // The displayed prefix includes its space; there is no hidden header or suffix.
  const prefix = `${text.toWellFormed().replace(/ \d+$/, '')} `;
  return runSearch({ entrants: [{ id: 'text', prefix, startNonce: 1 }], target: '0'.repeat(zeros),
    limit: 50_000, signal, onProgress: progress => onProgress({ ...progress, prefix }) })
    .then(result => ({ ...result, prefix }));
}
