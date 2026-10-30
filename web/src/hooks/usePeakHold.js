import { useLayoutEffect, useState, useSyncExternalStore } from 'react';

function createPeakStore(initialValue) {
    let peak = initialValue;
    let observations = [];
    let lastKey;
    let hasSample = false;
    let timer;
    const listeners = new Set();

    const refresh = () => {
        clearTimeout(timer);
        timer = undefined;
        const now = Date.now();
        observations = observations.filter(sample => sample.expiresAt > now);
        const nextPeak = observations.reduce((maximum, sample) => Math.max(maximum, sample.value), 0);
        const changed = nextPeak !== peak;
        peak = nextPeak;
        if (observations.length && listeners.size) {
            const nextExpiry = observations.reduce((earliest, sample) => Math.min(earliest, sample.expiresAt), Infinity);
            timer = setTimeout(refresh, Math.max(0, nextExpiry - now));
        }
        if (changed) listeners.forEach(listener => listener());
    };

    return {
        getSnapshot: () => peak,
        subscribe: listener => {
            listeners.add(listener);
            refresh();
            return () => {
                listeners.delete(listener);
                if (!listeners.size) {
                    clearTimeout(timer);
                    timer = undefined;
                }
            };
        },
        observe: (value, key, holdMs) => {
            if (hasSample && Object.is(lastKey, key)) return;
            hasSample = true;
            lastKey = key;
            if (value > 0) observations.push({ value, expiresAt: Date.now() + holdMs });
            refresh();
        },
    };
}

// Only a new progress sample earns another hold interval; renders do not.
export function usePeakHold(value, sampleKey, holdMs = 1000) {
    const [store] = useState(() => createPeakStore(value));
    const peak = useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot);
    useLayoutEffect(() => {
        store.observe(value, sampleKey, holdMs);
    }, [store, value, sampleKey, holdMs]);
    return peak;
}
