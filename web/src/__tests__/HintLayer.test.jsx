// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { HintLayer } from '../components/HintLayer';
import { HINTS, hint, term } from '../lib/hints';
import { setHelpMode } from '../lib/hints/helpMode';

beforeEach(() => vi.useFakeTimers());
afterEach(() => { vi.useRealTimers(); cleanup(); });

function Page() {
  return (
    <>
      <HintLayer />
      <button type="button" {...hint('next.back', 'Hal', false)}>Back Hal</button>
      <span {...term('block.nonce')}>Nonce</span>
      <button type="button">Plain</button>
    </>
  );
}
const backHal = () => screen.getByRole('button', { name: 'Back Hal' });

describe('HintLayer', () => {
  it('opens on mouse hover after a short delay and describes the element', () => {
    render(<Page />);
    fireEvent.pointerOver(backHal(), { pointerType: 'mouse' });
    expect(screen.queryByRole('tooltip')).toBeNull();
    act(() => { vi.advanceTimersByTime(400); });
    const bubble = screen.getByRole('tooltip');
    expect(bubble.textContent).toContain('Back Hal');
    expect(bubble.textContent).toContain('nothing is at stake');
    expect(backHal().getAttribute('aria-describedby')).toBe(bubble.id);
  });

  it('closes when the pointer leaves and removes the description', () => {
    render(<Page />);
    fireEvent.pointerOver(backHal(), { pointerType: 'mouse' });
    act(() => { vi.advanceTimersByTime(400); });
    fireEvent.pointerOut(backHal(), { pointerType: 'mouse', relatedTarget: document.body });
    expect(screen.queryByRole('tooltip')).toBeNull();
    expect(backHal().hasAttribute('aria-describedby')).toBe(false);
  });

  it('never opens on a touch tap', () => {
    render(<Page />);
    fireEvent.pointerOver(backHal(), { pointerType: 'touch' });
    act(() => { vi.advanceTimersByTime(1000); });
    expect(screen.queryByRole('tooltip')).toBeNull();
  });

  it('opens at once on keyboard focus and closes on Escape', () => {
    render(<Page />);
    act(() => { backHal().focus(); });
    expect(screen.getByRole('tooltip').textContent).toContain('Back Hal');
    fireEvent.keyDown(document.activeElement, { key: 'Escape' });
    expect(screen.queryByRole('tooltip')).toBeNull();
  });

  it('a click closes the bubble and keeps it closed until the pointer leaves', () => {
    render(<Page />);
    fireEvent.pointerOver(backHal(), { pointerType: 'mouse' });
    act(() => { vi.advanceTimersByTime(400); });
    fireEvent.pointerDown(backHal(), { pointerType: 'mouse' });
    expect(screen.queryByRole('tooltip')).toBeNull();
    fireEvent.pointerOver(backHal(), { pointerType: 'mouse' });
    act(() => { vi.advanceTimersByTime(400); });
    expect(screen.queryByRole('tooltip')).toBeNull();
  });

  it('terms carry the dotted-underline marker, controls do not', () => {
    render(<Page />);
    expect(screen.getByText('Nonce').hasAttribute('data-hint-term')).toBe(true);
    expect(backHal().hasAttribute('data-hint-term')).toBe(false);
    expect(screen.getByRole('button', { name: 'Plain' }).hasAttribute('data-hint')).toBe(false);
  });
});

describe('hints catalog', () => {
  it('throws on an unknown key, so a typo fails its component test', () => {
    expect(() => hint('no.such-hint')).toThrow(/Unknown hint/);
  });

  it('every static entry has a text of at most 320 characters', () => {
    for (const [key, entry] of Object.entries(HINTS)) {
      if (typeof entry === 'function') continue;
      expect(entry.text, key).toBeTruthy();
      expect(entry.text.length, key).toBeLessThanOrEqual(320);
    }
  });
});

describe('HintLayer on touch screens', () => {
  afterEach(() => { act(() => setHelpMode(false)); delete document.elementsFromPoint; });
  const tap = node => { fireEvent.pointerDown(node, { pointerType: 'touch' }); fireEvent.click(node); };

  it('a tap on a term opens its bubble and a second tap closes it', () => {
    render(<Page />);
    const nonce = document.querySelector('[data-hint-term]');
    tap(nonce);
    expect(screen.getByRole('tooltip').textContent).toMatch(/nonce/i);
    tap(nonce);
    expect(screen.queryByRole('tooltip')).toBeNull();
  });

  it('a tap on a term inside a control stays a plain click', () => {
    const onClick = vi.fn();
    render(<><HintLayer /><button type="button" onClick={onClick}><span {...term('block.nonce')}>Nonce</span></button></>);
    tap(screen.getByText('Nonce'));
    expect(onClick).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('tooltip')).toBeNull();
  });

  it('explain mode shows the hint under the finger instead of acting, until Done', () => {
    const onClick = vi.fn();
    render(<><HintLayer /><button type="button" onClick={onClick} {...hint('next.back', 'Hal', false)}>Back Hal</button></>);
    act(() => setHelpMode(true));
    const layer = document.querySelector('.hint-help-catch');
    document.elementsFromPoint = () => [layer, backHal(), document.body];
    tap(layer);
    expect(onClick).not.toHaveBeenCalled();
    expect(screen.getByRole('tooltip').textContent).toContain('nothing is at stake');
    tap(layer);
    expect(screen.queryByRole('tooltip')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Done' }));
    expect(document.querySelector('.hint-help-catch')).toBeNull();
    fireEvent.click(backHal());
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('a tap on the explain toggle in explain mode ends it, and so does Escape', () => {
    render(<><HintLayer /><button type="button" data-hint-help-toggle="" {...hint('menu.explain', true)}>Explain</button></>);
    act(() => setHelpMode(true));
    const layer = document.querySelector('.hint-help-catch');
    document.elementsFromPoint = () => [layer, screen.getByRole('button', { name: 'Explain' })];
    tap(layer);
    expect(document.querySelector('.hint-help-catch')).toBeNull();
    act(() => setHelpMode(true));
    fireEvent.keyDown(document.body, { key: 'Escape' });
    expect(document.querySelector('.hint-help-catch')).toBeNull();
  });
});
