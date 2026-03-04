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

        // Build aviation context for STT — dramatically improves accuracy
        const callsign = this.flightPlan?.callsign || '';
        const origin = this.flightPlan?.origin || '';
        const destination = this.flightPlan?.destination || '';
        const aircraftType = this.flightPlan?.aircraftType || '';
        const aviationContext = { callsign, origin, destination, aircraftType };

        let result = await provider.transcribe(audioBuffer, aviationContext);
        const duration = (Date.now() - startTime) / 1000;

        if (this.config.provider === 'paid') {
            const audioDuration = audioBuffer.length / (16000 * 1 * 2);
            this.costTracker.trackStt(audioDuration);
        }

        // Post-process with context
        result = this.postProcessTranscript(result, aviationContext);
        return result;
    }

    /**
     * A7: Smart readback fallback correction
     * Fixes common STT garbling of aviation terms.
     */
    postProcessTranscript(text, ctx = {}) {
        if (!text) return text;
        let corrected = text.trim();
        const callsign = ctx.callsign || this.flightPlan?.callsign || '';

        // Callsign fuzzy correction — match partial forms too
        if (callsign) {
            const numericPart = callsign.replace(/[^0-9]/g, ''); // e.g. "342" from "6E342"
            const alphaNumPart = callsign.replace(/[^A-Z0-9]/gi, ''); // "6E342"

            // Build variants: digit-spaced forms Whisper commonly produces
            const spacedNumeric = numericPart.split('').join(' '); // "3 4 2"
            const spacedAlphaNum = alphaNumPart.split('').join(' '); // "6 E 3 4 2"

            const variants = [
                spacedAlphaNum,
                spacedNumeric,
                alphaNumPart.toLowerCase(),
                numericPart,
            ].filter(Boolean);

            for (const variant of variants) {
                const regex = new RegExp(variant.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi');
                if (regex.test(corrected)) {
                    corrected = corrected.replace(regex, callsign);
                    break;
                }
            }
        }

        // Standard aviation corrections + common mishear fixes
        corrected = corrected
            .replace(/\bflight level\s+(\d)\s+(\d)\s+(\d)\b/gi, 'FL$1$2$3')
            .replace(/\bflight level\s+(\d)\s+(\d)\b/gi, 'FL$1$20')
            .replace(/\bf\s*l\s*([\d]+)\b/gi, 'FL$1')
            .replace(/\bone\s+two\s+one\s+decimal\s+five\b/gi, '121.5')
            .replace(/\bone\s+one\s+eight\s+decimal\s+(\d+)\b/gi, '118.$1')
            .replace(/\bone\s+two\s+(\d)\s+decimal\s+(\d+)\b/gi, '12$1.$2')
            .replace(/\bone\s+three\s+(\d)\s+decimal\s+(\d+)\b/gi, '13$1.$2')
            .replace(/\bsquawk\s+(\d)\s+(\d)\s+(\d)\s+(\d)\b/gi, 'squawk $1$2$3$4')
            .replace(/\brunway\s+(\d)\s+(\d)\s*(left|right|center)?\b/gi,
                (m, d1, d2, side) => `runway ${d1}${d2}${side ? ' ' + side : ''}`)
            .replace(/\bheading\s+(\d)\s+(\d)\s+(\d)\b/gi, 'heading $1$2$3')
            // Fix "hold short" / "whole short" common mishear
            .replace(/\bwhole\s+short\b/gi, 'hold short')
            .replace(/\bhold\s+shirt\b/gi, 'hold short')
            // Fix "taxi" mishears
            .replace(/\btaxi\s+too\b/gi, 'taxi to')
            .replace(/\btaxiway\s+alpha\b/gi, 'taxiway Alpha')
            // Fix "maintain" mishears
            .replace(/\bmen\s+tain\b/gi, 'maintain')
            .replace(/\bcontain\b/gi, 'maintain')
            // Fix word splitting
            .replace(/\brun\s+way\b/gi, 'runway')
            .replace(/\bclear\s+ants\b/gi, 'clearance')
            .replace(/\bdep\s+archer\b/gi, 'departure')
            .replace(/\ba\s+pro\s+ch\b/gi, 'approach');

        return corrected;
    }

    shutdown() {
        if (this.freeProvider && this.freeProvider.shutdown) {
            this.freeProvider.shutdown();
        }
    }
}

module.exports = { SttProvider };
