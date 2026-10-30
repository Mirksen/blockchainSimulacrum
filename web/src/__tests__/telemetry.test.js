// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { CONSENT_KEY, INGEST_URL, createTelemetry, installErrorTracking } from '../lib/telemetry';

function fixture(extra = {}) {
    let sequence = 0;
    const values = new Map();
    const storage = { getItem: key => values.get(key), setItem: (key, value) => values.set(key, value) };
    const request = extra.request || vi.fn(async () => ({ ok: true }));
    const client = createTelemetry({ projectToken: 'phc_syntheticproject', storage, request,
        id: () => `00000000-0000-4000-8000-${String(++sequence).padStart(12,'0')}`,
        now: () => Date.parse('2026-01-02T12:00:00Z'), online: () => true, privacySignal: () => false,
        origin: 'https://example.test', assets: ['/assets/app-synthetic.js'], ...extra });
    const payloads = () => request.mock.calls.map(call => JSON.parse(call[1].body));
    return { client, request, payloads, storage, values };
}
afterEach(() => { vi.useRealTimers(); });
describe('explicit PostHog event transport', () => {
    it('makes no request before consent, including errors and repeated starts', async () => {
        const { client, request } = fixture();
        client.start(); client.start();
        await client.track('mining_started', { difficulty: 2 });
        await client.reportError(new Error('synthetic private marker'), 'window');
        expect(request).not.toHaveBeenCalled();
    });
    it('sends one app-open event when enabled and uses only the EU public endpoint', async () => {
        const { client, request, payloads, values } = fixture();
        client.start(); client.setEnabled(true); client.setEnabled(true); client.start();
        expect(request).toHaveBeenCalledTimes(1);
        expect(request.mock.calls[0][0]).toBe(INGEST_URL);
        expect(payloads()[0]).toMatchObject({ event:'app_opened', distinct_id:'00000000-0000-4000-8000-000000000001', properties:{app:'proofofwork.fyi',schema_version:1,$process_person_profile:false} });
        expect(request.mock.calls[0][1]).toMatchObject({credentials:'omit',referrerPolicy:'no-referrer',keepalive:false});
        expect([...values.keys()]).toEqual([CONSENT_KEY]);
    });
    it('uses a strict field allowlist and rejects free-text numeric fields', async () => {
        const { client, payloads } = fixture(); client.setEnabled(true);
        await client.track('mining_completed',{difficulty:2,elapsed_ms:123,attempt_count:64,miner_count:2,transaction_count:1,block_height:3,
            privateKey:'synthetic-private-key',seedPhrase:'synthetic seed words',reference:'synthetic memo',name:'synthetic entered label',stack:'synthetic stack'});
        expect(payloads()[0].properties).toEqual({difficulty:2,elapsed_ms:123,attempt_count:64,miner_count:2,transaction_count:1,block_height:3,
            event_id:'00000000-0000-4000-8000-000000000002',app:'proofofwork.fyi',schema_version:1,$process_person_profile:false,$geoip_disable:true});
        await client.track('mining_completed',{difficulty:'synthetic marker',attempt_count:NaN,elapsed_ms:Infinity});
        expect(Object.keys(payloads()[1].properties)).toEqual(['event_id','app','schema_version','$process_person_profile','$geoip_disable']);
    });
    it('keeps high difficulty metrics and rejects values outside the supported range', async () => {
        const { client, payloads } = fixture(); client.setEnabled(true);
        await client.track('difficulty_changed', { previous: 5, value: 10 });
        await client.track('mining_cancelled', { difficulty: 10, elapsed_ms: 100, attempt_count: 200,
            miner_count: 2, transaction_count: 0, reason: 'user_stop' });
        expect(payloads()[0].properties).toMatchObject({ previous: 5, value: 10 });
        expect(payloads()[1].properties).toMatchObject({ difficulty: 10, reason: 'user_stop' });
        await client.track('difficulty_changed', { previous: 0, value: 11 });
        expect(payloads()[2].properties.previous).toBeUndefined();
        expect(payloads()[2].properties.value).toBeUndefined();
    });
    it('drops unknown events, raw error reasons and free-text settings', async () => {
        const { client, request, payloads } = fixture(); client.setEnabled(true);
        await client.track('$identify',{email:'synthetic marker'});
        await client.track('transaction_rejected',{source:'manual',reason:'synthetic memo'});
        await client.track('settings_changed',{setting:'coin_label',value:'synthetic entered label'});
        expect(request).toHaveBeenCalledTimes(2);
        expect(payloads()[0].properties.reason).toBeUndefined();
        expect(payloads()[1].properties.value).toBeUndefined();
        expect(JSON.stringify(payloads())).not.toContain('synthetic memo');
        expect(JSON.stringify(payloads())).not.toContain('synthetic entered label');
    });
    it('respects an existing saved choice without duplicate start events', () => {
        const request=vi.fn(async()=>({ok:true}));
        const {client}=fixture({request,storage:{getItem:()=> 'true'}});
        client.start();client.start();
        expect(request).toHaveBeenCalledTimes(1);
    });
    it.each(['', 'phx_syntheticsecret', 'https://example.test/key'])('does not send with invalid/missing configuration %s', async projectToken => {
        const { client, request } = fixture({ projectToken });client.start();client.setEnabled(true);
        await client.track('app_opened');
        expect(client.getSnapshot().configured).toBe(false);
        expect(request).not.toHaveBeenCalled();
    });
    it('respects browser privacy signals even with saved consent', async () => {
        const { client, request } = fixture({privacySignal:()=>true,storage:{getItem:()=> 'true'}});
        client.start();client.setEnabled(true);await client.track('app_opened');
        expect(client.getSnapshot()).toMatchObject({enabled:false,privacyBlocked:true});
        expect(request).not.toHaveBeenCalled();
    });
    it('keeps storage failures local and still permits a memory-only choice', async () => {
        const storage={getItem(){throw new Error('blocked');},setItem(){throw new Error('blocked');}};
        const {client, request}=fixture({storage});client.start();expect(request).not.toHaveBeenCalled();
        client.setEnabled(true);await client.track('chain_reset',{previous_block_count:2});
        expect(request).toHaveBeenCalledTimes(2);
    });
    it('does not queue offline events or retry failed requests', async () => {
        let online=false;
        const {client,request}=fixture({online:()=>online,request:vi.fn(async()=>{throw new Error('offline');})});
        client.setEnabled(true);await client.track('app_opened');expect(request).not.toHaveBeenCalled();
        online=true;await client.track('chain_reset',{previous_block_count:2});
        expect(request).toHaveBeenCalledTimes(1);
        await new Promise(resolve=>setTimeout(resolve,0));
        expect(request).toHaveBeenCalledTimes(1);
    });
    it('aborts pending sends on opt-out and never sends a queued follow-up', async () => {
        const request=vi.fn((url,options)=>new Promise((resolve,reject)=>options.signal.addEventListener('abort',()=>reject(new Error('aborted')))));
        const {client}=fixture({request});client.setEnabled(true);
        const pending=client.track('mining_started',{difficulty:2});
        const signal=request.mock.calls[0][1].signal;
        client.setEnabled(false);
        expect(signal.aborted).toBe(true);
        expect(await pending).toBe(false);
        await client.track('mining_completed',{difficulty:2});
        expect(request).toHaveBeenCalledTimes(1);
    });
    it('drops a stalled request after the bounded send timeout', async () => {
        vi.useFakeTimers();
        const request=vi.fn((url,options)=>new Promise((resolve,reject)=>options.signal.addEventListener('abort',()=>reject(new Error('timeout')))));
        const {client}=fixture({request});client.setEnabled(true);
        const pending=client.track('app_opened');await vi.advanceTimersByTimeAsync(5000);
        expect(await pending).toBe(false);expect(request).toHaveBeenCalledTimes(1);
    });
    it('clears consent across tabs through the storage listener', async () => {
        const {client,storage,request}=fixture();client.setEnabled(true);
        const cleanup=installErrorTracking(window,client);
        storage.setItem(CONSENT_KEY,'false');window.dispatchEvent(new StorageEvent('storage',{key:CONSENT_KEY,newValue:'false'}));
        await client.track('app_opened');expect(request).not.toHaveBeenCalled();expect(client.getSnapshot().enabled).toBe(false);cleanup();
    });
    it('rotates the in-memory visitor ID when sharing is re-enabled', async () => {
        const {client,payloads}=fixture();client.setEnabled(true);await client.track('app_opened');client.setEnabled(false);client.setEnabled(true);await client.track('app_opened');
        expect(payloads()[0].distinct_id).not.toBe(payloads()[1].distinct_id);
    });
    it('drops malformed telemetry inputs without throwing into the app', async () => {
        const {client,request}=fixture();client.setEnabled(true);
        const error=Object.defineProperty({},'name',{get(){throw new Error('synthetic marker');}});
        expect(await client.reportError(error,'window')).toBe(false);
        expect(await client.track('mining_started',null)).toBe(false);
        expect(request).not.toHaveBeenCalled();
    });
    it('sanitizes errors into the documented exception schema and deduplicates objects', async () => {
        const {client,payloads,request}=fixture();client.setEnabled(true);
        const error=new TypeError('synthetic private memo');
        error.stack='TypeError: synthetic private memo\n at syntheticName (https://example.test/assets/app-synthetic.js?private=marker:12:34)\n at syntheticOther (https://other.test/assets/app-synthetic.js:3:4)\n at https://example.test/private/synthetic-path.js:2:3';
        await client.reportError(error,'window');await client.reportError(error,'react',true);
        expect(request).toHaveBeenCalledTimes(1);
        const exception=payloads()[0].properties.$exception_list[0];
        expect(exception.type).toBe('TypeError');expect(exception.value).toBe('Unexpected application error');
        expect(exception.stacktrace.frames).toEqual([{platform:'custom',lang:'javascript',function:'<app>',filename:'/assets/app-synthetic.js',lineno:12,colno:34,in_app:true}]);
        const text=JSON.stringify(payloads());expect(text).not.toContain('private memo');expect(text).not.toContain('syntheticName');expect(text).not.toContain('private=marker');expect(text).not.toContain('other.test');
    });
});
