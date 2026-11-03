import { useId, useLayoutEffect, useRef } from 'react';
import './SettingsDialog.css';
import './LowerDifficultyDialog.css';

// Confirmation before a manual lowering of the difficulty (ADR 0004): it starts a new
// chain, so a chain of easier blocks never outgrows one that took more work. Native
// <dialog> as in SettingsDialog.jsx; it may open on top of Settings. Escape, a click
// outside and "Keep chain" all cancel; the safe choice has the focus.
export function LowerDifficultyDialog({ from, to, blockCount, onConfirm, onCancel }) {
  const ref = useRef(null);
  const keep = useRef(null);
  const titleId = useId();
  const textId = useId();
  useLayoutEffect(() => {
    const dialog = ref.current;
    dialog.showModal();
    keep.current.focus(); // after showModal: React's autoFocus would run before the dialog opens
    return () => dialog.close();
  }, []);
  const blocks = blockCount === 1 ? '1 mined block' : `${blockCount} mined blocks`;
  return (
    <dialog ref={ref} className="settings-dialog lower-difficulty" aria-labelledby={titleId} aria-describedby={textId}
      onCancel={event => { event.preventDefault(); event.stopPropagation(); onCancel?.(); }}
      onClick={event => { if (event.target === event.currentTarget) onCancel?.(); }}>
      <div className="settings-dialog-panel">
        <div className="settings-dialog-head">
          <h2 id={titleId}>Lowering the difficulty starts a new chain</h2>
        </div>
        <div id={textId} className="lower-difficulty-text">
          <p>Going from {from} to {to} leading zeros removes the {blocks}, their transactions and any wallets or miners
            you added. The simulator starts again from the genesis block at difficulty {to}; your other settings stay.</p>
          <p>Why: blocks at a lower difficulty take less work. Without a new chain, easy blocks could make a chain longer
            than one that took more work, and the longest chain would no longer be the one with the most work.</p>
        </div>
        <div className="settings-dialog-foot lower-difficulty-foot">
          <button type="button" className="settings-dialog-done" ref={keep} onClick={() => onCancel?.()}>Keep chain</button>
          <button type="button" className="lower-difficulty-confirm" onClick={() => onConfirm?.()}>Start new chain at {to}</button>
        </div>
      </div>
    </dialog>
  );
}
