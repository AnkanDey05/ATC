/**
 * TTS Paid — OpenAI TTS API (tts-1 / tts-1-hd)
 */
class TtsPaid {
    constructor(apiKey, quality = 'standard') {
        this.apiKey = apiKey;
        this.quality = quality;
        this.client = null;
    }

    getClient() {
        if (!this.client && this.apiKey) {
            const OpenAI = require('openai');
            this.client = new OpenAI({ apiKey: this.apiKey });
        }
        return this.client;
    }

    async synthesize(text, voice = 'alloy') {
        const client = this.getClient();
        if (!client) throw new Error('OpenAI API key not configured for TTS');

        const model = this.quality === 'hd' ? 'tts-1-hd' : 'tts-1';

        const response = await client.audio.speech.create({
            model,
            voice,
            input: text,
            response_format: 'mp3',
        });

        const buffer = Buffer.from(await response.arrayBuffer());
        return buffer;
    }
}

module.exports = { TtsPaid };
