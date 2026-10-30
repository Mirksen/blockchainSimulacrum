// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SettingsDialog } from '../components/workbench/SettingsDialog';

beforeEach(() => {
  // jsdom has no native dialog methods; browser checks cover the real modal.
  Object.defineProperty(HTMLDialogElement.prototype, 'showModal', { configurable: true, value() { this.open = true; } });
  Object.defineProperty(HTMLDialogElement.prototype, 'close', { configurable: true, value() { this.open = false; } });
});
afterEach(cleanup);

const renderDialog = (props = {}) => {
  const handlers = {
    onClose: vi.fn(), onCoinName: vi.fn(), onDifficulty: vi.fn(), onHalvingInterval: vi.fn(), onTargetBlockTime: vi.fn(),
  };
  render(<SettingsDialog open coinName="testCoin" difficulty={2} halvingInterval={10} targetBlockTime={10} busy={false}
    {...handlers} {...props} />);
  return handlers;
};

describe('SettingsDialog', () => {
  it('renders nothing while closed', () => {
    const { container } = render(<SettingsDialog open={false} coinName="testCoin" difficulty={2} halvingInterval={10} targetBlockTime={10} />);
    expect(container.innerHTML).toBe('');
  });

  it('shows the experiment settings with their labels, units and help text', () => {
    renderDialog();
    expect(screen.getByRole('dialog', { name: 'Settings' })).toBeTruthy();
    expect(screen.getByLabelText('Coin name').value).toBe('testCoin');
    expect(screen.getByLabelText('Mining difficulty').value).toBe('2');
    expect(screen.getByLabelText('Halving interval').value).toBe('10');
    expect(screen.getByLabelText('Target block time').value).toBe('10');
    expect(screen.getByText('2 leading zeros')).toBeTruthy();
    expect(screen.getByText('blocks')).toBeTruthy();
    expect(screen.getByText('seconds')).toBeTruthy();
    expect(screen.getByText(/Difficulty adapts every 10 mined blocks/)).toBeTruthy();
  });

  it('allows ten leading zeros and explains how to stop expensive mining', () => {
    const handlers = renderDialog({ difficulty: 10 });
    const slider = screen.getByLabelText('Mining difficulty');
    expect(slider.min).toBe('1');
    expect(slider.max).toBe('10');
    expect(slider.value).toBe('10');
    expect(screen.getByText('10 leading zeros')).toBeTruthy();
    expect(screen.getByText(/Pause stops mining/)).toBeTruthy();
    fireEvent.change(slider, { target: { value: '9' } });
    expect(handlers.onDifficulty).toHaveBeenCalledWith(9);
  });

  it('hands every change to its callback', () => {
    const handlers = renderDialog();
    fireEvent.change(screen.getByLabelText('Coin name'), { target: { value: 'labCoin' } });
    expect(handlers.onCoinName).toHaveBeenCalledWith('labCoin');
    fireEvent.change(screen.getByLabelText('Mining difficulty'), { target: { value: '3' } });
    expect(handlers.onDifficulty).toHaveBeenCalledWith(3);
    fireEvent.change(screen.getByLabelText('Halving interval'), { target: { value: '20' } });
    expect(handlers.onHalvingInterval).toHaveBeenCalledWith(20);
    fireEvent.change(screen.getByLabelText('Target block time'), { target: { value: '15' } });
    expect(handlers.onTargetBlockTime).toHaveBeenCalledWith(15);
    fireEvent.change(screen.getByLabelText('Target block time'), { target: { value: '90' } });
    expect(handlers.onTargetBlockTime).toHaveBeenLastCalledWith(60);
  });

  it('locks the mining settings while busy and keeps the coin name editable', () => {
    renderDialog({ busy: true });
    expect(screen.getByLabelText('Mining difficulty').disabled).toBe(true);
    expect(screen.getByLabelText('Halving interval').disabled).toBe(true);
    expect(screen.getByLabelText('Target block time').disabled).toBe(true);
    expect(screen.getByLabelText('Coin name').disabled).toBe(false);
    expect(screen.getByRole('status').textContent).toMatch(/unlock when it stops/);
  });

  it('closes through Done, the close button and Escape', () => {
    const { onClose } = renderDialog();
    fireEvent.click(screen.getByRole('button', { name: 'Done' }));
    fireEvent.click(screen.getByRole('button', { name: 'Close settings' }));
    fireEvent(screen.getByRole('dialog'), new Event('cancel', { cancelable: true }));
    expect(onClose).toHaveBeenCalledTimes(3);
  });
});
