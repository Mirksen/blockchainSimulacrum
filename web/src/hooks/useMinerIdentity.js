import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { getChallenge, isValidPoolName, submitProof } from '../lib/poolApi';
import { leadingZeros, proofOfBlock, signatureOf } from '../lib/poolProof';
import { generateMinerName, isGeneratedName } from '../../../shared/miner-names.mjs';

const NAME_KEY = 'proofofwork-pool-name';
// Waits for the end of typing, so the rate-limited pool sees one name, not every letter.
export const NAME_SETTLE_MS = 400;
// A round stays minable for about a day; this keeps new blocks well inside its window.
export const OFFER_MAX_AGE_MS = 10 * 60_000;
// How long an unreachable pool is left alone before a new block asks it again.
export const OFFLINE_RETRY_MS = 60_000;

function readName() {
  try {
    const stored = globalThis.localStorage?.getItem(NAME_KEY);
    return isValidPoolName(stored) ? stored : '';
  } catch { return ''; }
}
function storeName(name) {
  try { globalThis.localStorage?.setItem(NAME_KEY, name); } catch { /* Storage may be blocked; the name still works. */ }
}

// The visitor's miner name and what the leaderboard knows about it: the round offered for
// that name (`pool`: idle, connecting, ready, refused or offline) and the last block sent
// (`entry`: state sending, accepted or failed). Every visitor starts with a generated name, so
// every first block reaches the board; the simulator mines without any of it. `name` is the
// field's text; an empty field keeps signing as `fallback`.
export function useMinerIdentity({ onAccepted } = {}) {
  const [typed, setName] = useState(() => readName() || generateMinerName());
  const [fallback, setFallback] = useState(() => (isGeneratedName(typed) ? typed : generateMinerName()));
  const name = typed === '' ? fallback : typed;
  const firstName = useRef(name);
  // Both answers remember the name they belong to; a new name starts from nothing.
  const [answered, setAnswered] = useState({ name: null, pool: 'connecting' });
  const [sent, setSent] = useState({ name: null, entry: null });
  const offer = useRef(null);
  const attempt = useRef({ at: -Infinity, controller: null });
  const valid = isValidPoolName(name);
  const pool = !valid ? 'idle' : answered.name === name ? answered.pool : 'connecting';
  const entry = sent.name === name ? sent.entry : null;

  const ask = useCallback(async minerName => {
    attempt.current.controller?.abort();
    const controller = new AbortController();
    attempt.current = { at: Date.now(), controller };
    try {
      const answer = await getChallenge(minerName, { signal: controller.signal });
      if (controller.signal.aborted) return;
      offer.current = { answer, at: Date.now() };
      setAnswered({ name: minerName, pool: 'ready' });
    } catch (error) {
      if (error?.name === 'AbortError' || controller.signal.aborted) return;
      offer.current = null;
      const refused = error?.code === 'name-unavailable';
      // Digits read as letters can turn a generated name into a blocked word. The server
      // decides; a refused generated name just makes way for another one.
      if (refused && isGeneratedName(minerName)) {
        const next = generateMinerName();
        setFallback(next);
        setName(next);
        return;
      }
      setAnswered({ name: minerName, pool: refused ? 'refused' : 'offline' });
    }
  }, []);

  useEffect(() => {
    offer.current = null;
    attempt.current.controller?.abort();
    if (!valid) return undefined;
    storeName(name);
    // The name a visit starts with is asked about at once: the first block must not miss it.
    const timer = setTimeout(() => void ask(name), name === firstName.current ? 0 : NAME_SETTLE_MS);
    return () => clearTimeout(timer);
  }, [ask, name, valid]);

  // The signer the simulator calls: it never waits for the network, so a slow or absent
  // pool only leaves blocks unsigned. Asking again happens beside the next block.
  const signer = useMemo(() => ({
    current() {
      if (!valid) return null;
      const age = offer.current ? Date.now() - offer.current.at : Infinity;
      if (offer.current ? age > OFFER_MAX_AGE_MS : Date.now() - attempt.current.at > OFFLINE_RETRY_MS) void ask(name);
      return offer.current ? signatureOf(offer.current.answer) : null;
    },
    async submit(block, signature, height) {
      const shown = { height, zeros: leadingZeros(block.hash) };
      const show = state => setSent({ name: signature.name, entry: { ...shown, ...state } });
      show({ state: 'sending' });
      try {
        await submitProof(signature, proofOfBlock(block));
      } catch (error) {
        if (error?.status === 410) offer.current = null;
        show({ state: 'failed', message: error?.message });
        return;
      }
      show({ state: 'accepted' });
      onAccepted?.();
    },
  }), [ask, name, onAccepted, valid]);

  return { name: typed, signingName: name, fallback, generated: isGeneratedName(name), setName, valid, pool, entry, signer };
}
