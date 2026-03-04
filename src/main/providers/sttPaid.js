const fs = require('fs');
const path = require('path');
const os = require('os');

/**
 * STT Paid — OpenAI Whisper API (whisper-1)
 */
class SttPaid {
    constructor(apiKey) {
        this.apiKey = apiKey;
        this.client = null;
    }

    getClient() {
        if (!this.client) {
            const OpenAI = require('openai');
            this.client = new OpenAI({ apiKey: this.apiKey });
        }
        return this.client;
    }

    async transcribe(audioBuffer) {
        if (!this.apiKey) {
            throw new Error('OpenAI API key not configured for STT');
        }

        // Write buffer to a temp file (OpenAI SDK requires file path)
        const tmpPath = path.join(os.tmpdir(), `atc-stt-${Date.now()}.wav`);
        fs.writeFileSync(tmpPath, audioBuffer);

        try {
            const client = this.getClient();
            const transcription = await client.audio.transcriptions.create({
                file: fs.createReadStream(tmpPath),
                model: 'whisper-1',
                language: 'en',
                prompt: 'ATC aviation radio communication. Callsign, altitude, heading, runway, clearance.',
            });

            return transcription.text || '';
        } finally {
            // Clean up temp file
            try { fs.unlinkSync(tmpPath); } catch { }
        }
    }
}

module.exports = { SttPaid };
