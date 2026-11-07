import { minerProfileHash } from './poolApi';
import { leadingZeros } from './poolProof';

export async function shareFind({ name, bestHash }, { navigator = globalThis.navigator, location = globalThis.location } = {}) {
  const url = `${location.origin}${location.pathname}${minerProfileHash(name)}`;
  const text = `${name} found a block with ${leadingZeros(bestHash)} leading zeros on proofofwork.fyi. Hash: ${bestHash}`;
  if (typeof navigator.share === 'function') {
    try {
      await navigator.share({ title: 'A proof of work', text, url });
      return 'Find shared.';
    } catch (error) {
      if (error?.name === 'AbortError') return 'Sharing cancelled.';
    }
  }
  try {
    await navigator.clipboard.writeText(`${text}\n${url}`);
    return 'Find and link copied.';
  } catch {
    return 'Could not copy. The address bar holds the profile link.';
  }
}
