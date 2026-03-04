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

    async transcribe(audioBuffer, aviationContext = {}) {
        if (!this.apiKey) {
            throw new Error('OpenAI API key not configured for STT');
        }

        const tmpPath = path.join(os.tmpdir(), `atc-stt-${Date.now()}.wav`);
        fs.writeFileSync(tmpPath, audioBuffer);

        const { callsign = '', origin = '', destination = '', aircraftType = '' } = aviationContext;
        const prompt = [
            'Aviation ATC radio. ICAO phraseology.',
            callsign ? `Callsign: ${callsign}.` : '',
            origin ? `From ${origin}.` : '',
            destination ? `To ${destination}.` : '',
            aircraftType ? `Aircraft: ${aircraftType}.` : '',
            'Vocabulary: hold short, cleared, squawk, wilco, roger, say again,',
            'maintain, heading, flight level, frequency, contact, pushback approved.',
        ].filter(Boolean).join(' ');

        try {
            const client = this.getClient();
            const transcription = await client.audio.transcriptions.create({
                file: fs.createReadStream(tmpPath),
                model: 'whisper-1',
                language: 'en',
                prompt,  // ← Injected aviation + callsign context
            });

            return transcription.text || '';
        } finally {
            try { fs.unlinkSync(tmpPath); } catch { }
        }
    }
}

module.exports = { SttPaid };
