// @vitest-environment jsdom
import { StrictMode } from 'react';
import { fireEvent, render, screen, cleanup } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { AnalyticsControl } from '../components/AnalyticsControl';
import { createTelemetry } from '../lib/telemetry';
afterEach(cleanup);
it('keeps consent explicit under StrictMode and updates the visible control', () => {
    const request=vi.fn(async()=>({ok:true}));
    const client=createTelemetry({projectToken:'phc_syntheticproject',storage:{getItem:()=>null,setItem:vi.fn()},request,privacySignal:()=>false,id:()=> '00000000-0000-4000-8000-000000000001',now:()=>Date.parse('2026-01-02T12:00:00Z')});
    client.start();render(<StrictMode><AnalyticsControl client={client}/></StrictMode>);
    expect(request).not.toHaveBeenCalled();
    fireEvent.click(screen.getByText('Usage sharing: off'));
    fireEvent.click(screen.getByLabelText('Share usage and technical errors'));
    expect(screen.getByText('Usage sharing: on')).toBeTruthy();expect(request).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByLabelText('Share usage and technical errors'));
    expect(screen.getByText('Usage sharing: off')).toBeTruthy();
});
