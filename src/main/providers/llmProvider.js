/**
 * LLM Provider Abstraction
 * Routes completions to free (Gemini Flash) or paid (GPT-4o / GPT-4o-mini).
 */

// Phases that use the more capable model in auto mode
const COMPLEX_PHASES = ['CLEARANCE', 'DEPARTURE', 'CENTER', 'APPROACH'];

class LlmProvider {
    constructor(store, costTracker) {
        this.store = store;
        this.costTracker = costTracker;
        this.config = store.get('providerConfig.llm');
        this.freeProvider = null;
        this.paidProvider = null;
    }

    updateConfig(config) {
        this.config = config;
    }

    updateApiKeys(keys) {
        // Force re-init on key change
        this.freeProvider = null;
        this.paidProvider = null;
    }

    getFreeProvider() {
        if (!this.freeProvider) {
            const { LlmFree } = require('./llmFree');
            const apiKey = this.store.get('apiKeys.groq');
            this.freeProvider = new LlmFree(apiKey);
        }
        return this.freeProvider;
    }

    getPaidProvider() {
        if (!this.paidProvider) {
            const { LlmPaid } = require('./llmPaid');
            const apiKey = this.store.get('apiKeys.openai');
            this.paidProvider = new LlmPaid(apiKey);
        }
        return this.paidProvider;
    }

    /**
     * Complete a prompt with the configured LLM provider.
     * @param {string} systemPrompt - The ATC system prompt for the current phase
     * @param {string} userMessage - The pilot's message
     * @param {Array} history - Conversation history
     * @param {string} phase - Current ATC phase (for auto model selection)
     */
    async complete(systemPrompt, userMessage, history = [], phase = '') {
        const phraseologyRules = `CRITICAL RULES — YOU MUST FOLLOW THESE WITHOUT EXCEPTION:

IDENTITY:
1. You are a REAL ATC controller at a busy airport. NOT an AI assistant. Never break character.
2. You are professional, assertive, and slightly impatient — like a real controller managing 20+ aircraft.
3. NEVER say "hello", "hi", "how can I help", or ANY greeting. Controllers don't greet pilots.

CALLSIGN ENFORCEMENT:
4. The pilot's callsign is defined in the system prompt. If a pilot uses a DIFFERENT callsign than what's on file, challenge them: "[Wrong callsign], negative, I have no flight plan for that callsign. Confirm you are [correct callsign]?"
5. Do NOT accept callsign changes mid-flight. The callsign is fixed from the flight plan.
6. If no callsign is on file and the pilot calls in, respond: "Station calling [facility], say callsign and intentions."

RADIO DISCIPLINE:
7. Start EVERY response with the pilot's callsign.
8. ONE transmission only. 1 to 3 sentences MAXIMUM. Real radio brevity.
9. If you don't understand: "[Callsign], say again."
10. End every transmission with the callsign or your facility name.
11. Respond ONLY with the ATC radio transmission text. No quotes, no commentary, no meta-text.

PHRASEOLOGY:
12. Numbers: FL350 = "Flight Level Three Five Zero". Altitudes below FL180 as full numbers ("climb and maintain eight thousand"). Runways spelled out ("Runway Two Seven Left"). Speeds in knots.

BEHAVIOR:
13. Do NOT blindly comply with every request. If the pilot asks for something unreasonable, deny it: "[Callsign], unable, [reason]."
14. If the pilot makes incorrect readbacks, correct them firmly: "[Callsign], negative, I said [correction]. Read back."
15. If the pilot seems confused, give CLEAR, DIRECT instructions. Don't ask what they want — tell them what to do.
16. Never respond to frequency changes, goodbyes, or non-ATC chatter. Silence is correct.`;

        const fullSystemPrompt = `${phraseologyRules}\n\n${systemPrompt}`;

        if (this.config.provider === 'paid') {
            const provider = this.getPaidProvider();
            const model = this.selectModel(phase);
            const result = await provider.complete(fullSystemPrompt, userMessage, history, model);

            // Track costs
            if (result.usage) {
                this.costTracker.trackLlm(model, result.usage.inputTokens, result.usage.outputTokens);
            }

            return result.text;
        } else {
            const provider = this.getFreeProvider();
            const result = await provider.complete(fullSystemPrompt, userMessage, history);
            return result.text;
        }
    }

    selectModel(phase) {
        const tier = this.config.paidTier || 'auto';

        if (tier === 'gpt4o') return 'gpt-4o';
        if (tier === 'gpt4o-mini') return 'gpt-4o-mini';

        // Auto mode: use GPT-4o for complex phases, mini for simple ones
        return COMPLEX_PHASES.includes(phase) ? 'gpt-4o' : 'gpt-4o-mini';
    }
}

module.exports = { LlmProvider };
