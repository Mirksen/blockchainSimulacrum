/* @vitest-environment jsdom */
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { NodeViews } from '../components/NodeViews';

afterEach(cleanup);

const button = name => screen.getByRole('button', { name, exact: true });
const node = number => within(screen.getByRole('article', { name: `Node ${number}`, exact: true }));
const hasTip = (number, block) => expect(node(number).getByText(`Block ${block}`, { exact: true })).toBeTruthy();

describe('NodeViews', () => {
  it('keeps each first-seen tip in a tie and converges as more valid work reaches both nodes', () => {
    render(<NodeViews />);
    hasTip(1, 2);
    hasTip(2, 2);

    fireEvent.click(button('Deliver competing blocks'));
    expect(node(1).getByText('3A, then 3B')).toBeTruthy();
    expect(node(2).getByText('3B, then 3A')).toBeTruthy();
    expect(node(1).getAllByText('48 work units')).toHaveLength(2);
    expect(node(2).getAllByText('48 work units')).toHaveLength(2);
    hasTip(1, '3A');
    hasTip(2, '3B');

    fireEvent.click(button('Deliver block 4A to Node 1'));
    expect(node(1).getByText('64 work units')).toBeTruthy();
    expect(node(2).queryByText('64 work units')).toBeNull();
    hasTip(1, '4A');
    hasTip(2, '3B');

    fireEvent.click(button('Deliver block 4A to Node 2'));
    expect(node(2).getByText('64 work units')).toBeTruthy();
    hasTip(1, '4A');
    hasTip(2, '4A');
    expect(screen.getByRole('status').textContent).toContain('Both nodes select the same tip.');

    fireEvent.click(button('Replay example'));
    hasTip(1, 2);
    hasTip(2, 2);
    expect(node(1).getByText('Waiting for blocks')).toBeTruthy();
    fireEvent.click(button('Deliver competing blocks'));
    hasTip(1, '3A');
    hasTip(2, '3B');
  });

  it('resets mid-example and returns focus to the delivery button', () => {
    render(<NodeViews />);
    fireEvent.click(button('Deliver competing blocks'));
    button('Reset node views').focus();
    fireEvent.click(button('Reset node views'));
    expect(document.activeElement).toBe(button('Deliver competing blocks'));
    hasTip(1, 2);
    hasTip(2, 2);
  });
});
