/**
 * STT Provider Abstraction
 * Routes transcription requests to free (whisper.cpp) or paid (OpenAI Whisper) provider.
 */
class SttProvider {
    constructor(store, costTracker) {
        this.store = store;
        this.costTracker = costTracker;
        this.config = store.get('providerConfig.stt');
        this.freeProvider = null;
        this.paidProvider = null;
    }

    updateConfig(config) {
        this.config = config;
    }

    updateApiKey(provider, key) {
        if (provider === 'openai' && this.paidProvider) {
            this.paidProvider = null; // Force re-init with new key
        }
    }

    getFreeProvider() {
        if (!this.freeProvider) {
            const { SttFree } = require('./sttFree');
            const apiKey = this.store.get('apiKeys.groq');
            this.freeProvider = new SttFree(apiKey);
        }
        return this.freeProvider;
    }

    getPaidProvider() {
        if (!this.paidProvider) {
            const { SttPaid } = require('./sttPaid');
            const apiKey = this.store.get('apiKeys.openai');
            this.paidProvider = new SttPaid(apiKey);
        }
        return this.paidProvider;
    }

    async transcribe(audioBuffer) {
        const provider = this.config.provider === 'paid'
            ? this.getPaidProvider()
            : this.getFreeProvider();

        const startTime = Date.now();
        const result = await provider.transcribe(audioBuffer);
        const duration = (Date.now() - startTime) / 1000;

        if (this.config.provider === 'paid') {
            // Estimate audio duration (rough: buffer size / sample rate / channels / bytes per sample)
            const audioDuration = audioBuffer.length / (16000 * 1 * 2); // 16kHz mono 16-bit
            this.costTracker.trackStt(audioDuration);
        }

        return result;
    }

    shutdown() {
        if (this.freeProvider && this.freeProvider.shutdown) {
            this.freeProvider.shutdown();
        }
    }
}

module.exports = { SttProvider };
