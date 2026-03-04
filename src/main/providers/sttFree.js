const fs = require('fs');
const os = require('os');
const path = require('path');

/**
 * STT Free — Groq Whisper (whisper-large-v3-turbo)
 * Free tier: uses the same Groq API key as the LLM.
 * Much simpler than whisper.cpp — no binary needed.
 */
class SttFree {
    constructor(apiKey) {
        this.apiKey = apiKey;
        this.client = null;
    }

    getClient() {
        if (!this.client && this.apiKey) {
            const Groq = require('groq-sdk');
            this.client = new Groq({ apiKey: this.apiKey });
        }
        return this.client;
    }

    /**
     * Transcribe audio buffer using Groq Whisper
     * @param {Buffer} audioBuffer - WAV/WebM audio data
     * @returns {string} - Transcribed text
     */
    async transcribe(audioBuffer) {
        const client = this.getClient();
        if (!client) {
            console.error('[STT Free] No Groq API key configured');
            return '';
        }

        // Write buffer to temp file (Groq SDK needs a file path)
        const tmpFile = path.join(os.tmpdir(), `atc-stt-${Date.now()}.webm`);
        fs.writeFileSync(tmpFile, audioBuffer);

        try {
            const transcription = await client.audio.transcriptions.create({
                file: fs.createReadStream(tmpFile),
                model: 'whisper-large-v3-turbo',
                language: 'en',
                response_format: 'text',
            });

            console.log('[STT Free] Transcript:', transcription);
            return typeof transcription === 'string' ? transcription.trim() : (transcription.text || '').trim();
        } catch (err) {
            console.error('[STT Free] Groq Whisper error:', err.message);
            return '';
        } finally {
            try { fs.unlinkSync(tmpFile); } catch { }
        }
    }

    shutdown() {
        // No process to kill
    }
}

module.exports = { SttFree };
