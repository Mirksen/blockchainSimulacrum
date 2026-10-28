import { useId, useLayoutEffect, useRef } from 'react';
import './SettingsDialog.css';

// "Settings" dialog of the overflow menu (web/DESIGN.md, "Existing features in the
// workbench"): the experiment settings with the labels and help text of the former
// "Experiment settings" panel in App.jsx. Presentational: values come in, changes go
// out through the callbacks; the simulation hook validates and records them.
// Native <dialog> as in Modal.jsx: focus containment, Escape and focus return.

const clampBlockTime = raw => Math.min(60, Math.max(1, Number(raw) || 10));

function Dialog({ onClose, coinName, onCoinName, difficulty, onDifficulty, halvingInterval, onHalvingInterval,
  targetBlockTime, onTargetBlockTime, busy }) {
  const ref = useRef(null);
  const titleId = useId();
  const helpId = useId();
  const busyId = useId();
  useLayoutEffect(() => {
    const dialog = ref.current;
    dialog.showModal();
    // Close before React detaches the dialog so the browser restores opener focus.
    return () => dialog.close();
  }, []);
  const lockedBy = busy ? busyId : undefined;
  return (
    <dialog ref={ref} className="settings-dialog" aria-labelledby={titleId} aria-describedby={helpId}
      onCancel={event => { event.preventDefault(); event.stopPropagation(); onClose?.(); }}
      onClick={event => { if (event.target === event.currentTarget) onClose?.(); }}>
      <div className="settings-dialog-panel">
        <div className="settings-dialog-head">
          <h2 id={titleId}>Settings</h2>
          <button type="button" className="settings-dialog-close" aria-label="Close settings" onClick={() => onClose?.()}>
            <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true"><path d="M3.5 3.5l7 7M10.5 3.5l-7 7" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" /></svg>
          </button>
        </div>
        <p className="settings-dialog-intro">Experiment settings: how the simulation names its coin and mines new blocks.</p>

        <div className="settings-dialog-fields">
          <label className="settings-dialog-field">
            <span className="settings-dialog-label">Coin name</span>
            <span className="settings-dialog-control">
              <input aria-label="Coin name" value={coinName} maxLength={16} onChange={event => onCoinName?.(event.target.value)} />
              <span className="settings-dialog-unit">· virtual</span>
            </span>
          </label>
          <label className="settings-dialog-field">
            <span className="settings-dialog-label">Mining difficulty</span>
            <span className="settings-dialog-control">
              <input aria-label="Mining difficulty" type="range" min="1" max="5" step="1" value={difficulty} disabled={busy}
                aria-describedby={lockedBy} onChange={event => onDifficulty?.(Number(event.target.value))} />
              <span className="settings-dialog-unit">{difficulty} leading zeros</span>
            </span>
          </label>
          <label className="settings-dialog-field">
            <span className="settings-dialog-label">Halving interval</span>
            <span className="settings-dialog-control">
              <input aria-label="Halving interval" type="number" min="2" max="100" value={halvingInterval} disabled={busy}
                aria-describedby={lockedBy} onChange={event => onHalvingInterval?.(Number(event.target.value))} />
              <span className="settings-dialog-unit">blocks</span>
            </span>
          </label>
          <label className="settings-dialog-field">
            <span className="settings-dialog-label">Target block time</span>
            <span className="settings-dialog-control">
              <input aria-label="Target block time" type="number" min="1" max="60" value={targetBlockTime} disabled={busy}
                aria-describedby={lockedBy} onChange={event => {
                  const value = clampBlockTime(event.target.value);
                  if (value !== targetBlockTime) onTargetBlockTime?.(value);
                }} />
              <span className="settings-dialog-unit">seconds</span>
            </span>
          </label>
        </div>

        {busy && <p className="settings-dialog-busy" id={busyId} role="status">Mining is running. Difficulty, halving interval and target block time unlock when it stops.</p>}
        <p className="settings-dialog-help" id={helpId}>Higher difficulty takes longer. Difficulty adapts every 10 mined blocks. Halving reduces the reward for future blocks; it does not rewrite earlier rewards.</p>

        <div className="settings-dialog-foot">
          <button type="button" className="settings-dialog-done" onClick={() => onClose?.()}>Done</button>
        </div>
      </div>
    </dialog>
  );
}

export function SettingsDialog({ open = false, ...props }) {
  return open ? <Dialog {...props} /> : null;
}
