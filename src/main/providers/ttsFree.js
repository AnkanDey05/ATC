const path = require('path');
const os = require('os');
const fs = require('fs');

/**
 * TTS Free — Microsoft Edge TTS via edge-tts-universal npm package
 * Completely free, no API key needed.
 * Supports regional accent voices for controller realism.
 */

// B2: Regional accent voice mappings
const REGIONAL_VOICES = {
    us: {
        male: ['en-US-GuyNeural', 'en-US-DavisNeural', 'en-US-AndrewNeural', 'en-US-BrianNeural', 'en-US-EricNeural', 'en-US-RogerNeural', 'en-US-TonyNeural', 'en-US-ChristopherNeural'],
        female: ['en-US-JennyNeural'],
    },
    gb: {
        male: ['en-GB-RyanNeural'],
        female: ['en-GB-SoniaNeural'],
    },
    au: {
        male: ['en-AU-WilliamNeural'],
        female: ['en-AU-NatashaNeural'],
    },
    ie: {
        male: ['en-IE-ConnorNeural'],
        female: ['en-IE-EmilyNeural'],
    },
    in: {
        male: ['en-IN-PrabhatNeural'],
        female: ['en-IN-NeerjaNeural'],
    },
    za: {
        male: ['en-ZA-LukeNeural'],
        female: [],
    },
    ca: {
        male: ['en-CA-LiamNeural'],
        female: ['en-CA-ClaraNeural'],
    },
};

const ALL_REGIONS = Object.keys(REGIONAL_VOICES).filter(r => r !== 'us');

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
     * B2: Resolve a US base voice to a regional accent voice.
     * @param {string} baseVoice - The US Edge TTS voice name
     * @param {string} region - Region code (us, gb, au, ie, in, za, ca, mixed)
     * @returns {string} - The resolved regional voice name
     */
    resolveVoice(baseVoice, region) {
        if (!region || region === 'us') return baseVoice;

        // Determine if the base voice is male or female
        const isFemale = ['en-US-JennyNeural'].includes(baseVoice);

        if (region === 'mixed') {
            // Deterministic "random" region based on voice name hash for station consistency
            let hash = 0;
            for (let i = 0; i < baseVoice.length; i++) {
                hash = ((hash << 5) - hash) + baseVoice.charCodeAt(i);
                hash |= 0;
            }
            const regionIdx = Math.abs(hash) % ALL_REGIONS.length;
            region = ALL_REGIONS[regionIdx];
        }

        const voices = REGIONAL_VOICES[region];
        if (!voices) return baseVoice;

        const pool = isFemale ? (voices.female.length > 0 ? voices.female : voices.male) : voices.male;
        if (pool.length === 0) return baseVoice;

        // Pick deterministically from pool based on base voice name
        let hash = 0;
        for (let i = 0; i < baseVoice.length; i++) {
            hash = ((hash << 5) - hash) + baseVoice.charCodeAt(i);
            hash |= 0;
        }
        return pool[Math.abs(hash) % pool.length];
    }

    /**
     * Synthesize text using Edge TTS
     * @param {string} text - Text to speak
     * @param {string} voice - Edge TTS voice name (e.g., 'en-US-GuyNeural')
     * @param {string} [region] - Optional region override (us, gb, au, ie, in, za, ca, mixed)
     * @returns {Buffer} - MP3 audio data
     */
    async synthesize(text, voice = 'en-US-GuyNeural', region) {
        // B2: Resolve regional accent
        const resolvedVoice = region ? this.resolveVoice(voice, region) : voice;

        try {
            const mod = await this.getMod();
            const communicate = new mod.Communicate(text, resolvedVoice);

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
            console.log(`[TTS Free] Generated ${audioBuffer.length} bytes (voice: ${resolvedVoice})`);
            return audioBuffer;
        } catch (err) {
            console.error('[TTS Free] Communicate error:', err.message);
            return null;
        }
    }
}

module.exports = { TtsFree };

