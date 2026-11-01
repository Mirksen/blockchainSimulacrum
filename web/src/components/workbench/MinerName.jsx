import { NAME_HINT, NAME_UNAVAILABLE_MESSAGE } from '../../lib/poolApi';
import './MinerName.css';

// The visitor's name at the top of the Next block card (web/DESIGN.md, "Miner name"): it
// signs every block this browser mines and sends each one to the leaderboard. A visitor
// starts with a generated name; the field glows until they choose their own.
const OFFLINE = 'The leaderboard server is unavailable right now. Your blocks stay in your chain.';

const rankOf = (rows, name) => {
  const index = rows?.findIndex(row => row.name === name) ?? -1;
  return index < 0 ? null : index + 1;
};
const zeros = count => `${count} ${count === 1 ? 'zero' : 'zeros'}`;

// One line that says what happens to the next block, or what became of the last one.
function statusOf({ generated, valid, pool, entry }, rank) {
  if (!valid) return { text: NAME_HINT, problem: true };
  if (pool === 'refused') return { text: NAME_UNAVAILABLE_MESSAGE, problem: true };
  if (pool === 'offline') return { text: OFFLINE, problem: true };
  if (pool !== 'ready') return { text: 'Connecting to the leaderboard…' };
  if (entry?.state === 'sending') return { text: `Sending block #${entry.height} to the leaderboard…` };
  if (entry?.state === 'failed') return { text: `Block #${entry.height} did not reach the leaderboard. ${entry.message ?? ''}`.trim(), problem: true };
  if (entry?.state === 'accepted') {
    return { text: `Block #${entry.height} is on the leaderboard: ${zeros(entry.zeros)}${rank ? ` · rank #${rank}` : ''}.`, done: true };
  }
  if (generated) return { text: 'Every block you mine lands on the leaderboard under this name. Make it yours.' };
  return { text: `Every block you mine now carries this name${rank ? ` · rank #${rank}` : ''}.`, done: true };
}

export function MinerName({ identity, rows, locked = false }) {
  const { name, signingName, fallback, generated, setName, valid } = identity;
  const status = statusOf(identity, rankOf(rows, signingName));
  const problem = Boolean(status.problem);
  return (
    <div className={`miner-name${generated ? ' is-generated' : ''}`}>
      <label className="miner-name-label" htmlFor="miner-name-input">Your miner name</label>
      <input id="miner-name-input" className="miner-name-input" value={name} maxLength={20} placeholder={fallback}
        autoComplete="nickname" spellCheck={false} disabled={locked} title={locked ? 'Locked while a block is being mined' : undefined}
        onChange={event => setName(event.target.value)} onBlur={() => { if (name === '') setName(fallback); }}
        onFocus={event => { if (generated) event.target.select(); }} aria-invalid={valid ? undefined : 'true'}
        aria-describedby="miner-name-status" />
      <p id="miner-name-status" className={`miner-name-status${problem ? ' is-problem' : status.done ? ' is-done' : ''}`} role="status">{status.text}</p>
    </div>
  );
}
