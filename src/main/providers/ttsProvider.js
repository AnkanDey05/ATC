/**
 * TTS Provider Abstraction
 * Routes synthesis to free (Edge TTS), paid (OpenAI TTS), or premium (ElevenLabs).
 */
class TtsProvider {
    constructor(store, costTracker) {
        this.store = store;
        this.costTracker = costTracker;
        this.config = store.get('providerConfig.tts');
        this.freeProvider = null;
        this.paidProvider = null;
        this.premiumProvider = null;

        // Cache for common phrases
        this.phraseCache = new Map();
    }

    updateConfig(config) {
        this.config = config;
    }

    updateApiKeys(keys) {
        this.paidProvider = null;
        this.premiumProvider = null;
    }

    getFreeProvider() {
        if (!this.freeProvider) {
            const { TtsFree } = require('./ttsFree');
            this.freeProvider = new TtsFree();
        }
        return this.freeProvider;
    }

    getPaidProvider() {
        if (!this.paidProvider) {
            const { TtsPaid } = require('./ttsPaid');
            const apiKey = this.store.get('apiKeys.openai');
            this.paidProvider = new TtsPaid(apiKey, this.config.paidQuality || 'standard');
        }
        return this.paidProvider;
    }

    getPremiumProvider() {
        if (!this.premiumProvider) {
            const { TtsPremium } = require('./ttsPremium');
            const apiKey = this.store.get('apiKeys.elevenLabs');
            this.premiumProvider = new TtsPremium(apiKey);
        }
        return this.premiumProvider;
    }

    /**
     * Sanitize text for TTS — fix callsigns, scientific notation, etc.
     */
    sanitizeForTts(text) {
        if (!text) return text;

        // Fix airline codes with letters that TTS reads as math (6E → Six Echo)
        // Pattern: digit followed by single letter at word boundary
        const NATO = {
            'A': 'Alpha', 'B': 'Bravo', 'C': 'Charlie', 'D': 'Delta',
            'E': 'Echo', 'F': 'Foxtrot', 'G': 'Golf', 'H': 'Hotel',
            'I': 'India', 'J': 'Juliet', 'K': 'Kilo', 'L': 'Lima',
            'M': 'Mike', 'N': 'November', 'O': 'Oscar', 'P': 'Papa',
            'Q': 'Quebec', 'R': 'Romeo', 'S': 'Sierra', 'T': 'Tango',
            'U': 'Uniform', 'V': 'Victor', 'W': 'Whiskey', 'X': 'X-ray',
            'Y': 'Yankee', 'Z': 'Zulu',
        };

        // Replace patterns like "6E123" with "6 Echo 1 2 3"
        let sanitized = text.replace(/\b(\d)([A-Z])(\d+)\b/g, (_, d, letter, nums) => {
            const phonetic = NATO[letter] || letter;
            const spokenNums = nums.split('').join(' ');
            return `${d} ${phonetic} ${spokenNums}`;
        });

        // Replace standalone patterns like "6E" with "6 Echo"
        sanitized = sanitized.replace(/\b(\d+)([A-Z])\b/g, (_, nums, letter) => {
            const phonetic = NATO[letter] || letter;
            return `${nums} ${phonetic}`;
        });

        return sanitized;
    }

    /**
     * Synthesize text to audio buffer.
     * @param {string} text - Text to synthesize
     * @param {object} voiceConfig - Voice configuration from station { edgeVoice, openaiVoice }
     * @returns {Buffer|null} - Audio buffer or null on failure
     */
    async synthesize(text, voiceConfig) {
        if (!text || !voiceConfig) return null;

        // Sanitize text for TTS pronunciation
        const cleanText = this.sanitizeForTts(text);

        // Check phrase cache first
        const cacheKey = `${this.config.provider}:${voiceConfig.label}:${cleanText}`;
        if (this.phraseCache.has(cacheKey)) {
            return this.phraseCache.get(cacheKey);
        }

        try {
            let audioBuffer;

            if (this.config.elevenLabsEnabled && this.config.provider !== 'free') {
                const provider = this.getPremiumProvider();
                audioBuffer = await provider.synthesize(cleanText, voiceConfig.label);
            } else if (this.config.provider === 'paid') {
                const provider = this.getPaidProvider();
                audioBuffer = await provider.synthesize(cleanText, voiceConfig.openaiVoice);

                this.costTracker.trackTts(cleanText.length, this.config.paidQuality || 'standard');
            } else {
                const provider = this.getFreeProvider();
                const region = this.config.voiceRegion || 'us';
                // Pass rate and pitch from station voice config for distinctiveness
                const rate = voiceConfig.rate || '+0%';
                const pitch = voiceConfig.pitch || '+0Hz';
                audioBuffer = await provider.synthesize(cleanText, voiceConfig.edgeVoice, region, rate, pitch);
            }

            // Cache common short phrases
            const commonPhrases = ['Roger', 'Wilco', 'Say again', 'Stand by', 'Negative', 'Affirm'];
            if (commonPhrases.some(p => text.toLowerCase().includes(p.toLowerCase()))) {
                this.phraseCache.set(cacheKey, audioBuffer);
            }

            return audioBuffer;
        } catch (err) {
            console.error('[TTS] Synthesis error:', err.message);
            return null;
        }
    }
}

module.exports = { TtsProvider };
