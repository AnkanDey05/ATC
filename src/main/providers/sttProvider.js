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
        this.flightPlan = null;
    }

    setFlightPlan(plan) {
        this.flightPlan = plan;
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
        let result = await provider.transcribe(audioBuffer);
        const duration = (Date.now() - startTime) / 1000;

        if (this.config.provider === 'paid') {
            const audioDuration = audioBuffer.length / (16000 * 1 * 2);
            this.costTracker.trackStt(audioDuration);
        }

        // A7: Post-process STT output for aviation corrections
        result = this.postProcessTranscript(result);

        return result;
    }

    /**
     * A7: Smart readback fallback correction
     * Fixes common STT garbling of aviation terms.
     */
    postProcessTranscript(text) {
        if (!text) return text;
        let corrected = text;

        // A7: Callsign correction using flight plan context
        const callsign = this.flightPlan?.callsign || '';
        if (callsign) {
            const airline = callsign.replace(/[0-9]/g, '').trim().toLowerCase();
            const number = callsign.replace(/[^0-9]/g, '');
            const callsignVariants = [
                callsign.toLowerCase(),
                `${airline} ${number.split('').join(' ')}`, // digit by digit
                airline + number,
                airline + ' ' + number,
            ];
            for (const variant of callsignVariants) {
                if (variant && corrected.toLowerCase().includes(variant)) {
                    corrected = corrected.replace(new RegExp(variant.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi'), callsign);
                    break;
                }
            }
        }

        // Fix flight level transcriptions
        corrected = corrected
            .replace(/\bflight level\s+(\d)\s+(\d)\s+(\d)\b/gi, 'FL$1$2$3')
            .replace(/\bflight level\s+(\d)\s+(\d)\b/gi, 'FL$1$20')
            .replace(/\bf l\s*(\d{2,3})\b/gi, 'FL$1');

        // Fix frequency transcriptions
        corrected = corrected
            .replace(/\bone\s+two\s+one\s+decimal\s+five\b/gi, '121.5')
            .replace(/\bone\s+one\s+eight\s+decimal\s+(\d+)\b/gi, '118.$1')
            .replace(/\bone\s+two\s+(\d)\s+decimal\s+(\d+)\b/gi, '12$1.$2')
            .replace(/\bone\s+three\s+(\d)\s+decimal\s+(\d+)\b/gi, '13$1.$2');

        // Fix squawk codes
        corrected = corrected
            .replace(/\bsquawk\s+(\d)\s+(\d)\s+(\d)\s+(\d)\b/gi, 'squawk $1$2$3$4');

        // Fix runway numbers
        corrected = corrected
            .replace(/\brunway\s+(\d)\s+(\d)\s*(left|right|center)?\b/gi,
                (m, d1, d2, side) => `runway ${d1}${d2}${side ? ' ' + side : ''}`);

        // Fix heading calls
        corrected = corrected
            .replace(/\bheading\s+(\d)\s+(\d)\s+(\d)\b/gi, 'heading $1$2$3');

        return corrected;
    }

    shutdown() {
        if (this.freeProvider && this.freeProvider.shutdown) {
            this.freeProvider.shutdown();
        }
    }
}

module.exports = { SttProvider };
