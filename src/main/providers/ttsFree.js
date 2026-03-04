const path = require('path');
const os = require('os');
const fs = require('fs');

/**
 * TTS Free — Microsoft Edge TTS via edge-tts-universal npm package
 * Completely free, no API key needed.
 * Uses the Communicate class which streams audio chunks.
 */
class TtsFree {
    constructor() {
        this._mod = null;
    }

    async getMod() {
        if (!this._mod) {
            this._mod = await import('edge-tts-universal');
        }
        return this._mod;
    }

    /**
     * Synthesize text using Edge TTS
     * @param {string} text - Text to speak
     * @param {string} voice - Edge TTS voice name (e.g., 'en-US-GuyNeural')
     * @returns {Buffer} - MP3 audio data
     */
    async synthesize(text, voice = 'en-US-GuyNeural') {
        try {
            const mod = await this.getMod();
            const communicate = new mod.Communicate(text, voice);

            const audioChunks = [];
            for await (const chunk of communicate.stream()) {
                if (chunk.type === 'audio') {
                    audioChunks.push(chunk.data);
                }
            }

            if (audioChunks.length === 0) {
                console.warn('[TTS Free] No audio chunks received');
                return null;
            }

            const audioBuffer = Buffer.concat(audioChunks);
            console.log(`[TTS Free] Generated ${audioBuffer.length} bytes of audio`);
            return audioBuffer;
        } catch (err) {
            console.error('[TTS Free] Communicate error:', err.message);
            return null;
        }
    }
}

module.exports = { TtsFree };
