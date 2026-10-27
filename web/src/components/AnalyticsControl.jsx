import { useSyncExternalStore } from 'react';
import { telemetry } from '../lib/telemetry';

export function AnalyticsControl({ client = telemetry }) {
    const { configured, enabled, privacyBlocked } = useSyncExternalStore(client.subscribe, client.getSnapshot);
    return <details className="analytics-control">
        <summary>Usage sharing: {enabled ? 'on' : 'off'}</summary>
        <div>
            <p>Help improve this experiment by sharing usage counts, mining timings and sanitized technical errors with PostHog EU.</p>
            <p>Wallet keys, seed words, transaction text and entered names stay in your browser. Session replay is off. Your choice is saved on this device.</p>
            <label><input type="checkbox" checked={enabled} disabled={!configured || privacyBlocked} onChange={event => client.setEnabled(event.target.checked)} /> Share usage and technical errors</label>
            {!configured && <p>Usage sharing is unavailable in this build.</p>}
            {privacyBlocked && <p>Your browser privacy signal keeps sharing off.</p>}
        </div>
    </details>;
}
