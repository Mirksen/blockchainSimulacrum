import { useState, useSyncExternalStore } from 'react';
import { telemetry } from '../lib/telemetry';
import './workbench/cardKit.css';
import './UsageConsent.css';

// The first-visit usage notice (web/DESIGN.md, "Usage sharing"). Sharing is on by
// default (Mirko, 2026-11-03). OK is the one filled button; opting out takes a
// second step on purpose (Mirko, 2026-11-04): Settings opens a switch, and only
// Save choice with the switch off stores the no. Every answer is saved, so the
// notice does not return. It stays away when the build has no token or the
// browser sends a privacy signal, because then nothing is shared.
export function UsageConsent({ client = telemetry }) {
    const { configured, privacyBlocked, decided } = useSyncExternalStore(client.subscribe, client.getSnapshot);
    const [settings, setSettings] = useState(false);
    const [share, setShare] = useState(true);
    if (!configured || privacyBlocked || decided) return null;
    return <section className="usage-consent" aria-labelledby="usage-consent-title">
        <h2 id="usage-consent-title">This site counts usage</h2>
        <p>To improve this experiment, it sends usage counts, mining timings and sanitized technical errors to PostHog EU. No cookies, no profile, no session replay. Wallet keys, seed words, names and transaction text stay in your browser.</p>
        {settings ? <div className="usage-consent-settings">
            <label className="usage-consent-switch">
                <input type="checkbox" checked={share} onChange={event => setShare(event.target.checked)} />
                <span>Share usage counts</span>
            </label>
            <p className="usage-consent-later">Sharing helps improve the experiment. You can change this any time in the menu under Usage sharing. <a href="/privacy.html">Privacy policy</a></p>
            <div className="usage-consent-actions">
                <button type="button" className="card-kit-btn is-ghost is-sm" onClick={() => setSettings(false)}>Back</button>
                <button type="button" className="card-kit-btn is-sm" onClick={() => client.setEnabled(share)}>Save choice</button>
            </div>
        </div> : <>
            <p className="usage-consent-later">You can change this under Settings or any time in the menu under Usage sharing. <a href="/privacy.html">Privacy policy</a></p>
            <div className="usage-consent-actions">
                <button type="button" className="card-kit-btn is-ghost is-sm" onClick={() => setSettings(true)}>Settings</button>
                <button type="button" className="btn-primary" onClick={() => client.setEnabled(true)}>OK</button>
            </div>
        </>}
    </section>;
}
