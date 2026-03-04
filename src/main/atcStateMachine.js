const EventEmitter = require('events');
const { ArtccManager } = require('./artcc');

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
// Diverse accents (UK, AU, IE, CA) + rate/pitch for clearly distinct voices
const STATION_VOICES = {
    // ATIS: Female US — automated, measured
    ATIS: { edgeVoice: 'en-US-JennyNeural', openaiVoice: 'shimmer', label: 'ATIS', rate: '-10%', pitch: '-2Hz' },
    // CLEARANCE: Male UK accent — immediately distinct from US Ground/Tower
    CLEARANCE: { edgeVoice: 'en-GB-RyanNeural', openaiVoice: 'alloy', label: 'Clearance', rate: '+0%', pitch: '+0Hz' },
    // GROUND DEP: Male Australian — lower pitch, faster
    GROUND_DEP: { edgeVoice: 'en-AU-WilliamNeural', openaiVoice: 'fable', label: 'Ground', rate: '+8%', pitch: '-8Hz' },
    // TOWER DEP: Male US — standard American tower voice
    TOWER_DEP: { edgeVoice: 'en-US-DavisNeural', openaiVoice: 'echo', label: 'Tower', rate: '+5%', pitch: '+3Hz' },
    // DEPARTURE: Female US — clearly different from Tower
    DEPARTURE: { edgeVoice: 'en-US-NancyNeural', openaiVoice: 'nova', label: 'Departure', rate: '+5%', pitch: '+0Hz' },
    // CENTER: Male Irish — very distinct for long en-route phase
    CENTER: { edgeVoice: 'en-IE-ConnorNeural', openaiVoice: 'onyx', label: 'Center', rate: '-5%', pitch: '-4Hz' },
    // APPROACH: Male US deeper voice — different from Tower
    APPROACH: { edgeVoice: 'en-US-BrianNeural', openaiVoice: 'onyx', label: 'Approach', rate: '+0%', pitch: '-6Hz' },
    // TOWER ARR: Male Canadian accent
    TOWER_ARR: { edgeVoice: 'en-CA-LiamNeural', openaiVoice: 'echo', label: 'Tower', rate: '+3%', pitch: '+0Hz' },
    // GROUND ARR: Female Australian — distinct from all others
    GROUND_ARR: { edgeVoice: 'en-AU-NatashaNeural', openaiVoice: 'nova', label: 'Ground', rate: '+5%', pitch: '+2Hz' },
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
        this.nearbyTraffic = [];
        this.phaseTimestamp = Date.now();

        // A3: Auto-respond mode (CENTER only)
        this.autoRespondMode = false;
        this._autoRespondTimeout = null;

        // A4: COM frequency change detection
        this._prevComFrequency = 0;

        // A5: TOD alert
        this.todAlerted = false;
        this.lastTodCheck = 0;

        // A6: ARTCC boundary detection
        this.artccManager = new ArtccManager();
        this._lastArtccCheck = 0;

        // B1: ATIS auto-broadcast on engine start
        this._prevEnginesRunning = false;
        this._atisBroadcasted = false;

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

    setTrafficData(aircraft) {
        this.nearbyTraffic = aircraft || [];
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
        const now = Date.now();

        // C2: Waypoint tracking
        this.checkWaypointProgress(simState);

        switch (this.currentPhase) {

            case PHASES.ATIS:
                // B1: Auto-broadcast ATIS when engines start
                if (!this._atisBroadcasted && this.flightPlan &&
                    simState.enginesRunning && !this._prevEnginesRunning) {
                    this._atisBroadcasted = true;
                    this.emit('broadcastAtis');
                }
                this._prevEnginesRunning = !!simState.enginesRunning;
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
                // A6: ARTCC boundary check every 60 seconds
                if (now - this._lastArtccCheck > 60000) {
                    this._lastArtccCheck = now;
                    const crossing = this.artccManager.checkBoundaryCrossing(
                        simState.latitude, simState.longitude
                    );
                    if (crossing) {
                        // Generate new controller for new sector
                        const newName = CONTROLLER_NAMES[Math.floor(Math.random() * CONTROLLER_NAMES.length)];
                        this.controllers.CENTER.name = newName;
                        this.controllers.CENTER.frequency = crossing.to.frequency;
                        this.controllers.CENTER.station = crossing.to.name;
                        this.conversationHistory = []; // New sector = new convo
                        this.emit('centerHandoff', {
                            from: crossing.from,
                            to: crossing.to,
                            controller: newName,
                        });
                        const callsign = this.flightPlan?.callsign || 'Aircraft';
                        this.emit('atcInitiated', {
                            text: `${callsign}, contact ${crossing.to.name} on ${crossing.to.frequency}, good day.`,
                        });
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

        // ── A4: COM frequency change detection ──────────────────
        const newComFreq = simState.comFrequency1 || 0;
        if (this._prevComFrequency && Math.abs(this._prevComFrequency - newComFreq) > 0.005) {
            const freqStr = newComFreq.toFixed(3);
            const matched = this.tuneToFrequency(freqStr);
            if (matched) {
                this.emit('autoTuned', { phase: matched, frequency: freqStr });
            }
        }
        this._prevComFrequency = newComFreq;

        // ── A5: TOD alert (CENTER phase only) ───────────────────
        if (this.currentPhase === 'CENTER' && (!this.lastTodCheck || now - this.lastTodCheck > 30000)) {
            this.lastTodCheck = now;
            const destElev = this.flightPlan?.destElevation || 0;
            const altToLose = simState.altitude - destElev;
            if (altToLose > 1000) {
                const todDistance = (altToLose / 1000) * 3; // nm needed
                const distToDest = this.calcDistanceToDestination(simState);
                if (!this.todAlerted && distToDest <= todDistance + 20 && distToDest > 0) {
                    this.todAlerted = true;
                    const nmToTod = Math.round(distToDest - todDistance);
                    this.emit('todApproaching', {
                        distance: nmToTod,
                        todDistance: Math.round(todDistance),
                    });
                    // Center proactively contacts pilot
                    const callsign = this.flightPlan?.callsign || 'Aircraft';
                    const todMessage = `${callsign}, top of descent in approximately ${Math.max(0, nmToTod)} miles. Expect descent clearance shortly.`;
                    this.emit('atcInitiated', { text: todMessage });
                }
            }
        }
    }

    /**
     * A3: Auto-respond mode — generate contextual pilot response during CENTER
     */
    triggerAutoRespond(atcMessage) {
        if (!this.autoRespondMode || this.currentPhase !== 'CENTER') return;
        if (this._autoRespondTimeout) clearTimeout(this._autoRespondTimeout);

        const delay = 3000 + Math.random() * 3000; // 3-6 seconds
        this._autoRespondTimeout = setTimeout(() => {
            if (!this.autoRespondMode || this.currentPhase !== 'CENTER') return;

            const callsign = this.flightPlan?.callsign || 'Aircraft';
            const currentFL = Math.round((this.lastSimState?.altitude || 0) / 100);
            const msg = atcMessage.toLowerCase();
            let response;

            if (/\b(climb|descend|proceed|turn|maintain heading)\b/.test(msg)) {
                response = `Wilco, ${callsign}`;
            } else if (/\b(direct|direct to)\b/.test(msg)) {
                // Extract waypoint name if possible
                const wpMatch = atcMessage.match(/direct\s+(?:to\s+)?(\w{2,5})/i);
                const wp = wpMatch ? wpMatch[1].toUpperCase() : 'DIRECT';
                response = `${callsign}, direct ${wp}, wilco`;
            } else if (/\b(position|say position|ident)\b/.test(msg)) {
                response = `${callsign}, maintaining FL${currentFL}`;
            } else {
                response = `Roger, ${callsign}`;
            }

            this.emit('autoRespondTriggered', { text: response });
            this._autoRespondTimeout = null;
        }, delay);
    }

    /**
     * C2: Check if aircraft has passed any waypoints
     */
    checkWaypointProgress(simState) {
        if (!this.flightPlan?.waypoints || !simState.latitude) return;

        const wps = this.flightPlan.waypoints;
        if (!this._passedWaypoints) this._passedWaypoints = new Set();

        for (const wp of wps) {
            if (this._passedWaypoints.has(wp.ident)) continue;
            if (!wp.lat || !wp.lon) continue;

            // Calculate distance to waypoint
            const dist = this.calcDistance(simState.latitude, simState.longitude, wp.lat, wp.lon);
            if (dist > 5) continue; // Must be within 5nm

            // Check if aircraft has passed waypoint (bearing > 90° off heading)
            const bearing = this.calcBearing(simState.latitude, simState.longitude, wp.lat, wp.lon);
            const diff = Math.abs(bearing - simState.heading);
            const normalizedDiff = diff > 180 ? 360 - diff : diff;
            if (normalizedDiff > 90) {
                this._passedWaypoints.add(wp.ident);
                this.emit('waypointPassed', {
                    ident: wp.ident,
                    passed: Array.from(this._passedWaypoints),
                    total: wps.length,
                });
            }
        }
    }

    calcDistance(lat1, lon1, lat2, lon2) {
        const R = 3440.065; // Earth radius in nm
        const dLat = (lat2 - lat1) * Math.PI / 180;
        const dLon = (lon2 - lon1) * Math.PI / 180;
        const a = Math.sin(dLat / 2) ** 2 +
            Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
            Math.sin(dLon / 2) ** 2;
        return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    }

    calcBearing(lat1, lon1, lat2, lon2) {
        const dLon = (lon2 - lon1) * Math.PI / 180;
        const y = Math.sin(dLon) * Math.cos(lat2 * Math.PI / 180);
        const x = Math.cos(lat1 * Math.PI / 180) * Math.sin(lat2 * Math.PI / 180) -
            Math.sin(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.cos(dLon);
        return ((Math.atan2(y, x) * 180 / Math.PI) + 360) % 360;
    }

    getPassedWaypoints() {
        return Array.from(this._passedWaypoints || []);
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
            traffic: this.nearbyTraffic || [],
        });

        // Prepend flexible callsign enforcement (Bug #2 fix)
        const callsign = this.flightPlan?.callsign;
        let callsignLock;

        if (callsign) {
            // Derive all legitimate abbreviated forms
            const numericOnly = callsign.replace(/[^0-9]/g, '');
            const alphaNumeric = callsign.replace(/[^A-Z0-9]/gi, '');

            // Phonetic spelling of alphanumeric (for voice readbacks)
            const NATO = {
                A: 'Alpha', B: 'Bravo', C: 'Charlie', D: 'Delta', E: 'Echo', F: 'Foxtrot',
                G: 'Golf', H: 'Hotel', I: 'India', J: 'Juliet', K: 'Kilo', L: 'Lima',
                M: 'Mike', N: 'November', O: 'Oscar', P: 'Papa', Q: 'Quebec', R: 'Romeo',
                S: 'Sierra', T: 'Tango', U: 'Uniform', V: 'Victor', W: 'Whiskey',
                X: 'Xray', Y: 'Yankee', Z: 'Zulu'
            };
            const phoneticCallsign = alphaNumeric.split('').map(c =>
                /[A-Z]/i.test(c) ? (NATO[c.toUpperCase()] || c) : c
            ).join(' ');

            callsignLock = `CALLSIGN RULES:
The aircraft on this frequency has filed callsign: "${callsign}".
You MUST accept ALL of these as valid from the same pilot:
  - Full callsign: "${callsign}"
  - Alphanumeric short form: "${alphaNumeric}"
  - Numeric only: "${numericOnly}"
  - Phonetic spoken form: "${phoneticCallsign}"
  - Any reasonable phonetic/spoken variation of the above

On FIRST contact from this aircraft on a NEW frequency: expect full callsign.
On SUBSEQUENT calls on same frequency: abbreviated form is correct and expected.
NEVER challenge abbreviations of the correct callsign — this is normal aviation practice.
ONLY challenge completely unrecognized callsigns that share NO digits with "${callsign}".

`;
        } else {
            callsignLock = `NO CALLSIGN ON FILE. Ask any calling station to identify themselves and state intentions.\n\n`;
        }

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
