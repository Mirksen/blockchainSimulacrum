// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { LowerDifficultyDialog } from '../components/workbench/LowerDifficultyDialog';

beforeEach(() => {
  // jsdom has no native dialog methods; browser checks cover the real modal.
  Object.defineProperty(HTMLDialogElement.prototype, 'showModal', { configurable: true, value() { this.open = true; } });
  Object.defineProperty(HTMLDialogElement.prototype, 'close', { configurable: true, value() { this.open = false; } });
});
afterEach(cleanup);

const open = (props = {}) => {
  const handlers = { onConfirm: vi.fn(), onCancel: vi.fn() };
  render(<LowerDifficultyDialog from={4} to={3} blockCount={12} {...handlers} {...props} />);
  return { handlers, dialog: screen.getByRole('dialog', { name: 'Lowering the difficulty starts a new chain' }) };
};

describe('LowerDifficultyDialog', () => {
  it('says what goes and why, and focuses the safe choice', () => {
    const { dialog } = open();
    expect(dialog.open).toBe(true);
    expect(dialog.textContent).toMatch(/Going from 4 to 3 leading zeros removes the 12 mined blocks/);
    expect(dialog.textContent).toMatch(/the longest chain would no longer be the one with the most work/);
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Keep chain' }));
  });

  it('confirms only through the new-chain button; Keep chain, Escape and a click outside cancel', () => {
    const { handlers, dialog } = open({ blockCount: 1 });
    expect(dialog.textContent).toMatch(/removes the 1 mined block,/);
    fireEvent.click(screen.getByRole('button', { name: 'Keep chain' }));
    fireEvent(dialog, new Event('cancel', { cancelable: true }));
    fireEvent.click(dialog);
    expect(handlers.onCancel).toHaveBeenCalledTimes(3);
    expect(handlers.onConfirm).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Start new chain at 3' }));
    expect(handlers.onConfirm).toHaveBeenCalledTimes(1);
    expect(handlers.onCancel).toHaveBeenCalledTimes(3);
  });
});
