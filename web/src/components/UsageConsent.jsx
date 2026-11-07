import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { telemetry } from '../lib/telemetry';
import './workbench/cardKit.css';
import './UsageConsent.css';

// The first-visit usage notice (web/DESIGN.md, "Usage sharing"). Sharing is on by
// default (Mirko, 2026-11-03). OK is the one filled button and Opt out a plain
// button right beside it (Mirko, 2026-11-04): OK is the suggested answer, opting
// out stays one click. Both answers are saved, so the notice does not return. It
// stays away when the build has no token or the browser sends a privacy signal,
// because then nothing is shared.
export function UsageConsent({ client = telemetry }) {
    const { configured, privacyBlocked, decided } = useSyncExternalStore(client.subscribe, client.getSnapshot);
    const notice = useRef(null);
    const [atTop, setAtTop] = useState(false);
    const visible = configured && !privacyBlocked && !decided;
    useEffect(() => {
        if (!visible) return;
        let frame;
        const keepFocusVisible = () => {
            cancelAnimationFrame(frame);
            frame = requestAnimationFrame(() => {
                const target = document.activeElement, card = notice.current;
                if (!card || !target?.matches('button, input, textarea, select, a[href], [tabindex]:not([tabindex="-1"])') || card.contains(target)) return;
                const focus = target.getBoundingClientRect(), overlay = card.getBoundingClientRect();
                if (focus.left < overlay.right && focus.right > overlay.left && focus.top < overlay.bottom && focus.bottom > overlay.top) {
                    const gap = parseFloat(getComputedStyle(card).left);
                    const overlapAt = top => Math.max(0, Math.min(focus.bottom, top + overlay.height) - Math.max(focus.top, top));
                    // Pick the clearer edge; blindly toggling can hide more of
                    // the target on a short screen or when tabbing backwards.
                    setAtTop(overlapAt(52 + gap) < overlapAt(innerHeight - gap - overlay.height));
                }
            });
        };
        document.addEventListener('focusin', keepFocusVisible);
        window.addEventListener('resize', keepFocusVisible);
        return () => {
            cancelAnimationFrame(frame);
            document.removeEventListener('focusin', keepFocusVisible);
            window.removeEventListener('resize', keepFocusVisible);
        };
    }, [visible]);
    if (!visible) return null;
    return <section ref={notice} className={`usage-consent${atTop ? ' is-top' : ''}`} aria-labelledby="usage-consent-title">
        <h2 id="usage-consent-title">This site counts usage</h2>
        <div className="usage-consent-copy">
        <p>To improve this experiment, it sends usage counts, mining timings and sanitized technical errors to PostHog EU. No cookies, no profile, no session replay. Wallet keys, seed words, names and transaction text stay in your browser.</p>
        <p className="usage-consent-later">Opt out here or any time in the menu under Usage sharing. <a href="/privacy.html">Privacy policy</a></p>
        </div>
        <div className="usage-consent-actions">
            <button type="button" className="card-kit-btn is-lg" onClick={() => client.setEnabled(false)}>Opt out</button>
            <button type="button" className="btn-primary" onClick={() => client.setEnabled(true)}>OK</button>
        </div>
    </section>;
}
