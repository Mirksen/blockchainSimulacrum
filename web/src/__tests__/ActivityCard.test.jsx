// @vitest-environment jsdom
import { cleanup, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { ActivityCard } from '../components/workbench/ActivityCard';

afterEach(cleanup);

const confirmed = [
  { blockIndex: 4, label: 'Coinbase → Lars', amount: 1.5625 },
  { blockIndex: 2, label: 'Lars → Minas', amount: 0.6 },
  { blockIndex: 2, label: '4 transfers', amount: '0.60 each' }
];
const blockTimes = [{ index: 4, seconds: 7.1 }, { index: 3, seconds: 8 }, { index: 2, seconds: 0.1 }, { index: 1, seconds: 12.4 }];

describe('ActivityCard', () => {
  it('lists recent confirmed transactions with block and amount', () => {
    render(<ActivityCard confirmed={confirmed} blockTimes={blockTimes} targetSeconds={10} />);
    const list = screen.getByRole('list', { name: 'Recent confirmed transactions' });
    const rows = within(list).getAllByRole('listitem');
    expect(rows).toHaveLength(3);
    expect(rows[0].textContent).toBe('#4Coinbase → Lars1.5625');
    expect(rows[1].textContent).toBe('#2Lars → Minas0.60');
    expect(rows[2].textContent).toBe('#24 transfers0.60 each');
    expect(screen.getByRole('region', { name: 'Activity' }).textContent).toContain('last 2 blocks');
  });

  it('shows block times against the target with the average', () => {
    render(<ActivityCard confirmed={confirmed} blockTimes={blockTimes} targetSeconds={10} />);
    const card = screen.getByRole('region', { name: 'Activity' });
    expect(card.textContent).toContain('avg 6.9 s · target 10 s');
    const list = screen.getByRole('list', { name: /^Block times, scale 0 to 12.4 s, target 10 s, average 6.9 s/ });
    const rows = within(list).getAllByRole('listitem');
    expect(rows.map(r => r.textContent)).toEqual(['#47.1 s', '#38.0 s', '#20.1 s', '#112.4 s (over the target)']);
    expect(rows[3].classList.contains('is-over')).toBe(true);
    expect(rows[3].querySelector('.activity-card-bar-fill').style.width).toBe('100%');
  });

  it('says what is recorded when there is nothing yet', () => {
    render(<ActivityCard confirmed={[]} blockTimes={[]} targetSeconds={10} />);
    const card = screen.getByRole('region', { name: 'Activity' });
    expect(card.textContent).toContain('No confirmed transactions yet.');
    expect(card.textContent).toContain('No blocks mined yet.');
    expect(card.textContent).toContain('target 10 s');
    expect(card.textContent).not.toContain('avg');
  });
});
