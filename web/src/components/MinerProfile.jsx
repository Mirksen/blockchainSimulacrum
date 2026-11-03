import { Fragment, useEffect, useState } from 'react';
import { getMiner, isValidPoolName, minerProfileHash, POOL_HASH, POOL_UNAVAILABLE_MESSAGE, UNKNOWN_MINER_MESSAGE } from '../lib/poolApi';
import { formatDifficulty, leadingZeros, verifyRow } from '../lib/poolProof';
import './MinerProfile.css';

const blockLink = height => `https://mempool.space/block/${height}`;
const formatNumber = value => Number(value).toLocaleString('en-US');
const formatTime = time => new Date(time).toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' });
const formatRank = rank => (rank === null ? '—' : `#${rank}`);
const isAbort = error => error?.name === 'AbortError';
// A plain click stays in this page; a modified click opens the link as the browser does.
const plainClick = event => event.button === 0 && !event.metaKey && !event.ctrlKey && !event.shiftKey && !event.altKey;

function zerosLabel(count) { return `${count} ${count === 1 ? 'zero' : 'zeros'}`; }

function FullHash({ hash }) {
  const zeros = leadingZeros(hash);
  return <code className="miner-profile-hash"><span className="miner-profile-zero">{hash.slice(0, zeros)}</span>{hash.slice(zeros)}</code>;
}

// One round's block, recomputed in this browser from the public fields (as Verify on the board).
function Verification({ block }) {
  const check = verifyRow(block);
  return <div className="miner-profile-verify" role="status">
    <p>Double SHA-256 of the 80-byte block header</p>
    <code className="miner-profile-preimage">{check.header}</code>
    <p>is <code className="miner-profile-preimage">{check.hash}</code></p>
    <p>Its coinbase commits to <code className="miner-profile-preimage">{check.commitment}</code></p>
    <p className={check.matches ? 'miner-profile-verify-ok' : 'miner-profile-verify-bad'}>
      {check.matches ? `Matches the listed hash: ${zerosLabel(block.bestZeros)}, signed by ${block.name} in round ${block.round.height}.`
        : 'Does not match the listed hash and name.'}</p>
  </div>;
}

function Rounds({ blocks }) {
  const [open, setOpen] = useState(null);
  return <div className="miner-profile-table" tabIndex={0} role="region" aria-labelledby="miner-profile-rounds-title">
    <table>
      <thead><tr><th scope="col">Bitcoin block</th><th scope="col">Zeros</th><th scope="col">Difficulty</th><th scope="col">Blocks</th>
        <th scope="col">Found</th><th scope="col"><span className="miner-profile-sr">Check</span></th></tr></thead>
      <tbody>{blocks.map(block => {
        const key = `${block.round.height}:${block.round.hash}`;
        const isOpen = open === key;
        return <Fragment key={key}>
          <tr>
            <td><a href={blockLink(block.round.height)} target="_blank" rel="noreferrer">#{block.round.height}</a></td>
            <td>{block.bestZeros}</td>
            <td>{formatDifficulty(block.difficulty)}</td>
            <td>{formatNumber(block.proofs)}</td>
            <td><time dateTime={new Date(block.foundAt).toISOString()}>{formatTime(block.foundAt)}</time></td>
            <td><button type="button" className="btn btn-transparent miner-profile-verify-btn" aria-expanded={isOpen}
              aria-label={`Verify the block of round ${block.round.height}`} onClick={() => setOpen(isOpen ? null : key)}>Verify</button></td>
          </tr>
          {isOpen && <tr className="miner-profile-verify-row"><td colSpan={6}><Verification block={block} /></td></tr>}
        </Fragment>;
      })}</tbody>
    </table>
  </div>;
}

// One miner name's public profile: its ranks and every round it has a block in.
export function MinerProfile({ name, ownName = '', refreshKey = 0, onBack }) {
  const valid = isValidPoolName(name);
  const [loaded, setLoaded] = useState({ name: null, state: 'loading', miner: null });
  const [copied, setCopied] = useState('');

  useEffect(() => {
    if (!valid) return undefined;
    const controller = new AbortController();
    getMiner(name, { signal: controller.signal })
      .then(miner => { if (!controller.signal.aborted) setLoaded({ name, state: 'ready', miner }); })
      .catch(error => {
        if (isAbort(error) || controller.signal.aborted) return;
        setLoaded({ name, state: error?.code === 'unknown-name' ? 'unknown' : 'unavailable', miner: null });
      });
    return () => controller.abort();
  }, [name, valid, refreshKey]);

  let state = loaded.name === name ? loaded.state : 'loading';
  // Nothing to ask for a malformed name, and nothing to show without a block.
  if (!valid || (state === 'ready' && loaded.miner.blocks.length === 0)) state = 'unknown';
  const miner = state === 'ready' ? loaded.miner : null;
  const blocks = miner?.blocks ?? [];
  const best = blocks.reduce((smallest, block) => (smallest === null || block.bestHash < smallest ? block.bestHash : smallest), null);
  const sent = blocks.reduce((total, block) => total + block.proofs, 0);

  async function copyLink() {
    const { origin, pathname, search } = globalThis.location;
    try {
      await globalThis.navigator.clipboard.writeText(`${origin}${pathname}${search}${minerProfileHash(name)}`);
      setCopied('Link copied.');
    } catch {
      setCopied('Could not copy. The address bar holds the link.');
    }
  }

  return <section className="miner-profile" aria-labelledby="miner-profile-title">
    <a className="miner-profile-back" href={POOL_HASH} onClick={event => {
      if (!onBack || !plainClick(event)) return;
      event.preventDefault();
      onBack();
    }}><span aria-hidden="true">← </span>Leaderboard</a>
    <div className="miner-profile-head">
      <h3 id="miner-profile-title">{name}{ownName !== '' && ownName === name && <span className="miner-profile-you">you</span>}</h3>
      {state === 'ready' && <button type="button" className="btn btn-transparent miner-profile-copy" onClick={copyLink}>Copy link</button>}
    </div>
    {copied && <p className="miner-profile-help" role="status">{copied}</p>}
    {state === 'loading' && <p className="miner-profile-help">Loading the profile…</p>}
    {state === 'unknown' && <p>{UNKNOWN_MINER_MESSAGE}</p>}
    {state === 'unavailable' && <p className="miner-profile-note">{POOL_UNAVAILABLE_MESSAGE}</p>}
    {state === 'ready' && <>
      <dl className="miner-profile-stats">
        <div><dt>Rank · last 144 blocks</dt><dd>{formatRank(miner.rank.window)}</dd></div>
        <div><dt>Rank · all time</dt><dd>{formatRank(miner.rank.allTime)}</dd></div>
        <div><dt>Rounds</dt><dd>{formatNumber(blocks.length)}</dd></div>
        <div><dt>Blocks sent</dt><dd>{formatNumber(sent)}</dd></div>
      </dl>
      {best && <div className="miner-profile-best"><span className="miner-profile-label">Best hash</span><FullHash hash={best} /></div>}
      <h4 id="miner-profile-rounds-title" className="miner-profile-rounds-title">Rounds</h4>
      <Rounds blocks={blocks} />
    </>}
  </section>;
}
