/**
 * LLM Free — Groq (llama-3.3-70b-versatile)
 * Free tier: 30 req/min, 14,400 req/day
 * Extremely fast inference (~200ms TTFT)
 */
const Groq = require('groq-sdk');

class LlmFree {
    constructor(apiKey) {
        this.apiKey = apiKey;
        this.client = null;
    }

    getClient() {
        if (!this.client && this.apiKey) {
            this.client = new Groq({ apiKey: this.apiKey });
        }
        return this.client;
    }

    async complete(systemPrompt, userMessage, history = []) {
        const client = this.getClient();

        if (!client) {
            throw new Error('Groq API key not configured');
        }

        // Build messages array
        const messages = [
            { role: 'system', content: systemPrompt },
            ...history,
            { role: 'user', content: userMessage },
        ];

        const chatCompletion = await client.chat.completions.create({
            model: 'llama-3.3-70b-versatile',
            messages,
            temperature: 0.7,
            max_tokens: 512,
        });

        const text = chatCompletion.choices[0]?.message?.content || 'Stand by.';

        return { text };
    }
}

module.exports = { LlmFree };
