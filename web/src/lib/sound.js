export const playMiningSuccessSound = (enabled = true) => {
    if (!enabled) return;
    try {
        const AudioContext = window.AudioContext || window.webkitAudioContext;
        if (!AudioContext) return;

        const ctx = new AudioContext();
        const t = ctx.currentTime;

        // 1. Heavy Thud (Low frequency impact/kick)
        const thudOsc = ctx.createOscillator();
        thudOsc.type = 'triangle';
        thudOsc.frequency.setValueAtTime(80, t);
        thudOsc.frequency.exponentialRampToValueAtTime(10, t + 0.4);

        const thudGain = ctx.createGain();
        thudGain.gain.setValueAtTime(1.0, t);
        thudGain.gain.exponentialRampToValueAtTime(0.01, t + 0.4);

        thudOsc.connect(thudGain);
        thudGain.connect(ctx.destination);
        thudOsc.start(t);
        thudOsc.stop(t + 0.5);

        // 2. Metallic Clank (Bandpass filtered noise + Ring)
        // Create noise buffer
        const bufferSize = ctx.sampleRate * 0.5; // 0.5 seconds
        const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
        const data = buffer.getChannelData(0);
        for (let i = 0; i < bufferSize; i++) {
            data[i] = Math.random() * 2 - 1;
        }
        const noise = ctx.createBufferSource();
        noise.buffer = buffer;

        const noiseFilter = ctx.createBiquadFilter();
        noiseFilter.type = 'bandpass';
        noiseFilter.frequency.value = 1000;
        noiseFilter.Q.value = 10;

        const noiseGain = ctx.createGain();
        noiseGain.gain.setValueAtTime(0.5, t);
        noiseGain.gain.exponentialRampToValueAtTime(0.01, t + 0.3);

        noise.connect(noiseFilter);
        noiseFilter.connect(noiseGain);
        noiseGain.connect(ctx.destination);
        noise.start(t);

        // 3. Resonant Ring (High metal ping)
        const ringOsc = ctx.createOscillator();
        ringOsc.type = 'sine';
        ringOsc.frequency.setValueAtTime(600, t); // Base tone

        const ringGain = ctx.createGain();
        ringGain.gain.setValueAtTime(0.3, t);
        ringGain.gain.exponentialRampToValueAtTime(0.001, t + 1.5); // Long decay

        ringOsc.connect(ringGain);
        ringGain.connect(ctx.destination);
        ringOsc.start(t);
        ringOsc.stop(t + 2.0);

    } catch (e) {
        console.error("Audio error", e);
    }
};
