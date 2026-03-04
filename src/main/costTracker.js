const EventEmitter = require('events');

/**
 * Session Cost Tracker
 * Tracks API usage and calculates running costs in USD for paid providers.
 */

const PRICING = {
    stt_per_minute: 0.006,           // OpenAI Whisper API
    llm_gpt4o_input_per_1m: 2.50,   // GPT-4o input tokens
    llm_gpt4o_output_per_1m: 10.00, // GPT-4o output tokens
    llm_mini_input_per_1m: 0.60,    // GPT-4o-mini input tokens
    llm_mini_output_per_1m: 2.40,   // GPT-4o-mini output tokens
    tts_standard_per_1m: 15.00,     // OpenAI TTS standard per 1M chars
    tts_hd_per_1m: 30.00,           // OpenAI TTS HD per 1M chars
};

class CostTracker extends EventEmitter {
    constructor(store) {
        super();
        this.store = store;
        this.reset();
    }

    reset() {
        this.usage = {
            stt: { seconds: 0, calls: 0 },
            llm: {
                gpt4o: { inputTokens: 0, outputTokens: 0, calls: 0 },
                mini: { inputTokens: 0, outputTokens: 0, calls: 0 },
            },
            tts: { characters: 0, calls: 0, quality: 'standard' },
        };
        this.sessionStart = Date.now();
        this.emitUpdate();
    }

    trackStt(durationSeconds) {
        this.usage.stt.seconds += durationSeconds;
        this.usage.stt.calls += 1;
        this.emitUpdate();
    }

    trackLlm(model, inputTokens, outputTokens) {
        const tier = model.includes('mini') ? 'mini' : 'gpt4o';
        this.usage.llm[tier].inputTokens += inputTokens;
        this.usage.llm[tier].outputTokens += outputTokens;
        this.usage.llm[tier].calls += 1;
        this.emitUpdate();
    }

    trackTts(characters, quality = 'standard') {
        this.usage.tts.characters += characters;
        this.usage.tts.calls += 1;
        this.usage.tts.quality = quality;
        this.emitUpdate();
    }

    calculateCosts() {
        const sttCost = (this.usage.stt.seconds / 60) * PRICING.stt_per_minute;

        const llm4oCost =
            (this.usage.llm.gpt4o.inputTokens / 1_000_000) * PRICING.llm_gpt4o_input_per_1m +
            (this.usage.llm.gpt4o.outputTokens / 1_000_000) * PRICING.llm_gpt4o_output_per_1m;

        const llmMiniCost =
            (this.usage.llm.mini.inputTokens / 1_000_000) * PRICING.llm_mini_input_per_1m +
            (this.usage.llm.mini.outputTokens / 1_000_000) * PRICING.llm_mini_output_per_1m;

        const ttsRate = this.usage.tts.quality === 'hd' ? PRICING.tts_hd_per_1m : PRICING.tts_standard_per_1m;
        const ttsCost = (this.usage.tts.characters / 1_000_000) * ttsRate;

        return {
            stt: sttCost,
            llm: llm4oCost + llmMiniCost,
            llmDetail: { gpt4o: llm4oCost, mini: llmMiniCost },
            tts: ttsCost,
            total: sttCost + llm4oCost + llmMiniCost + ttsCost,
        };
    }

    getSummary() {
        return {
            usage: this.usage,
            costs: this.calculateCosts(),
            sessionStart: this.sessionStart,
            sessionDuration: Date.now() - this.sessionStart,
        };
    }

    emitUpdate() {
        this.emit('update', this.getSummary());
    }
}

module.exports = { CostTracker, PRICING };
