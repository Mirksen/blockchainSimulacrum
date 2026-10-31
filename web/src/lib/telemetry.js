import { MIN_DIFFICULTY, MAX_DIFFICULTY } from './difficulty';

// PostHog's public Capture API: no autocapture, replay, remote scripts or retry queue.
// https://posthog.com/docs/api/capture
export const INGEST_URL = 'https://eu.i.posthog.com/i/v0/e/';
export const CONSENT_KEY = 'pow.analytics.enabled';
const count = value => Number.isSafeInteger(value) && value >= 0;
const difficulty = value => Number.isInteger(value) && value >= MIN_DIFFICULTY && value <= MAX_DIFFICULTY;
const oneOf = (...values) => value => values.includes(value);
const source = oneOf('manual', 'auto', 'demo', 'random');
const reason = oneOf('busy', 'invalid_amount', 'invalid_fee', 'same_wallet', 'wallet_not_found', 'insufficient_funds', 'invalid_reference', 'no_miners', 'no_transactions', 'cancelled', 'invalid_state', 'reward_too_small', 'unexpected');
const metrics = { difficulty, elapsed_ms: count, attempt_count: count, miner_count: count, transaction_count: count };
const SCHEMAS = {
    app_opened: {},
    demo_started: { difficulty },
    demo_completed: { difficulty, block_count: count },
    demo_failed: { reason },
    demo_cancelled: {},
    transaction_created: { source, count, pending_count: count },
    transaction_rejected: { source, reason },
    mining_started: { difficulty, miner_count: count, transaction_count: count },
    mining_completed: { ...metrics, block_height: count },
    mining_cancelled: { ...metrics, reason: oneOf('user_stop', 'reset', 'unmount') },
    mining_failed: { ...metrics, reason },
    difficulty_changed: { previous: difficulty, value: difficulty },
    settings_changed: {
        setting: oneOf('halving_interval', 'target_block_time', 'hashpower', 'miner_enabled', 'theme', 'sound', 'coin_label'),
        value: value => typeof value === 'boolean' || (count(value) && value <= 100) || value === 'light' || value === 'dark'
    },
    tamper_applied: { block_height: count },
    chain_reset: { previous_block_count: count }
};
const ERROR_TYPES = ['Error', 'TypeError', 'RangeError', 'ReferenceError', 'SyntaxError', 'URIError', 'EvalError', 'AggregateError'];
const ERROR_SOURCES = ['window', 'promise', 'react', 'mining', 'demo'];

export function failureCode(error) {
    const message = typeof error?.message === 'string' ? error.message : '';
    if (message.startsWith('Amount must')) return 'invalid_amount';
    if (message.startsWith('Fee must')) return 'invalid_fee';
    if (message.startsWith('Sender and recipient must')) return 'same_wallet';
    if (message.startsWith('Sender or recipient not found')) return 'wallet_not_found';
    if (message.startsWith('Insufficient funds')) return 'insufficient_funds';
    if (message.startsWith('Reference must')) return 'invalid_reference';
    return 'unexpected';
}
function readStorage(storage) {
    try { return storage?.getItem(CONSENT_KEY) === 'true'; } catch { return false; }
}
function browserStorage() {
    try { return globalThis.localStorage; } catch { return undefined; }
}
function safeException(error, origin, assets) {
    const type = ERROR_TYPES.includes(error?.name) ? error.name : 'Error';
    const frames = [];
    const stack = typeof error?.stack === 'string' ? error.stack.slice(0, 8000) : '';
    for (const line of stack.split('\n').slice(1, 16)) {
        const match = line.match(/([^\s()]+):(\d+):(\d+)\)?$/);
        if (!match) continue;
        try {
            const url = new URL(match[1], origin);
            // Only actual loaded app assets, with no query, host, function names
            // or original exception message, may leave the browser.
            if (url.origin !== origin || !assets.includes(url.pathname)) continue;
            frames.push({ platform: 'custom', lang: 'javascript', function: '<app>', filename: url.pathname, lineno: Number(match[2]), colno: Number(match[3]), in_app: true });
        } catch { /* Unknown stack format is omitted. */ }
    }
    return { type, value: 'Unexpected application error', mechanism: { handled: false, synthetic: false }, stacktrace: { type: 'raw', frames } };
}

export function createTelemetry({
    projectToken = '', storage = browserStorage(), request = (...args) => globalThis.fetch(...args),
    online = () => globalThis.navigator?.onLine !== false,
    privacySignal = () => globalThis.navigator?.doNotTrack === '1' || globalThis.navigator?.globalPrivacyControl === true,
    id = () => globalThis.crypto.randomUUID(), now = () => Date.now(), timeoutMs = 5000,
    origin = globalThis.location?.origin || 'https://proofofwork.fyi',
    assets = Array.from(globalThis.document?.scripts || []).flatMap(script => {
        try { const url = new URL(script.src); return url.origin === globalThis.location.origin && url.pathname.startsWith('/assets/') ? [url.pathname] : []; } catch { return []; }
    })
} = {}) {
    // Only a public ingestion token is valid here. No personal/project secret keys.
    const configured = /^phc_[A-Za-z0-9]+$/.test(projectToken);
    let consent = readStorage(storage), visitor, started = false;
    const pending = new Set(), listeners = new Set(), seenErrors = new WeakSet();
    const allowed = () => configured && consent && !privacySignal();
    let view = Object.freeze({ configured, enabled: allowed(), privacyBlocked: privacySignal() });
    const refreshView = () => {
        const next = { configured, enabled: allowed(), privacyBlocked: privacySignal() };
        if (next.enabled === view.enabled && next.privacyBlocked === view.privacyBlocked) return;
        view = Object.freeze(next);
        for (const listener of listeners) listener();
    };
    const stop = () => {
        for (const controller of pending) controller.abort();
        pending.clear();
        visitor = undefined;
    };
    async function send(event, properties) {
        let controller, timer;
        try {
            if (!allowed() || !online()) return false;
            controller = new AbortController();
            visitor ||= id();
            const payload = {
                api_key: projectToken, event, distinct_id: visitor,
                properties: { ...properties, event_id: id(), app: 'proofofwork.fyi', schema_version: 1, $process_person_profile: false, $geoip_disable: true },
                timestamp: new Date(now()).toISOString()
            };
            pending.add(controller);
            timer = setTimeout(() => controller.abort(), timeoutMs);
            const response = await request(INGEST_URL, {
                method: 'POST', mode: 'cors', credentials: 'omit', referrerPolicy: 'no-referrer', cache: 'no-store', keepalive: false,
                headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload), signal: controller.signal
            });
            return response.ok;
        } catch { return false; } // Telemetry never changes simulation behavior.
        finally { clearTimeout(timer); if (controller) pending.delete(controller); }
    }
    const track = (event, properties = {}) => {
        try {
            if (!Object.hasOwn(SCHEMAS, event)) return Promise.resolve(false);
            const safe = {};
            for (const [key, validate] of Object.entries(SCHEMAS[event])) {
                if (validate(properties[key])) safe[key] = properties[key];
            }
            return send(event, safe);
        } catch { return Promise.resolve(false); }
    };
    const setEnabled = (value, persist = true) => {
        const previous = allowed();
        consent = value === true;
        if (persist) { try { storage?.setItem(CONSENT_KEY, String(consent)); } catch { /* Memory-only preference still works. */ } }
        if (!allowed()) stop();
        refreshView();
        if (!previous && allowed() && started) void track('app_opened');
    };
    return {
        track,
        start() { if (started) return; started = true; if (allowed()) void track('app_opened'); },
        setEnabled,
        synchronize() { setEnabled(readStorage(storage), false); },
        getSnapshot: () => view,
        subscribe(listener) { listeners.add(listener); return () => listeners.delete(listener); },
        reportError(error, source = 'window', handled = false) {
            try {
                if (!allowed() || !online() || !ERROR_SOURCES.includes(source)) return Promise.resolve(false);
                if (error && typeof error === 'object') { if (seenErrors.has(error)) return Promise.resolve(false); seenErrors.add(error); }
                const exception = safeException(error, origin, assets);
                exception.mechanism.handled = handled;
                return send('$exception', { source, $exception_list: [exception] });
            } catch { return Promise.resolve(false); }
        }
    };
}

export const telemetry = createTelemetry({ projectToken: import.meta.env.VITE_POSTHOG_PROJECT_TOKEN || '' });
export function installErrorTracking(target = globalThis.window, client = telemetry) {
    const onError = event => { void client.reportError(event.error, 'window'); };
    const onRejection = event => { void client.reportError(event.reason, 'promise'); };
    const onStorage = event => { if (event.key === CONSENT_KEY || event.key === null) client.synchronize(); };
    target.addEventListener('error', onError);
    target.addEventListener('unhandledrejection', onRejection);
    target.addEventListener('storage', onStorage);
    return () => { target.removeEventListener('error', onError); target.removeEventListener('unhandledrejection', onRejection); target.removeEventListener('storage', onStorage); };
}
