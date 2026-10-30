import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const audioParam = () => ({
    setValueAtTime: vi.fn(),
    linearRampToValueAtTime: vi.fn(),
    exponentialRampToValueAtTime: vi.fn(),
});
const audioNode = () => ({ connect: vi.fn(), disconnect: vi.fn() });

const fakeContext = (state = 'suspended') => {
    const context = { state, currentTime: 42, destination: {}, oscillators: [], gains: [] };
    context.resume = vi.fn(async () => { context.state = 'running'; });
    context.createOscillator = vi.fn(() => {
        const oscillator = { ...audioNode(), frequency: audioParam(), start: vi.fn(), stop: vi.fn(), onended: null };
        context.oscillators.push(oscillator);
        return oscillator;
    });
    context.createGain = vi.fn(() => {
        const gain = { ...audioNode(), gain: audioParam() };
        context.gains.push(gain);
        return gain;
    });
    return context;
};

let sound;
let contexts;
let AudioContext;
beforeEach(async () => {
    vi.resetModules();
    contexts = [];
    AudioContext = vi.fn(function () {
        const context = fakeContext();
        contexts.push(context);
        return context;
    });
    vi.stubGlobal('AudioContext', AudioContext);
    vi.stubGlobal('webkitAudioContext', undefined);
    sound = await import('../lib/sound.js');
});
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

describe('mining audio activation', () => {
    it('allocates nothing at import or playback before a gesture, including when disabled', () => {
        expect(sound.playMiningSuccessSound()).toBe(false);
        expect(sound.playMiningSuccessSound(false)).toBe(false);
        expect(AudioContext).not.toHaveBeenCalled();
    });

    it('creates and resumes synchronously inside the gesture, then waits for running state', async () => {
        const context = fakeContext();
        let finishResume;
        context.resume = vi.fn(() => new Promise(resolve => { finishResume = resolve; }));
        AudioContext.mockImplementationOnce(function () { return context; });
        const activation = sound.unlockMiningAudio();
        expect(AudioContext).toHaveBeenCalledTimes(1);
        expect(context.resume).toHaveBeenCalledTimes(1);
        expect(sound.playMiningSuccessSound()).toBe(false);
        expect(context.createOscillator).not.toHaveBeenCalled();
        context.state = 'running';
        finishResume();
        await expect(activation).resolves.toBe(true);
    });

    it('reuses the primed context for repeated cues and gestures without repeated resume', async () => {
        await expect(sound.unlockMiningAudio()).resolves.toBe(true);
        const context = contexts[0];
        expect(sound.playMiningSuccessSound()).toBe(true);
        expect(sound.playMiningSuccessSound()).toBe(true);
        await expect(sound.unlockMiningAudio()).resolves.toBe(true);
        expect(AudioContext).toHaveBeenCalledTimes(1);
        expect(context.resume).toHaveBeenCalledTimes(1);
    });

    it('resumes the same suspended/interrupted context only from a later gesture', async () => {
        await sound.unlockMiningAudio();
        const context = contexts[0];
        for (const state of ['suspended', 'interrupted']) {
            context.state = state;
            expect(sound.playMiningSuccessSound()).toBe(false);
            expect(context.createOscillator).not.toHaveBeenCalled();
            await expect(sound.unlockMiningAudio()).resolves.toBe(true);
        }
        expect(AudioContext).toHaveBeenCalledTimes(1);
        expect(context.resume).toHaveBeenCalledTimes(3);
    });

    it('recreates a closed context only from a new gesture', async () => {
        await sound.unlockMiningAudio();
        contexts[0].state = 'closed';
        expect(sound.playMiningSuccessSound()).toBe(false);
        expect(AudioContext).toHaveBeenCalledTimes(1);
        await expect(sound.unlockMiningAudio()).resolves.toBe(true);
        expect(AudioContext).toHaveBeenCalledTimes(2);
    });

    it('supports the prefixed browser constructor', async () => {
        vi.stubGlobal('AudioContext', undefined);
        vi.stubGlobal('webkitAudioContext', AudioContext);
        await expect(sound.unlockMiningAudio()).resolves.toBe(true);
    });

    it('handles unsupported browsers and constructor failure safely', async () => {
        vi.stubGlobal('AudioContext', undefined);
        await expect(sound.unlockMiningAudio()).resolves.toBe(false);
        vi.stubGlobal('AudioContext', AudioContext);
        AudioContext.mockImplementationOnce(function () { throw new Error('Audio unavailable'); });
        await expect(sound.unlockMiningAudio()).resolves.toBe(false);
        expect(sound.playMiningSuccessSound()).toBe(false);
    });

    it.each(['reject', 'throw'])('absorbs resume %s and allows a later trusted gesture', async failure => {
        const context = fakeContext();
        if (failure === 'reject') context.resume.mockRejectedValueOnce(new Error('Activation required'));
        else context.resume.mockImplementationOnce(() => { throw new Error('Activation required'); });
        AudioContext.mockImplementationOnce(function () { return context; });
        await expect(sound.unlockMiningAudio()).resolves.toBe(false);
        expect(sound.playMiningSuccessSound()).toBe(false);
        expect(context.createOscillator).not.toHaveBeenCalled();
        await expect(sound.unlockMiningAudio()).resolves.toBe(true);
        expect(AudioContext).toHaveBeenCalledTimes(1);
    });
});

describe('mining reward cue', () => {
    it('does not schedule muted cues or resume from playback', async () => {
        await sound.unlockMiningAudio();
        const context = contexts[0];
        expect(sound.playMiningSuccessSound(false)).toBe(false);
        expect(context.createGain).not.toHaveBeenCalled();
        expect(context.createOscillator).not.toHaveBeenCalled();
        expect(context.resume).toHaveBeenCalledTimes(1);
    });

    it('schedules an audible ascending major triad with bounded smooth envelopes and finite lifetimes', async () => {
        await sound.unlockMiningAudio();
        const context = contexts[0];
        expect(sound.playMiningSuccessSound()).toBe(true);
        const chimes = context.oscillators.filter(oscillator => oscillator.type === 'sine');
        expect(chimes).toHaveLength(3);
        const pitches = chimes.map(oscillator => oscillator.frequency.setValueAtTime.mock.calls[0][0]);
        expect(pitches[0]).toBeGreaterThan(400);
        expect(pitches[1] / pitches[0]).toBeCloseTo(2 ** (4 / 12), 3);
        expect(pitches[2] / pitches[0]).toBeCloseTo(2 ** (7 / 12), 3);
        expect(chimes[1].start.mock.calls[0][0]).toBeGreaterThan(chimes[0].start.mock.calls[0][0]);
        expect(chimes[2].start.mock.calls[0][0]).toBeGreaterThan(chimes[1].start.mock.calls[0][0]);
        let summedPeaks = 0;
        for (let index = 0; index < context.oscillators.length; index++) {
            const oscillator = context.oscillators[index];
            const gain = context.gains[index];
            const start = oscillator.start.mock.calls[0][0];
            const end = oscillator.stop.mock.calls[0][0];
            expect(Number.isFinite(start)).toBe(true);
            expect(end).toBeGreaterThan(start);
            expect(end).toBeLessThanOrEqual(context.currentTime + 0.8);
            expect(gain.gain.setValueAtTime).toHaveBeenCalledWith(0, start);
            const [peak, attackEnd] = gain.gain.linearRampToValueAtTime.mock.calls[0];
            expect(peak).toBeGreaterThan(0);
            expect(attackEnd).toBeGreaterThan(start);
            expect(attackEnd).toBeLessThan(end);
            summedPeaks += peak;
            const [tail, tailTime] = gain.gain.exponentialRampToValueAtTime.mock.calls[0];
            expect(tail).toBeGreaterThan(0);
            expect(tail).toBeLessThan(peak / 100);
            expect(tailTime).toBeGreaterThan(attackEnd);
            expect(tailTime).toBeLessThan(end);
            expect(gain.gain.linearRampToValueAtTime).toHaveBeenLastCalledWith(0, end);
            expect(oscillator.connect).toHaveBeenCalledWith(gain);
            expect(gain.connect).toHaveBeenCalledWith(context.destination);
        }
        expect(summedPeaks).toBeLessThanOrEqual(0.4);
        expect(Math.max(...context.oscillators.map(oscillator => oscillator.stop.mock.calls[0][0])) - context.currentTime).toBeGreaterThanOrEqual(0.5);
    });

    it('disconnects every transient node on ended without closing the reusable context', async () => {
        await sound.unlockMiningAudio();
        const context = contexts[0];
        sound.playMiningSuccessSound();
        for (const oscillator of context.oscillators) oscillator.onended();
        for (const node of [...context.oscillators, ...context.gains]) expect(node.disconnect).toHaveBeenCalledTimes(1);
        expect(context.oscillators.every(oscillator => oscillator.onended === null)).toBe(true);
        expect(context.state).toBe('running');
        expect(sound.playMiningSuccessSound()).toBe(true);
        expect(AudioContext).toHaveBeenCalledTimes(1);
    });

    it('stops and disconnects partially scheduled voices when the audio graph fails', async () => {
        await sound.unlockMiningAudio();
        const context = contexts[0];
        const createGain = context.createGain.getMockImplementation();
        context.createGain.mockImplementationOnce(createGain).mockImplementationOnce(() => { throw new Error('Device gone'); });
        expect(sound.playMiningSuccessSound()).toBe(false);
        expect(context.oscillators).toHaveLength(2);
        for (const oscillator of context.oscillators) {
            expect(oscillator.stop).toHaveBeenCalled();
            expect(oscillator.disconnect).toHaveBeenCalledTimes(1);
            expect(oscillator.onended).toBeNull();
        }
        expect(context.gains[0].disconnect).toHaveBeenCalledTimes(1);
    });

    it('contains node cleanup failures', async () => {
        await sound.unlockMiningAudio();
        const context = contexts[0];
        sound.playMiningSuccessSound();
        context.oscillators[0].disconnect.mockImplementation(() => { throw new Error('Already disconnected'); });
        expect(() => context.oscillators[0].onended()).not.toThrow();
        expect(context.gains[0].disconnect).toHaveBeenCalledTimes(1);
    });
});
