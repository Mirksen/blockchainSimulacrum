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
        expect(page).toContain('Opt out');
        expect(page).toContain('Usage sharing');
        expect(page).toContain('PostHog');
    });
});
