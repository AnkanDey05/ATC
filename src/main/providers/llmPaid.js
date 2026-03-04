/**
 * LLM Paid — OpenAI GPT-4o / GPT-4o-mini
 */
class LlmPaid {
    constructor(apiKey) {
        this.apiKey = apiKey;
        this.client = null;
    }

    getClient() {
        if (!this.client && this.apiKey) {
            const OpenAI = require('openai');
            this.client = new OpenAI({ apiKey: this.apiKey });
        }
        return this.client;
    }

    async complete(systemPrompt, userMessage, history = [], model = 'gpt-4o') {
        const client = this.getClient();

        if (!client) {
            throw new Error('OpenAI API key not configured for LLM');
        }

        // Build message array
        const messages = [
            { role: 'system', content: systemPrompt },
            ...history.map(msg => ({
                role: msg.role,
                content: msg.content,
            })),
            { role: 'user', content: userMessage },
        ];

        const response = await client.chat.completions.create({
            model,
            messages,
            max_tokens: 500,
            temperature: 0.7,
        });

        const text = response.choices[0]?.message?.content || '';
        const usage = {
            inputTokens: response.usage?.prompt_tokens || 0,
            outputTokens: response.usage?.completion_tokens || 0,
        };

        return { text, usage };
    }
}

module.exports = { LlmPaid };
