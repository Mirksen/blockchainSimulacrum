import { useId, useState } from 'react';
import './cardKit.css';
import './CreateNameForm.css';

// The inline form behind "Create wallet" and "Create miner": one name, checked here
// against the shared rule, then by `onCreate(name)` -> { success, error }.
// noun: 'wallet' | 'miner'; label: the field's accessible name; hint: the quiet line under the field.

const NAME_RULE = /^[A-Za-z0-9]{2,16}$/;

export function CreateNameForm({ noun, label, placeholder, hint, onCreate, onCancel }) {
  const id = useId();
  const [name, setName] = useState('');
  const [error, setError] = useState('');
  const failed = `The ${noun} could not be created. Try again.`;
  const submit = event => {
    event.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) return setError(`Enter a name for the ${noun}.`);
    if (!NAME_RULE.test(trimmed)) return setError(`Use 2–16 letters or digits for the ${noun} name.`);
    const result = onCreate?.(trimmed) ?? { success: false, error: failed };
    if (result.success) onCancel();
    else setError(result.error || failed);
  };
  return (
    <form className="create-name-form" onSubmit={submit} aria-label={`Create ${noun}`} noValidate>
      <div className="create-name-form-line">
        <label className="card-kit-sr" htmlFor={`${id}-name`}>{label}</label>
        <input id={`${id}-name`} className="card-kit-input" placeholder={placeholder} autoComplete="off"
          autoFocus value={name} maxLength={32}
          aria-invalid={error ? 'true' : 'false'} aria-describedby={`${id}-${error ? 'error' : 'hint'}`}
          onChange={event => { setName(event.target.value); setError(''); }}
          onKeyDown={event => { if (event.key === 'Escape') onCancel(); }} />
        <button type="submit" className="card-kit-btn">Create</button>
        <button type="button" className="card-kit-btn is-ghost" onClick={onCancel}>Cancel</button>
      </div>
      {error
        ? <p className="card-kit-error" role="alert" id={`${id}-error`}>{error}</p>
        : <p className="card-kit-t3 create-name-form-hint" id={`${id}-hint`}>{hint}</p>}
    </form>
  );
}
