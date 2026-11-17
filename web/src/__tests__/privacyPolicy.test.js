import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

// The privacy policy is published as a static page next to the app. It names the
// controller; a release must never ship the placeholders.
const page = readFileSync(new URL('../../public/privacy.html', import.meta.url), 'utf8');

describe('privacy policy page', () => {
    it('has no unfilled placeholders', () => {
        expect(page.match(/\[\[[A-Z_]+\]\]/g) ?? []).toEqual([]);
    });
    it('describes the opt-out of usage sharing that the app offers', () => {
        expect(page).toContain('<strong>Opt out</strong>');
        expect(page).toContain('Usage sharing');
        expect(page).toContain('PostHog');
    });
    it('names the counted starting point and completed missions (17 November 2026)', () => {
        expect(page).toContain('last updated 17 November 2026');
        expect(page).toContain('One exception is counted in the usage statistics below: which starting point you chose and that a mission was completed.');
        expect(page).toContain('the chain reset, the starting point chosen, a mission completed)');
        expect(page).toContain('your mission progress');
        expect(page).not.toContain('completed missions');
    });
});
