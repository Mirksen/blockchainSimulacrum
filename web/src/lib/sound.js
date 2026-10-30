let miningAudioContext;

// Call directly from a trusted user gesture, before mining yields to async work.
export const unlockMiningAudio = async () => {
    try {
        if (!miningAudioContext || miningAudioContext.state === 'closed') {
            const AudioContext = globalThis.AudioContext || globalThis.webkitAudioContext;
            if (!AudioContext) return false;
            miningAudioContext = new AudioContext();
        }
        const context = miningAudioContext;
        if (context.state === 'suspended' || context.state === 'interrupted') {
            // resume() must run before the first await to retain user activation.
            await context.resume();
        }
        return context.state === 'running';
    } catch {
        return false;
    }
};

const disconnectVoice = ({ oscillator, gain }) => {
    oscillator.onended = null;
    for (const node of [oscillator, gain]) {
        try { node?.disconnect(); } catch { /* Cleanup must never interrupt mining. */ }
    }
};

export const playMiningSuccessSound = (enabled = true) => {
    const context = miningAudioContext;
    if (!enabled || !context || context.state !== 'running') return false;

    const voices = [];
    try {
        const now = context.currentTime;
        // A soft impact followed by a bright C-major reward; summed peaks < 0.4.
        const tones = [
            { frequency: 180, endFrequency: 70, delay: 0, duration: 0.18, peak: 0.10, type: 'triangle' },
            { frequency: 523.25, delay: 0, duration: 0.40, peak: 0.10, type: 'sine' },
            { frequency: 659.25, delay: 0.09, duration: 0.45, peak: 0.085, type: 'sine' },
            { frequency: 783.99, delay: 0.18, duration: 0.50, peak: 0.075, type: 'sine' },
        ];
        for (const tone of tones) {
            const oscillator = context.createOscillator();
            const voice = { oscillator, gain: null };
            voices.push(voice);
            const gain = context.createGain();
            voice.gain = gain;
            const start = now + tone.delay;
            const end = start + tone.duration;
            oscillator.type = tone.type;
            oscillator.frequency.setValueAtTime(tone.frequency, start);
            if (tone.endFrequency) {
                oscillator.frequency.exponentialRampToValueAtTime(tone.endFrequency, end);
            }
            gain.gain.setValueAtTime(0, start);
            gain.gain.linearRampToValueAtTime(tone.peak, start + 0.012);
            gain.gain.exponentialRampToValueAtTime(0.0001, end - 0.01);
            gain.gain.linearRampToValueAtTime(0, end);
            oscillator.onended = () => disconnectVoice(voice);
            oscillator.connect(gain);
            gain.connect(context.destination);
            oscillator.start(start);
            oscillator.stop(end);
        }
        return true;
    } catch {
        for (const voice of voices) {
            try { voice.oscillator.stop(); } catch { /* A source may not have started. */ }
            disconnectVoice(voice);
        }
        return false;
    }
};
