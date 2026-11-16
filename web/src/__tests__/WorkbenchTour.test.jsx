// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { WorkbenchTour } from '../components/workbench/WorkbenchTour';

afterEach(cleanup);

const ALL = ['chain', 'block', 'next', 'mempool', 'wallets'];
// Stand-ins for the workbench regions, each with a control of its own.
function Regions({ ids = ALL }) {
  return ids.map(id => <section key={id} data-tour={id} aria-label={`${id} region`}><button type="button">{id} action</button></section>);
}
const renderTour = ({ ids, tone = 'technical' } = {}) => {
  const onEnd = vi.fn();
  render(<><Regions ids={ids} /><WorkbenchTour tone={tone} onEnd={onEnd} /></>);
  return { onEnd };
};
const card = () => screen.getByRole('dialog');
const count = () => within(card()).getByText(/^Stop \d+ of \d+$/).textContent;
const ring = () => document.querySelector('.workbench-tour-ring');
const press = name => fireEvent.click(within(card()).getByRole('button', { name }));

describe('WorkbenchTour', () => {
  it('walks the five regions in order and ends with Done', () => {
    const { onEnd } = renderTour();
    const seen = [];
    for (let stop = 1; stop <= 5; stop++) {
      expect(count()).toBe(`Stop ${stop} of 5`);
      seen.push([card().getAttribute('data-tour-stop'), ring().getAttribute('data-tour-ring')]);
      // Focus moves to the card on each stop.
      expect(document.activeElement).toBe(card());
      if (stop < 5) press('Next');
    }
    expect(seen).toEqual(ALL.map(id => [id, id]));
    expect(within(card()).queryByRole('button', { name: 'Next' })).toBeNull();
    expect(onEnd).not.toHaveBeenCalled();
    press('Done');
    expect(onEnd).toHaveBeenCalledTimes(1);
    expect(onEnd).toHaveBeenCalledWith('done');
  });

  it('is a non-modal dialog named by its title, with the count in text', () => {
    renderTour({ tone: 'plain' });
    expect(card().getAttribute('aria-modal')).toBe('false');
    expect(screen.getByRole('dialog', { name: 'The notebook' })).toBe(card());
    const described = card().getAttribute('aria-describedby').split(' ').map(id => document.getElementById(id).textContent);
    expect(described[0]).toBe('Stop 1 of 5');
    expect(described[1]).toMatch(/^Every tile is a page/);
    expect(ring().getAttribute('aria-hidden')).toBe('true');
  });

  it('speaks in the tone it is given', () => {
    renderTour({ tone: 'plain' });
    const plain = [];
    for (let stop = 0; stop < 5; stop++) {
      plain.push(within(card()).getByRole('heading').textContent);
      press(stop < 4 ? 'Next' : 'Done');
    }
    expect(plain).toEqual(['The notebook', 'One page, opened', 'The draw', 'The waiting room', 'Who owns what']);
    cleanup();
    renderTour({ tone: 'technical' });
    expect(within(card()).getByRole('heading').textContent).toBe('The chain');
  });

  it('skips the tour with Skip tour', () => {
    const { onEnd } = renderTour();
    press('Next');
    press('Skip tour');
    expect(onEnd).toHaveBeenCalledWith('skip');
  });

  it('skips the tour with Escape, also from the page, but not from an open dialog', () => {
    const { onEnd } = renderTour();
    const dialog = document.createElement('dialog');
    dialog.setAttribute('open', '');
    const field = document.createElement('input');
    dialog.append(field);
    document.body.append(dialog);
    fireEvent.keyDown(field, { key: 'Escape' });
    expect(onEnd).not.toHaveBeenCalled();
    dialog.remove();
    fireEvent.keyDown(screen.getByRole('button', { name: 'block action' }), { key: 'Escape' });
    expect(onEnd).toHaveBeenCalledWith('skip');
  });

  it('leaves the page usable: no region control is disabled or hidden', () => {
    renderTour();
    for (const id of ALL) {
      const button = screen.getByRole('button', { name: `${id} action` });
      expect(button.disabled).toBe(false);
      expect(button.closest('[aria-hidden="true"], [inert]')).toBeNull();
    }
  });

  it('skips a missing region without breaking the count or the order', () => {
    const { onEnd } = renderTour({ ids: ['chain', 'block', 'next', 'wallets'] });
    const stops = [];
    for (let stop = 1; stop <= 4; stop++) {
      expect(count()).toBe(`Stop ${stop} of 4`);
      stops.push(card().getAttribute('data-tour-stop'));
      press(stop < 4 ? 'Next' : 'Done');
    }
    expect(stops).toEqual(['chain', 'block', 'next', 'wallets']);
    expect(onEnd).toHaveBeenCalledWith('done');
  });

  it('starts at the first region that is there', () => {
    renderTour({ ids: ['next', 'wallets'] });
    expect(card().getAttribute('data-tour-stop')).toBe('next');
    expect(count()).toBe('Stop 1 of 2');
  });

  it('ends when no region is there', () => {
    const { onEnd } = renderTour({ ids: [] });
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(onEnd).toHaveBeenCalledWith('empty');
  });
});
