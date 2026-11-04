// @vitest-environment jsdom
import { StrictMode } from 'react';
import { fireEvent, render, screen, cleanup } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { UsageConsent } from '../components/UsageConsent';
import { CONSENT_KEY, createTelemetry } from '../lib/telemetry';
afterEach(cleanup);

function fixture({ saved = null, projectToken = 'phc_syntheticproject', privacy = false } = {}) {
    const values = new Map(saved === null ? [] : [[CONSENT_KEY, saved]]);
    const storage = { getItem: key => values.get(key) ?? null, setItem: vi.fn((key, value) => values.set(key, value)) };
    const request = vi.fn(async () => ({ ok: true }));
    const client = createTelemetry({ projectToken, storage, request, privacySignal: () => privacy,
        id: () => '00000000-0000-4000-8000-000000000001', now: () => Date.parse('2026-01-02T12:00:00Z') });
    client.start();
    render(<StrictMode><UsageConsent client={client} /></StrictMode>);
    return { client, storage, request };
}
const notice = () => screen.queryByRole('region', { name: 'This site counts usage' });

describe('UsageConsent (opt-out notice)', () => {
    it('shows on a first visit while sharing is already on', () => {
        const { client, request } = fixture();
        expect(notice()).toBeTruthy();
        expect(client.getSnapshot().enabled).toBe(true);
        expect(request).toHaveBeenCalledTimes(1);
        expect(screen.getByRole('link', { name: 'Privacy policy' }).getAttribute('href')).toBe('/privacy.html');
    });
    it('makes OK the one filled button with Opt out as a plain button beside it', () => {
        fixture();
        expect(screen.getByRole('button', { name: 'OK' }).className).toBe('btn-primary');
        expect(screen.getByRole('button', { name: 'Opt out' }).className).toBe('card-kit-btn is-lg');
        expect(screen.queryByRole('button', { name: 'Settings' })).toBeNull();
    });
    it('Opt out saves the no, stops sharing and closes', async () => {
        const { client, storage, request } = fixture();
        fireEvent.click(screen.getByRole('button', { name: 'Opt out' }));
        expect(storage.setItem).toHaveBeenCalledWith(CONSENT_KEY, 'false');
        expect(notice()).toBeNull();
        expect(client.getSnapshot().enabled).toBe(false);
        await client.track('chain_reset', { previous_block_count: 2 });
        expect(request).toHaveBeenCalledTimes(1);
    });
    it('OK saves the yes, keeps sharing and closes without a second app-open', () => {
        const { client, storage, request } = fixture();
        fireEvent.click(screen.getByRole('button', { name: 'OK' }));
        expect(storage.setItem).toHaveBeenCalledWith(CONSENT_KEY, 'true');
        expect(notice()).toBeNull();
        expect(client.getSnapshot().enabled).toBe(true);
        expect(request).toHaveBeenCalledTimes(1);
    });
    it.each([['true', true], ['false', false]])('stays away after a saved answer (%s)', (saved, enabled) => {
        const { client } = fixture({ saved });
        expect(notice()).toBeNull();
        expect(client.getSnapshot().enabled).toBe(enabled);
    });
    it('stays away without a token or with a browser privacy signal, which share nothing', () => {
        const { request } = fixture({ projectToken: '' });
        expect(notice()).toBeNull();
        cleanup();
        const blocked = fixture({ privacy: true });
        expect(notice()).toBeNull();
        expect(request).not.toHaveBeenCalled();
        expect(blocked.request).not.toHaveBeenCalled();
    });
});
