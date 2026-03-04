const EventEmitter = require('events');

/**
 * ATC State Machine
 * Manages phase transitions through the full ATC lifecycle.
 */

const PHASES = {
    ATIS: 'ATIS',
    CLEARANCE: 'CLEARANCE',
    GROUND_DEP: 'GROUND_DEP',
    TOWER_DEP: 'TOWER_DEP',
    DEPARTURE: 'DEPARTURE',
    CENTER: 'CENTER',
    APPROACH: 'APPROACH',
    TOWER_ARR: 'TOWER_ARR',
    GROUND_ARR: 'GROUND_ARR',
};

// Typical ATC handoff sequence (departure)
const HANDOFF_MAP = {
    ATIS: 'CLEARANCE',
    CLEARANCE: 'GROUND_DEP',
    GROUND_DEP: 'TOWER_DEP',
    TOWER_DEP: 'DEPARTURE',
    DEPARTURE: 'CENTER',
    CENTER: 'APPROACH',
    APPROACH: 'TOWER_ARR',
    TOWER_ARR: 'GROUND_ARR',
    GROUND_ARR: null,
};

// Controller voice mappings — each station gets a UNIQUE voice for realism
const STATION_VOICES = {
    ATIS: { edgeVoice: 'en-US-JennyNeural', openaiVoice: 'shimmer', label: 'ATIS' },
    CLEARANCE: { edgeVoice: 'en-US-ChristopherNeural', openaiVoice: 'alloy', label: 'Clearance' },
    GROUND_DEP: { edgeVoice: 'en-US-GuyNeural', openaiVoice: 'fable', label: 'Ground' },
    TOWER_DEP: { edgeVoice: 'en-US-DavisNeural', openaiVoice: 'echo', label: 'Tower' },
    DEPARTURE: { edgeVoice: 'en-US-AndrewNeural', openaiVoice: 'onyx', label: 'Departure' },
    CENTER: { edgeVoice: 'en-US-BrianNeural', openaiVoice: 'nova', label: 'Center' },
    APPROACH: { edgeVoice: 'en-US-EricNeural', openaiVoice: 'onyx', label: 'Approach' },
    TOWER_ARR: { edgeVoice: 'en-US-RogerNeural', openaiVoice: 'echo', label: 'Tower' },
    GROUND_ARR: { edgeVoice: 'en-US-TonyNeural', openaiVoice: 'alloy', label: 'Ground' },
};

// Realistic controller first names
const CONTROLLER_NAMES = [
    'Mike', 'Dave', 'Steve', 'Chris', 'Tom', 'John', 'Pete', 'Dan', 'Jim', 'Rick',
    'Sarah', 'Lisa', 'Kim', 'Jen', 'Amy', 'Beth', 'Kate', 'Meg', 'Sue', 'Pat',
];

function randomControllerName() {
    return CONTROLLER_NAMES[Math.floor(Math.random() * CONTROLLER_NAMES.length)];
}

function generateFrequency() {
    const whole = 118 + Math.floor(Math.random() * 18); // 118-135
    const decimal = Math.floor(Math.random() * 100);
    return `${whole}.${decimal.toString().padStart(2, '0')}`;
}

class AtcStateMachine extends EventEmitter {
    constructor(store, simConnect, llmProvider, ttsProvider, weather, costTracker) {
        super();
        this.store = store;
        this.simConnect = simConnect;
        this.llmProvider = llmProvider;
        this.ttsProvider = ttsProvider;
        this.weather = weather;
        this.costTracker = costTracker;

        this.currentPhase = PHASES.ATIS;
        this.conversationHistory = [];
        this.controllers = {};
        this.flightPlan = null;
        this.weatherData = null;
        this.lastSimState = null;
        this.phaseTimestamp = Date.now();

        // Generate unique controllers for this session
        this.initControllers();
    }

    initControllers() {
        const usedNames = new Set();
        for (const phase of Object.keys(STATION_VOICES)) {
            let name;
            do {
                name = randomControllerName();
            } while (usedNames.has(name));
            usedNames.add(name);

            this.controllers[phase] = {
                name,
                frequency: generateFrequency(),
                voice: STATION_VOICES[phase],
            };
        }
    }

    setFlightPlan(plan) {
        this.flightPlan = plan;
    }

    setWeatherData(data) {
        this.weatherData = data;
    }

    getCurrentController() {
        return this.controllers[this.currentPhase] || null;
    }

    getNextPhase() {
        return HANDOFF_MAP[this.currentPhase] || null;
    }

    getNextController() {
        const next = this.getNextPhase();
        return next ? this.controllers[next] : null;
    }

    /**
     * Tune to a frequency — find which station matches and switch to it.
     * Returns the matched phase or null if no match.
     */
    tuneToFrequency(freq) {
        const normalizedFreq = parseFloat(freq).toFixed(2);
        for (const [phase, ctrl] of Object.entries(this.controllers)) {
            if (parseFloat(ctrl.frequency).toFixed(2) === normalizedFreq) {
                if (phase !== this.currentPhase) {
                    this.transitionTo(phase);
                }
                return phase;
            }
        }
        return null;
    }

    /**
     * Get all station info for the UI frequency list
     */
    getAllStations() {
        const stations = {};
        for (const [phase, ctrl] of Object.entries(this.controllers)) {
            stations[phase] = {
                name: ctrl.name,
                frequency: ctrl.frequency,
                station: ctrl.voice.label,
            };
        }
        return stations;
    }

    getPhaseInfo() {
        const controller = this.getCurrentController();
        return {
            phase: this.currentPhase,
            controller: controller ? {
                name: controller.name,
                frequency: controller.frequency,
                station: controller.voice.label,
            } : null,
            stations: this.getAllStations(),
            flightPlan: this.flightPlan,
            timestamp: this.phaseTimestamp,
        };
    }

    /**
     * Process SimConnect state and check for automatic phase transitions
     */
    processSimState(simState) {
        this.lastSimState = simState;
        const prev = this.currentPhase;

        switch (this.currentPhase) {

            case PHASES.ATIS:
                // ATIS → CLEARANCE via explicit pilot acknowledgment (IPC call)
                break;

            case PHASES.CLEARANCE:
                // CLEARANCE → GROUND via conversation (read-back complete)
                break;

            case PHASES.GROUND_DEP:
                // GROUND → TOWER when near hold-short point
                if (simState.onRunway) {
                    this.transitionTo(PHASES.TOWER_DEP);
                }
                break;

            case PHASES.TOWER_DEP:
                // TOWER → DEPARTURE after takeoff (gear up, positive climb, 30s delay)
                if (!simState.onGround && simState.gearPosition === 0 && simState.verticalSpeed > 100) {
                    setTimeout(() => {
                        if (this.currentPhase === PHASES.TOWER_DEP && !this.lastSimState.onGround) {
                            this.transitionTo(PHASES.DEPARTURE);
                        }
                    }, 30000);
                }
                break;

            case PHASES.DEPARTURE:
                // DEPARTURE → CENTER when above transition altitude and on route
                if (simState.altitude > 18000) {
                    this.transitionTo(PHASES.CENTER);
                }
                break;

            case PHASES.CENTER:
                // CENTER → APPROACH when within ~200nm of destination
                if (this.flightPlan && this.flightPlan.destination) {
                    const dist = this.calcDistanceToDestination(simState);
                    if (dist < 200 && simState.altitude < 25000) {
                        this.transitionTo(PHASES.APPROACH);
                    }
                }
                break;

            case PHASES.APPROACH:
                // APPROACH → TOWER_ARR when established on final (low alt, descending, gear down)
                if (simState.altitude < 4000 && simState.gearPosition === 1 && simState.verticalSpeed < -200) {
                    this.transitionTo(PHASES.TOWER_ARR);
                }
                break;

            case PHASES.TOWER_ARR:
                // TOWER_ARR → GROUND_ARR after touchdown and slowdown
                if (simState.onGround && simState.groundSpeed < 30) {
                    this.transitionTo(PHASES.GROUND_ARR);
                }
                break;

            case PHASES.GROUND_ARR:
                // GROUND_ARR → PARKED when stopped and parking brake set
                if (simState.onGround && simState.groundSpeed < 1 && simState.parkingBrake) {
                    this.transitionTo(PHASES.PARKED);
                }
                break;
        }
    }

    transitionTo(newPhase) {
        const oldPhase = this.currentPhase;
        this.currentPhase = newPhase;
        this.phaseTimestamp = Date.now();
        this.conversationHistory = []; // Reset conversation for new controller

        console.log(`[ATC] Phase transition: ${oldPhase} → ${newPhase}`);

        this.emit('phaseChange', {
            from: oldPhase,
            to: newPhase,
            controller: this.getCurrentController(),
            timestamp: this.phaseTimestamp,
        });
    }

    /**
     * Force transition — used by manual controls or conversation logic
     */
    forceTransition(targetPhase) {
        if (PHASES[targetPhase]) {
            this.transitionTo(targetPhase);
        }
    }

    calcDistanceToDestination(simState) {
        if (!this.flightPlan || !this.flightPlan.destLat || !this.flightPlan.destLon) {
            return Infinity;
        }
        // Haversine formula (approximate nautical miles)
        const R = 3440.065; // Earth radius in nm
        const dLat = (this.flightPlan.destLat - simState.latitude) * Math.PI / 180;
        const dLon = (this.flightPlan.destLon - simState.longitude) * Math.PI / 180;
        const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
            Math.cos(simState.latitude * Math.PI / 180) * Math.cos(this.flightPlan.destLat * Math.PI / 180) *
            Math.sin(dLon / 2) * Math.sin(dLon / 2);
        const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
        return R * c;
    }

    /**
     * Get system prompt for current ATC phase
     */
    getSystemPrompt() {
        const promptGenerators = {
            ATIS: require('../prompts/atis'),
            CLEARANCE: require('../prompts/clearance'),
            GROUND_DEP: require('../prompts/ground'),
            TOWER_DEP: require('../prompts/towerDep'),
            DEPARTURE: require('../prompts/departure'),
            CENTER: require('../prompts/center'),
            APPROACH: require('../prompts/approach'),
            TOWER_ARR: require('../prompts/towerArr'),
            GROUND_ARR: require('../prompts/groundArr'),
        };

        const generator = promptGenerators[this.currentPhase];
        if (!generator) return null;

        const controller = this.getCurrentController();
        const nextCtrl = this.getNextController();
        const basePrompt = generator({
            controllerName: controller ? `${controller.voice.label}, ${controller.name}` : 'Controller',
            frequency: controller ? controller.frequency : '121.5',
            // The NEXT station's frequency — for handoff instructions
            handoffStation: nextCtrl ? nextCtrl.voice.label : null,
            handoffFrequency: nextCtrl ? nextCtrl.frequency : null,
            flightPlan: this.flightPlan || {},
            weather: this.weatherData || {},
            simState: this.lastSimState || {},
        });

        // Prepend callsign enforcement
        const callsign = this.flightPlan?.callsign;
        const callsignLock = callsign
            ? `AUTHORIZED CALLSIGN: "${callsign}". This is the ONLY callsign you should accept. If a pilot identifies with a different callsign, challenge them and do NOT provide service.\n\n`
            : `NO CALLSIGN ON FILE. Ask any calling station to identify themselves.\n\n`;

        return callsignLock + basePrompt;
    }

    /**
     * Process pilot message through the ATC AI pipeline
     */
    async processMessage(pilotMessage) {
        const systemPrompt = this.getSystemPrompt();
        if (!systemPrompt) {
            return { text: 'Stand by.', phase: this.currentPhase };
        }

        try {
            const response = await this.llmProvider.complete(
                systemPrompt,
                pilotMessage,
                this.conversationHistory,
                this.currentPhase
            );

            // Store in conversation history
            this.conversationHistory.push(
                { role: 'user', content: pilotMessage },
                { role: 'assistant', content: response }
            );

            // Keep history manageable (last 20 messages)
            if (this.conversationHistory.length > 20) {
                this.conversationHistory = this.conversationHistory.slice(-20);
            }

            return {
                text: response,
                phase: this.currentPhase,
                controller: this.getCurrentController(),
            };
        } catch (err) {
            console.error('[ATC] LLM error:', err.message);
            return { text: 'Stand by.', phase: this.currentPhase, error: err.message };
        }
    }
}

module.exports = { AtcStateMachine, PHASES, STATION_VOICES };
