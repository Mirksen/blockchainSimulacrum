// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { CopyButton } from '../components/workbench/ChainBand';

const FIRST = 'a'.repeat(64);
const SECOND = 'b'.repeat(64);

afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.useRealTimers(); });

it('discards successful feedback when the displayed text changes', async () => {
  vi.stubGlobal('navigator', { clipboard: { writeText: vi.fn().mockResolvedValue(undefined) } });
  const { rerender } = render(<CopyButton text={FIRST} />);
  await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Copy full hash' })));
  expect(screen.getByRole('button', { name: 'Copied' })).toBeTruthy();
  rerender(<CopyButton text={SECOND} />);
  expect(screen.getByRole('button', { name: 'Copy full hash' }).textContent).toBe('Copy');
});

it('ignores an old write after changing away and back to the same text', async () => {
  let finish;
  const writeText = vi.fn(() => new Promise(resolve => { finish = resolve; }));
  vi.stubGlobal('navigator', { clipboard: { writeText } });
  const { rerender } = render(<CopyButton text={FIRST} />);
  fireEvent.click(screen.getByRole('button', { name: 'Copy full hash' }));
  expect(writeText).toHaveBeenCalledExactlyOnceWith(FIRST);
  rerender(<CopyButton text={SECOND} />);
  rerender(<CopyButton text={FIRST} />);
  await act(async () => finish());
  expect(screen.getByRole('button', { name: 'Copy full hash' }).textContent).toBe('Copy');
});

it('only confirms the newest request', async () => {
  const finish = [];
  vi.stubGlobal('navigator', { clipboard: { writeText: () => new Promise(resolve => finish.push(resolve)) } });
  render(<CopyButton text={FIRST} />);
  fireEvent.click(screen.getByRole('button', { name: 'Copy full hash' }));
  fireEvent.click(screen.getByRole('button', { name: 'Copy full hash' }));
  await act(async () => finish[0]());
  expect(screen.getByRole('button', { name: 'Copy full hash' })).toBeTruthy();
  await act(async () => finish[1]());
  expect(screen.getByRole('button', { name: 'Copied' })).toBeTruthy();
});

it('gives each successful copy its full feedback interval', async () => {
  vi.useFakeTimers();
  vi.stubGlobal('navigator', { clipboard: { writeText: vi.fn().mockResolvedValue(undefined) } });
  render(<CopyButton text={FIRST} />);
  await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Copy full hash' })));
  act(() => vi.advanceTimersByTime(1000));
  await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Copied' })));
  act(() => vi.advanceTimersByTime(1000));
  expect(screen.getByRole('button', { name: 'Copied' })).toBeTruthy();
  act(() => vi.advanceTimersByTime(200));
  expect(screen.getByRole('button', { name: 'Copy full hash' })).toBeTruthy();
});

it.each([
  ['missing clipboard', {}],
  ['missing writeText', { clipboard: {} }],
  ['throwing getter', { get clipboard() { throw new Error('fixture denied'); } }],
  ['rejected write', { clipboard: { writeText: () => Promise.reject(new Error('fixture denied')) } }]
])('leaves Copy available with %s', async (_name, clipboardNavigator) => {
  vi.stubGlobal('navigator', clipboardNavigator);
  render(<CopyButton text={FIRST} />);
  await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Copy full hash' })));
  expect(screen.getByRole('button', { name: 'Copy full hash' }).textContent).toBe('Copy');
});
