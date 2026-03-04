/**
 * AudioEngine — Web Audio API-based audio playback with VHF radio effect.
 *
 * Signal chain:
 *   MP3 buffer → decode → highpass(300Hz) → lowpass(3400Hz) → gain → compressor → destination
 *
 * This simulates the narrow bandwidth of VHF aviation radio.
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

    setRadioEffect(enabled) {
        this.radioEffectEnabled = enabled;
    }

    setVolume(vol) {
        this.volume = Math.max(0, Math.min(1, vol));
    }

    /**
     * Stop any currently playing audio
     */
    stop() {
        if (this.currentSource) {
            try { this.currentSource.stop(); } catch { }
            this.currentSource = null;
        }
        this.isPlaying = false;
    }

    /**
     * Play audio buffer with optional radio effect.
     * @param {ArrayBuffer|Uint8Array|number[]} audioData - Raw audio bytes (MP3)
     * @returns {Promise<void>} - Resolves when playback completes
     */
    async play(audioData) {
        if (!audioData) return;

        this.stop();

        const ctx = this.getContext();

        // Convert to ArrayBuffer if needed
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
                // ── VHF Radio Effect Chain ──────────────────────
                // 1. Highpass — cut below 300Hz (VHF radio floor)
                const highpass = ctx.createBiquadFilter();
                highpass.type = 'highpass';
                highpass.frequency.value = 300;
                highpass.Q.value = 0.7;

                // 2. Lowpass — cut above 3400Hz (VHF radio ceiling)
                const lowpass = ctx.createBiquadFilter();
                lowpass.type = 'lowpass';
                lowpass.frequency.value = 3400;
                lowpass.Q.value = 0.7;

                // 3. Peaking EQ — boost midrange for "nasal" radio quality
                const midBoost = ctx.createBiquadFilter();
                midBoost.type = 'peaking';
                midBoost.frequency.value = 1200;
                midBoost.gain.value = 4;
                midBoost.Q.value = 1.5;

                // 4. Compressor — simulate AGC (Automatic Gain Control)
                const compressor = ctx.createDynamicsCompressor();
                compressor.threshold.value = -20;
                compressor.knee.value = 10;
                compressor.ratio.value = 8;
                compressor.attack.value = 0.003;
                compressor.release.value = 0.1;

                // 5. Gain — volume control
                const gainNode = ctx.createGain();
                gainNode.gain.value = this.volume;

                // 6. Subtle noise — static crackle
                const noise = this.createStaticNoise(ctx, audioBuffer.duration);

                // Connect chain
                source.connect(highpass);
                highpass.connect(lowpass);
                lowpass.connect(midBoost);
                midBoost.connect(compressor);
                compressor.connect(gainNode);
                gainNode.connect(ctx.destination);

                // Mix in noise at very low volume
                if (noise) {
                    const noiseGain = ctx.createGain();
                    noiseGain.gain.value = 0.015; // Very subtle
                    noise.connect(noiseGain);
                    noiseGain.connect(ctx.destination);
                    noise.start();
                }
            } else {
                // Direct playback (no effect)
                const gainNode = ctx.createGain();
                gainNode.gain.value = this.volume;
                source.connect(gainNode);
                gainNode.connect(ctx.destination);
            }

            return new Promise((resolve) => {
                source.onended = () => {
                    this.isPlaying = false;
                    this.currentSource = null;
                    resolve();
                };
                source.start();
            });

        } catch (err) {
            console.error('[AudioEngine] Playback error:', err.message);
            this.isPlaying = false;
        }
    }

    /**
     * Generate brown noise for radio static
     */
    createStaticNoise(ctx, duration) {
        try {
            const sampleRate = ctx.sampleRate;
            const length = Math.floor(sampleRate * duration);
            const noiseBuffer = ctx.createBuffer(1, length, sampleRate);
            const data = noiseBuffer.getChannelData(0);

            let lastOut = 0;
            for (let i = 0; i < length; i++) {
                const white = Math.random() * 2 - 1;
                // Brown noise filter
                data[i] = (lastOut + (0.02 * white)) / 1.02;
                lastOut = data[i];
                data[i] *= 3.5; // Boost
            }

            const source = ctx.createBufferSource();
            source.buffer = noiseBuffer;
            return source;
        } catch {
            return null;
        }
    }
}

// Singleton
const audioEngine = new AudioEngine();
export default audioEngine;
