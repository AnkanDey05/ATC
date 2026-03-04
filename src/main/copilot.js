const EventEmitter = require('events');

/**
 * Copilot — AI-driven pilot that auto-responds to ATC.
 * When enabled, generates correct pilot readbacks/responses automatically.
 */
class Copilot extends EventEmitter {
    constructor(atcStateMachine, llmProvider) {
        super();
        this.atcMachine = atcStateMachine;
        this.llmProvider = llmProvider;
        this.enabled = false;
        this.autoHandoffEnabled = true;
        this._pendingTimeout = null;
    }

    enable() {
        this.enabled = true;
        this.emit('statusChange', { enabled: true });
    }

    disable() {
        this.enabled = false;
        if (this._pendingTimeout) {
            clearTimeout(this._pendingTimeout);
            this._pendingTimeout = null;
        }
        this.emit('statusChange', { enabled: false });
    }

    isEnabled() { return this.enabled; }

    /**
     * Generate the correct pilot response for current context.
     */
    async generatePilotResponse(atcMessage, flightPlan, simState) {
        const callsign = flightPlan?.callsign || 'Unknown';
        const aircraft = flightPlan?.aircraftType || 'Unknown';
        const alt = simState?.altitude || 0;
        const spd = simState?.indicatedAirspeed || 0;

        const systemPrompt = `You are the pilot of aircraft ${callsign} (${aircraft}).
You just received this ATC transmission: "${atcMessage}"

Generate ONLY the correct pilot readback or response in standard ICAO phraseology.
Rules:
- Include your callsign at the END of every readback.
- Be brief: 1 sentence maximum. Real radio brevity.
- Read back all altitudes, headings, frequencies, and squawk codes.
- For taxi clearances, read back the route and hold-short point.
- For "roger" situations (traffic advisories, information), just say "Roger, ${callsign}."
- For takeoff/landing clearances, read back the runway: "Cleared for takeoff runway two seven, ${callsign}."
- Respond ONLY with the pilot transmission text. No quotes, no commentary.
Current altitude: ${alt}ft. Speed: ${spd}kts.`;

        const result = await this.llmProvider.complete(systemPrompt, atcMessage, [], 'COPILOT');
        return result;
    }

    /**
     * Handle an ATC response — if copilot is enabled, auto-respond after delay.
     */
    scheduleAutoResponse(atcMessage, flightPlan, simState, callback) {
        if (!this.enabled) return;

        // Random 2-4 second delay (simulate pilot thinking time)
        const delay = 2000 + Math.random() * 2000;

        this._pendingTimeout = setTimeout(async () => {
            try {
                const pilotResponse = await this.generatePilotResponse(atcMessage, flightPlan, simState);
                if (pilotResponse && this.enabled) {
                    this.emit('pilotResponse', { text: pilotResponse, auto: true });
                    if (callback) callback(pilotResponse);
                }
            } catch (err) {
                console.error('[Copilot] Auto-response error:', err.message);
            }
            this._pendingTimeout = null;
        }, delay);
    }
}

module.exports = { Copilot };
