import { useState } from 'react';
import './cardKit.css';
import './WalletsCard.css';

// Wallets card (web/DESIGN.md, "Card grid").
// wallets: [{ name, balance, isMiner?, blocksWon?, hashrate? }]  hashrate in H/s, shown for miners
// onCreateWallet(name) returns { success, error }; the error text is shown under the field.

const KNOWN_COLORS = ['lars', 'minas', 'alice', 'bob', 'chris'];
const NAME_RULE = /^[A-Za-z0-9]{2,16}$/;

const PlusIcon = () => (
  <svg width="10" height="10" viewBox="0 0 12 12" aria-hidden="true"><path d="M6 2v8M2 6h8" stroke="currentColor" strokeWidth="1.8" /></svg>
);

function Avatar({ name }) {
  const key = String(name).toLowerCase();
  const style = KNOWN_COLORS.includes(key) ? { '--av-color': `var(--${key})` } : undefined;
  return <span className={`card-kit-av${style ? '' : ' is-plain'}`} style={style} aria-hidden="true">{String(name).charAt(0).toUpperCase()}</span>;
}

function balanceText(value) {
  return typeof value === 'number' && Number.isFinite(value) ? value.toFixed(8) : String(value ?? '');
}

function CreateWalletForm({ onCreate, onCancel }) {
  const [name, setName] = useState('');
  const [error, setError] = useState('');
  const submit = event => {
    event.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) return setError('Enter a name for the wallet.');
    if (!NAME_RULE.test(trimmed)) return setError('Use 2–16 letters or digits for the wallet name.');
    const result = onCreate?.(trimmed) ?? { success: false, error: 'The wallet could not be created. Try again.' };
    if (result.success) onCancel();
    else setError(result.error || 'The wallet could not be created. Try again.');
  };
  return (
    <form className="wallets-card-create-form" onSubmit={submit} aria-label="Create wallet" noValidate>
      <div className="wallets-card-create-line">
        <label className="card-kit-sr" htmlFor="wallets-card-new-name">Wallet name</label>
        <input id="wallets-card-new-name" className="card-kit-input" placeholder="Wallet name, e.g. Dana" autoComplete="off"
          autoFocus value={name} maxLength={32}
          aria-invalid={error ? 'true' : 'false'} aria-describedby={error ? 'wallets-card-new-error' : 'wallets-card-new-hint'}
          onChange={event => { setName(event.target.value); setError(''); }}
          onKeyDown={event => { if (event.key === 'Escape') onCancel(); }} />
        <button type="submit" className="card-kit-btn">Create</button>
        <button type="button" className="card-kit-btn is-ghost" onClick={onCancel}>Cancel</button>
      </div>
      {error
        ? <p className="card-kit-error" role="alert" id="wallets-card-new-error">{error}</p>
        : <p className="card-kit-t3 wallets-card-hint" id="wallets-card-new-hint">Starts at 0. 2–16 letters or digits.</p>}
    </form>
  );
}

export function WalletsCard({ wallets = [], coinName = 'powfyicoin', onOpenWallet, onCreateWallet }) {
  const [creating, setCreating] = useState(false);
  return (
    <section className="card-kit wallets-card" aria-label="Wallets">
      <div className="card-kit-head">
        <h2 className="card-kit-title">Wallets</h2>
        <span className="card-kit-aside">{wallets.length} {wallets.length === 1 ? 'wallet' : 'wallets'} · {coinName} · virtual</span>
      </div>
      <ul className="wallets-card-list" aria-label="Wallets">
        {wallets.length === 0 && <li className="card-kit-empty">No wallets yet.<small>Create one below.</small></li>}
        {wallets.map(wallet => (
          <li key={wallet.name}>
            <button type="button" className="wallets-card-row" onClick={() => onOpenWallet?.(wallet.name)}
              aria-label={`Open ${wallet.name}, balance ${balanceText(wallet.balance)} ${coinName}`}>
              <Avatar name={wallet.name} />
              <span className="wallets-card-nm">{wallet.name}</span>
              <span className="wallets-card-role">{wallet.isMiner ? `miner · ${wallet.blocksWon ?? 0} ${(wallet.blocksWon ?? 0) === 1 ? 'block' : 'blocks'}` : ''}</span>
              <span className="wallets-card-hp">{wallet.isMiner && wallet.hashrate != null ? `${Math.round(wallet.hashrate).toLocaleString('en-US')} H/s` : ''}</span>
              <span className="wallets-card-bal">{balanceText(wallet.balance)}</span>
            </button>
          </li>
        ))}
      </ul>
      <div className="wallets-card-create">
        {creating ? (
          <CreateWalletForm onCreate={onCreateWallet} onCancel={() => setCreating(false)} />
        ) : (
          <button type="button" className="wallets-card-row is-create" onClick={() => setCreating(true)}>
            <span className="card-kit-av wallets-card-plus" aria-hidden="true"><PlusIcon /></span>
            <span className="wallets-card-nm">Create wallet</span>
            <span className="wallets-card-role" />
            <span className="wallets-card-hp" />
            <span className="wallets-card-bal">starts at 0</span>
          </button>
        )}
      </div>
    </section>
  );
}
