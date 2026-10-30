// @vitest-environment jsdom
import { StrictMode } from 'react';
import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { usePeakHold } from '../hooks/usePeakHold';

beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-01T00:00:00Z'));
});
afterEach(() => { cleanup(); vi.useRealTimers(); });

const advance = milliseconds => act(() => { vi.advanceTimersByTime(milliseconds); });
const mountPeak = (value, sampleKey = 1) => renderHook(
    props => usePeakHold(props.value, props.sampleKey),
    { initialProps: { value, sampleKey } },
);

describe('usePeakHold', () => {
    it('rises immediately when a new sample exceeds the held peak', () => {
        const { result, rerender } = mountPeak(2);
        expect(result.current).toBe(2);
        advance(300);
        rerender({ value: 5, sampleKey: 2 });
        expect(result.current).toBe(5);
        advance(999);
        expect(result.current).toBe(5);
        advance(1);
        expect(result.current).toBe(0);
    });

    it('falls to the highest unexpired observation, then expires without further input', () => {
        const { result, rerender } = mountPeak(3);
        advance(600);
        rerender({ value: 2, sampleKey: 2 });
        expect(result.current).toBe(3);
        advance(399);
        expect(result.current).toBe(3);
        advance(1);
        expect(result.current).toBe(2);
        advance(599);
        expect(result.current).toBe(2);
        advance(1);
        expect(result.current).toBe(0);
        expect(vi.getTimerCount()).toBe(0);
    });

    it('retains the maximum across several overlapping observations', () => {
        const { result, rerender } = mountPeak(5);
        advance(200);
        rerender({ value: 1, sampleKey: 2 });
        advance(200);
        rerender({ value: 3, sampleKey: 3 });
        advance(200);
        rerender({ value: 2, sampleKey: 4 });
        advance(400);
        expect(result.current).toBe(3);
        advance(200);
        expect(result.current).toBe(3);
        advance(200);
        expect(result.current).toBe(2);
        advance(200);
        expect(result.current).toBe(0);
    });

    it('refreshes eligibility when the same value arrives with a new key', () => {
        const { result, rerender } = mountPeak(3);
        advance(600);
        rerender({ value: 3, sampleKey: 2 });
        advance(400);
        expect(result.current).toBe(3);
        advance(599);
        expect(result.current).toBe(3);
        advance(1);
        expect(result.current).toBe(0);
    });

    it('never refreshes a sample because of unchanged rerenders', () => {
        const { result, rerender } = mountPeak(3);
        advance(600);
        rerender({ value: 3, sampleKey: 1 });
        advance(400);
        expect(result.current).toBe(0);
        rerender({ value: 3, sampleKey: 1 });
        advance(1000);
        expect(result.current).toBe(0);
        expect(vi.getTimerCount()).toBe(0);
    });

    it('does not let a changed value reuse a stale key to extend eligibility', () => {
        const { result, rerender } = mountPeak(3);
        advance(600);
        rerender({ value: 2, sampleKey: 1 });
        expect(result.current).toBe(3);
        advance(400);
        expect(result.current).toBe(0);
    });

    it('uses a custom hold interval without changing existing observation lifetimes', () => {
        const { result, rerender } = renderHook(
            props => usePeakHold(props.value, props.sampleKey, props.holdMs),
            { initialProps: { value: 4, sampleKey: 1, holdMs: 250 } },
        );
        advance(100);
        rerender({ value: 2, sampleKey: 2, holdMs: 500 });
        advance(150);
        expect(result.current).toBe(2);
        advance(349);
        expect(result.current).toBe(2);
        advance(1);
        expect(result.current).toBe(0);
    });

    it('isolates peaks and timer cleanup between hook instances', () => {
        const first = mountPeak(3);
        const second = mountPeak(5);
        expect(vi.getTimerCount()).toBe(2);
        advance(400);
        second.rerender({ value: 5, sampleKey: 2 });
        advance(600);
        expect(first.result.current).toBe(0);
        expect(second.result.current).toBe(5);
        expect(vi.getTimerCount()).toBe(1);
        second.unmount();
        expect(vi.getTimerCount()).toBe(0);
        first.unmount();
    });

    it('cancels pending expiry on unmount while another instance keeps running', () => {
        const first = mountPeak(3);
        const second = mountPeak(2);
        first.unmount();
        expect(vi.getTimerCount()).toBe(1);
        advance(1000);
        expect(second.result.current).toBe(0);
        expect(vi.getTimerCount()).toBe(0);
    });

    it('keeps one finite timer through Strict Mode effect remounts', () => {
        const wrapper = ({ children }) => <StrictMode>{children}</StrictMode>;
        const { result, unmount } = renderHook(() => usePeakHold(3, 1), { wrapper });
        expect(result.current).toBe(3);
        expect(vi.getTimerCount()).toBe(1);
        advance(1000);
        expect(result.current).toBe(0);
        expect(vi.getTimerCount()).toBe(0);
        unmount();
        expect(vi.getTimerCount()).toBe(0);
    });

    it('keeps zero-valued progress samples at zero without idle timers', () => {
        const { result, rerender } = mountPeak(0);
        rerender({ value: 0, sampleKey: 2 });
        expect(result.current).toBe(0);
        expect(vi.getTimerCount()).toBe(0);
    });
});
