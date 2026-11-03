import { useSyncExternalStore } from 'react';
import { telemetry } from '../lib/telemetry';

export function AnalyticsControl({ client = telemetry }) {
    const { configured, enabled, privacyBlocked } = useSyncExternalStore(client.subscribe, client.getSnapshot);
    return <details className="analytics-control">
        <summary>Usage sharing: {enabled ? 'on' : 'off'}</summary>
        <div>
            <p>Usage counts, mining timings and sanitized technical errors go to PostHog EU and help improve this experiment. Sharing is on unless you opt out here.</p>
            <p>Wallet keys, seed words, transaction text and entered names stay in your browser. No cookies, no session replay. Your choice is saved on this device. <a href="/privacy.html">Privacy policy</a></p>
            <label><input type="checkbox" checked={enabled} disabled={!configured || privacyBlocked} onChange={event => client.setEnabled(event.target.checked)} /> Share usage and technical errors</label>
            {!configured && <p>Usage sharing is unavailable in this build.</p>}
            {privacyBlocked && <p>Your browser privacy signal keeps sharing off.</p>}
        </div>
    </details>;
}
