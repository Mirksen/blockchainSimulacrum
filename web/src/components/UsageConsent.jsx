import { useSyncExternalStore } from 'react';
import { telemetry } from '../lib/telemetry';
import './workbench/cardKit.css';
import './UsageConsent.css';

// The first-visit usage notice (web/DESIGN.md, "Usage sharing"). Sharing is on by
// default (Mirko, 2026-11-03); one click on Opt out turns it off, OK keeps it, and
// both are saved so the notice does not return. It stays away when the build has
// no token or the browser sends a privacy signal, because then nothing is shared.
export function UsageConsent({ client = telemetry }) {
    const { configured, privacyBlocked, decided } = useSyncExternalStore(client.subscribe, client.getSnapshot);
    if (!configured || privacyBlocked || decided) return null;
    return <section className="usage-consent" aria-labelledby="usage-consent-title">
        <h2 id="usage-consent-title">This site counts usage</h2>
        <p>To improve this experiment, it sends usage counts, mining timings and sanitized technical errors to PostHog EU. No cookies, no profile, no session replay. Wallet keys, seed words, names and transaction text stay in your browser.</p>
        <p className="usage-consent-later">Opt out here or any time in the menu under Usage sharing. <a href="/privacy.html">Privacy policy</a></p>
        <div className="usage-consent-actions">
            <button type="button" className="card-kit-btn is-lg" onClick={() => client.setEnabled(false)}>Opt out</button>
            <button type="button" className="card-kit-btn is-lg" onClick={() => client.setEnabled(true)}>OK</button>
        </div>
    </section>;
}
