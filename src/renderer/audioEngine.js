/**
 * AudioEngine — Realistic VHF Aviation Radio Effect
 *
 * Signal chain:
 *   squelchClick → [source + whiteNoise] → highpass(400Hz) → lowpass(2800Hz)
 *   → peakingEQ(1000Hz) → waveshaper(saturation) → compressor → gain → destination
 *   → squelchClick (end)
 */

class AudioEngine {
    constructor() {
        this.ctx = null;
        this.radioEffectEnabled = true;
        this.volume = 0.8;
        this.isPlaying = false;
        this.currentSource = null;
    }

    getContext() {
        if (!this.ctx) {
            this.ctx = new (window.AudioContext || window.webkitAudioContext)();
        }
        if (this.ctx.state === 'suspended') {
            this.ctx.resume();
        }
        return this.ctx;
    }

    setRadioEffect(enabled) { this.radioEffectEnabled = enabled; }
    setVolume(vol) { this.volume = Math.max(0, Math.min(1, vol)); }

    stop() {
        if (this.currentSource) {
            try { this.currentSource.stop(); } catch { }
            this.currentSource = null;
        }
        this.isPlaying = false;
    }

    /**
     * Generate a short squelch click buffer (the characteristic radio click)
     * Duration: ~35ms. Sounds like a relay clicking.
     */
    createSquelchClick(ctx) {
        const sampleRate = ctx.sampleRate;
        const duration = 0.035; // 35ms
        const length = Math.floor(sampleRate * duration);
        const buffer = ctx.createBuffer(1, length, sampleRate);
        const data = buffer.getChannelData(0);

        for (let i = 0; i < length; i++) {
            const t = i / sampleRate;
            // Sharp attack, fast decay envelope
            const envelope = Math.exp(-t * 120);
            // Mix of noise and a short tone burst (2kHz click)
            const click = (Math.random() * 2 - 1) * 0.6 + Math.sin(2 * Math.PI * 2000 * t) * 0.4;
            data[i] = click * envelope;
        }

        const source = ctx.createBufferSource();
        source.buffer = buffer;
        return source;
    }

    /**
     * Create waveshaper for radio saturation/clipping effect.
     * This is what gives radio that compressed, slightly crunchy quality.
     */
    createSaturationCurve(amount = 50) {
        const n = 256;
        const curve = new Float32Array(n);
        const deg = Math.PI / 180;
        for (let i = 0; i < n; i++) {
            const x = (i * 2) / n - 1;
            curve[i] = ((3 + amount) * x * 20 * deg) / (Math.PI + amount * Math.abs(x));
        }
        return curve;
    }

    /**
     * Create white noise burst (radio hiss present during transmission)
     */
    createTransmissionNoise(ctx, duration) {
        try {
            const sampleRate = ctx.sampleRate;
            const length = Math.floor(sampleRate * duration);
            const buffer = ctx.createBuffer(1, length, sampleRate);
            const data = buffer.getChannelData(0);

            for (let i = 0; i < length; i++) {
                data[i] = (Math.random() * 2 - 1);
            }

            const source = ctx.createBufferSource();
            source.buffer = buffer;
            return source;
        } catch {
            return null;
        }
    }

    async play(audioData) {
        if (!audioData) return;
        this.stop();

        const ctx = this.getContext();

        let buffer;
        if (audioData instanceof ArrayBuffer) {
            buffer = audioData;
        } else if (Array.isArray(audioData)) {
            buffer = new Uint8Array(audioData).buffer;
        } else if (audioData.buffer) {
            buffer = audioData.buffer;
        } else {
            console.error('[AudioEngine] Unknown audio data type');
            return;
        }

        try {
            const audioBuffer = await ctx.decodeAudioData(buffer.slice(0));
            const source = ctx.createBufferSource();
            source.buffer = audioBuffer;
            this.currentSource = source;
            this.isPlaying = true;

            if (this.radioEffectEnabled) {
                const now = ctx.currentTime;

                // ── GAIN (master volume) ──────────────────────
                const masterGain = ctx.createGain();
                masterGain.gain.value = this.volume * 1.4; // Radio is louder

                // ── 1. HIGHPASS — cut rumble below 400Hz ─────
                const highpass = ctx.createBiquadFilter();
                highpass.type = 'highpass';
                highpass.frequency.value = 400;
                highpass.Q.value = 1.2;

                // ── 2. LOWPASS — cut clarity above 2800Hz ────
                const lowpass = ctx.createBiquadFilter();
                lowpass.type = 'lowpass';
                lowpass.frequency.value = 2800;
                lowpass.Q.value = 1.2;

                // ── 3. PEAKING EQ — nasal 1kHz boost ─────────
                const midBoost = ctx.createBiquadFilter();
                midBoost.type = 'peaking';
                midBoost.frequency.value = 1000;
                midBoost.gain.value = 8;   // More aggressive than before
                midBoost.Q.value = 2.0;

                // ── 4. HIGH SHELF CUT — dull the treble ───────
                const trebleCut = ctx.createBiquadFilter();
                trebleCut.type = 'highshelf';
                trebleCut.frequency.value = 2000;
                trebleCut.gain.value = -6;

                // ── 5. WAVESHAPER — saturation/clipping crunch ─
                const waveshaper = ctx.createWaveShaper();
                waveshaper.curve = this.createSaturationCurve(60);
                waveshaper.oversample = '2x';

                // ── 6. COMPRESSOR — AGC simulation ────────────
                const compressor = ctx.createDynamicsCompressor();
                compressor.threshold.value = -18;
                compressor.knee.value = 6;
                compressor.ratio.value = 12;   // Heavy compression
                compressor.attack.value = 0.001;
                compressor.release.value = 0.05;

                // ── 7. TRANSMISSION NOISE (hiss during speech) ─
                const noise = this.createTransmissionNoise(ctx, audioBuffer.duration);
                const noiseGain = ctx.createGain();
                noiseGain.gain.value = 0.0;
                // Noise fades in briefly then sustains at low level
                noiseGain.gain.setValueAtTime(0, now);
                noiseGain.gain.linearRampToValueAtTime(0.04, now + 0.05);
                noiseGain.gain.setValueAtTime(0.025, now + 0.1);
                noiseGain.gain.linearRampToValueAtTime(0, now + audioBuffer.duration);

                // ── Connect main signal chain ──────────────────
                source.connect(highpass);
                highpass.connect(lowpass);
                lowpass.connect(midBoost);
                midBoost.connect(trebleCut);
                trebleCut.connect(waveshaper);
                waveshaper.connect(compressor);
                compressor.connect(masterGain);
                masterGain.connect(ctx.destination);

                // ── Connect noise in parallel ──────────────────
                if (noise) {
                    noise.connect(noiseGain);
                    noiseGain.connect(ctx.destination);
                }

                // ── Play opening squelch click ─────────────────
                const openClick = this.createSquelchClick(ctx);
                const clickGain = ctx.createGain();
                clickGain.gain.value = this.volume * 0.5;
                openClick.connect(clickGain);
                clickGain.connect(ctx.destination);
                openClick.start(now);

                // ── Start main audio 30ms after click ─────────
                const audioStartTime = now + 0.03;
                source.start(audioStartTime);
                if (noise) noise.start(audioStartTime);

                // ── Play closing squelch click after speech ends ─
                const closeDelay = audioStartTime + audioBuffer.duration + 0.02;
                const closeClick = this.createSquelchClick(ctx);
                const closeGain = ctx.createGain();
                closeGain.gain.value = this.volume * 0.4;
                closeClick.connect(closeGain);
                closeGain.connect(ctx.destination);
                closeClick.start(closeDelay);

                return new Promise((resolve) => {
                    source.onended = () => {
                        this.isPlaying = false;
                        this.currentSource = null;
                        // Resolve after close click finishes
                        setTimeout(resolve, 80);
                    };
                });

            } else {
                // No effect — clean playback
                const gainNode = ctx.createGain();
                gainNode.gain.value = this.volume;
                source.connect(gainNode);
                gainNode.connect(ctx.destination);
                source.start();

                return new Promise((resolve) => {
                    source.onended = () => {
                        this.isPlaying = false;
                        this.currentSource = null;
                        resolve();
                    };
                });
            }

        } catch (err) {
            console.error('[AudioEngine] Playback error:', err.message);
            this.isPlaying = false;
        }
    }
}

const audioEngine = new AudioEngine();
export default audioEngine;
