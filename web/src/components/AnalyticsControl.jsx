import { useSyncExternalStore } from 'react';
import { telemetry } from '../lib/telemetry';
import { hint } from '../lib/hints';

export function AnalyticsControl({ client = telemetry }) {
    const { configured, enabled, privacyBlocked } = useSyncExternalStore(client.subscribe, client.getSnapshot);
    return <details className="analytics-control">
        <summary {...hint('usage.toggle')}>Usage sharing: {enabled ? 'on' : 'off'}</summary>
        <div>
            <p>When sharing is on, we send usage counts, mining times and technical error reports to PostHog EU.</p>
            <p>The reports exclude wallet keys, seed words, names and transaction text. We use no cookies or session replay. This browser remembers your choice. <a href="/privacy.html">Privacy policy</a></p>
            <label {...hint('usage.share')}><input type="checkbox" checked={enabled} disabled={!configured || privacyBlocked} onChange={event => client.setEnabled(event.target.checked)} /> Share usage and technical errors</label>
            {!configured && <p>Usage sharing is unavailable in this build.</p>}
            {privacyBlocked && <p>Your browser privacy signal keeps sharing off.</p>}
        </div>
    </details>;
}
