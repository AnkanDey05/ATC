const EventEmitter = require('events');

/**
 * SimConnect Manager
 * Handles connection to MSFS via node-simconnect and polls SimVars.
 * Falls back gracefully when MSFS is not running.
 */
class SimConnectManager extends EventEmitter {
    constructor() {
        super();
        this.connected = false;
        this.handle = null;
        this.pollInterval = null;
        this.reconnectInterval = null;
        this.mockMode = false;
        this.state = this.getDefaultState();

        // SimConnect data definition IDs
        this.DATA_DEF_ID = 0;
        this.REQUEST_ID = 0;

        // Traffic scanning
        this.TRAFFIC_DEF_ID = 1;
        this.TRAFFIC_REQ_ID = 1;
        this.nearbyAircraft = [];
        this.lastTrafficScan = 0;
    }

    getDefaultState() {
        return {
            latitude: 0,
            longitude: 0,
            altitude: 0,
            indicatedAirspeed: 0,
            verticalSpeed: 0,
            heading: 0,
            gearPosition: 0,
            flapsIndex: 0,
            onGround: true,
            onRunway: false,
            transponderCode: 1200,
            comFrequency1: 118.0,
            comFrequency2: 121.5,
            navFrequency1: 0,
            callsign: '',
            aircraftType: '',
            windVelocity: 0,
            windDirection: 0,
            temperature: 15,
            barometer: 29.92,
            enginesRunning: false,
            parkingBrake: true,
            groundSpeed: 0,
            timestamp: Date.now(),
        };
    }

    startConnectionLoop() {
        this.tryConnect();
        this.reconnectInterval = setInterval(() => {
            if (!this.connected) {
                this.tryConnect();
            }
        }, 5000);
    }

    async tryConnect() {
        try {
            const { open, Protocol } = require('node-simconnect');

            const { recvOpen, handle } = await open('MSFS ATC', Protocol.KittyHawk);
            console.log('[SimConnect] Connected to:', recvOpen.applicationName);

            this.handle = handle;
            this.connected = true;
            this.mockMode = false;
            this.emit('connectionStatus', { connected: true, mock: false });

            // Set up event listeners
            handle.on('close', () => {
                console.log('[SimConnect] Connection closed');
                this.connected = false;
                this.handle = null;
                this.emit('connectionStatus', { connected: false, mock: false });
            });

            handle.on('quit', () => {
                console.log('[SimConnect] Simulator quit');
                this.connected = false;
                this.handle = null;
                this.emit('connectionStatus', { connected: false, mock: false });
            });

            handle.on('exception', (e) => {
                console.error('[SimConnect] Exception:', e);
            });

            // Register data definitions
            this.registerDataDefinitions(handle);

            // Start polling
            this.startPolling();

        } catch (err) {
            if (!this.mockMode) {
                this.mockMode = false;
                this.connected = false;
                this.emit('connectionStatus', { connected: false, mock: false });
                console.log('[SimConnect] Not available:', err.message);
            }
        }
    }

    registerDataDefinitions(handle) {
        const { SimConnectDataType } = require('node-simconnect');

        const vars = [
            ['PLANE LATITUDE', 'degrees', SimConnectDataType.FLOAT64],
            ['PLANE LONGITUDE', 'degrees', SimConnectDataType.FLOAT64],
            ['PLANE ALTITUDE', 'feet', SimConnectDataType.FLOAT64],
            ['AIRSPEED INDICATED', 'knots', SimConnectDataType.FLOAT64],
            ['VERTICAL SPEED', 'feet per minute', SimConnectDataType.FLOAT64],
            ['PLANE HEADING DEGREES MAGNETIC', 'degrees', SimConnectDataType.FLOAT64],
            ['GEAR HANDLE POSITION', 'bool', SimConnectDataType.INT32],
            ['FLAPS HANDLE INDEX', 'number', SimConnectDataType.INT32],
            ['SIM ON GROUND', 'bool', SimConnectDataType.INT32],
            ['TRANSPONDER CODE:1', 'number', SimConnectDataType.INT32],
            ['COM ACTIVE FREQUENCY:1', 'MHz', SimConnectDataType.FLOAT64],
            ['COM ACTIVE FREQUENCY:2', 'MHz', SimConnectDataType.FLOAT64],
            ['NAV ACTIVE FREQUENCY:1', 'MHz', SimConnectDataType.FLOAT64],
            ['ATC ID', null, SimConnectDataType.STRING32],
            ['ATC MODEL', null, SimConnectDataType.STRING32],
            ['AMBIENT WIND VELOCITY', 'knots', SimConnectDataType.FLOAT64],
            ['AMBIENT WIND DIRECTION', 'degrees', SimConnectDataType.FLOAT64],
            ['AMBIENT TEMPERATURE', 'celsius', SimConnectDataType.FLOAT64],
            ['KOHLSMAN SETTING HG', 'inHg', SimConnectDataType.FLOAT64],
            ['ENG COMBUSTION:1', 'bool', SimConnectDataType.INT32],
            ['BRAKE PARKING POSITION', 'bool', SimConnectDataType.INT32],
            ['GROUND VELOCITY', 'knots', SimConnectDataType.FLOAT64],
        ];

        for (let i = 0; i < vars.length; i++) {
            handle.addToDataDefinition(
                this.DATA_DEF_ID,
                vars[i][0],
                vars[i][1],
                vars[i][2]
            );
        }

        // Listen for data
        handle.on('simObjectData', (recvData) => {
            if (recvData.requestID === this.REQUEST_ID) {
                this.parseSimData(recvData);
            }
        });

        // ── Traffic data definition ───────────────────────────────────
        handle.addToDataDefinition(this.TRAFFIC_DEF_ID, 'PLANE LATITUDE', 'degrees', SimConnectDataType.FLOAT64);
        handle.addToDataDefinition(this.TRAFFIC_DEF_ID, 'PLANE LONGITUDE', 'degrees', SimConnectDataType.FLOAT64);
        handle.addToDataDefinition(this.TRAFFIC_DEF_ID, 'PLANE ALTITUDE', 'feet', SimConnectDataType.FLOAT64);
        handle.addToDataDefinition(this.TRAFFIC_DEF_ID, 'AIRSPEED INDICATED', 'knots', SimConnectDataType.FLOAT64);
        handle.addToDataDefinition(this.TRAFFIC_DEF_ID, 'PLANE HEADING DEGREES MAGNETIC', 'degrees', SimConnectDataType.FLOAT64);
        handle.addToDataDefinition(this.TRAFFIC_DEF_ID, 'SIM ON GROUND', 'bool', SimConnectDataType.INT32);
        handle.addToDataDefinition(this.TRAFFIC_DEF_ID, 'ATC ID', null, SimConnectDataType.STRING32);
        handle.addToDataDefinition(this.TRAFFIC_DEF_ID, 'ATC MODEL', null, SimConnectDataType.STRING32);

        // Listen for traffic data responses
        handle.on('simObjectDataByType', (recvData) => {
            if (recvData.requestID === this.TRAFFIC_REQ_ID) {
                try {
                    const d = recvData.data;
                    const lat = d.readFloat64();
                    const lon = d.readFloat64();
                    const alt = d.readFloat64();
                    const spd = d.readFloat64();
                    const hdg = d.readFloat64();
                    const ground = d.readInt32() === 1;
                    const acid = d.readString32()?.trim() || 'UNKNOWN';
                    const model = d.readString32()?.trim() || '';

                    // Skip user aircraft (objectId 0)
                    if (recvData.objectID === 0) return;

                    // Update or insert into nearbyAircraft list
                    const existing = this.nearbyAircraft.findIndex(a => a.objectId === recvData.objectID);
                    const entry = {
                        objectId: recvData.objectID, lat, lon, alt: Math.round(alt),
                        speed: Math.round(spd), heading: Math.round(hdg),
                        onGround: ground, callsign: acid, model, timestamp: Date.now()
                    };
                    if (existing >= 0) this.nearbyAircraft[existing] = entry;
                    else this.nearbyAircraft.push(entry);

                    // Prune stale entries (not updated in 30s)
                    this.nearbyAircraft = this.nearbyAircraft.filter(a => Date.now() - a.timestamp < 30000);
                    this.emit('trafficUpdate', this.nearbyAircraft);
                } catch { }
            }
        });
    }

    parseSimData(recvData) {
        try {
            const d = recvData.data;

            // Read fields in the same order they were defined
            const latitude = d.readFloat64();
            const longitude = d.readFloat64();
            const altitude = d.readFloat64();
            const ias = d.readFloat64();
            const vs = d.readFloat64();
            const heading = d.readFloat64();
            const gear = d.readInt32();
            const flaps = d.readInt32();
            const onGround = d.readInt32() === 1;
            const transponder = d.readInt32();
            const com1 = d.readFloat64();
            const com2 = d.readFloat64();
            const nav1 = d.readFloat64();
            const callsign = d.readString32();
            const model = d.readString32();
            const windVel = d.readFloat64();
            const windDir = d.readFloat64();
            const temp = d.readFloat64();
            const baro = d.readFloat64();
            const engRunning = d.readInt32() === 1;
            const parkBrake = d.readInt32() === 1;
            const groundSpeed = d.readFloat64();

            // Convert COM frequencies from BCD to MHz (SimConnect returns frequency * 1)
            // The frequency comes as MHz already from node-simconnect
            const formatFreq = (f) => Math.round(f * 1000) / 1000;

            this.state = {
                latitude,
                longitude,
                altitude: Math.round(altitude),
                indicatedAirspeed: Math.round(ias),
                verticalSpeed: Math.round(vs),
                heading: Math.round(heading),
                gearPosition: gear,
                flapsIndex: flaps,
                onGround,
                onRunway: onGround && groundSpeed > 5,
                transponderCode: transponder,
                comFrequency1: formatFreq(com1),
                comFrequency2: formatFreq(com2),
                navFrequency1: formatFreq(nav1),
                callsign: callsign?.trim() || '',
                aircraftType: model?.trim() || '',
                windVelocity: Math.round(windVel),
                windDirection: Math.round(windDir),
                temperature: Math.round(temp),
                barometer: Math.round(baro * 100) / 100,
                enginesRunning: engRunning,
                parkingBrake: parkBrake,
                groundSpeed: Math.round(groundSpeed),
                timestamp: Date.now(),
            };

            this.emit('stateUpdate', this.state);
        } catch (err) {
            console.error('[SimConnect] Parse error:', err.message);
        }
    }

    startPolling() {
        if (this.pollInterval) clearInterval(this.pollInterval);

        const { SimConnectPeriod } = require('node-simconnect');

        // Request data on user aircraft, every sim frame (throttled by setInterval)
        try {
            this.handle.requestDataOnSimObject(
                this.REQUEST_ID,
                this.DATA_DEF_ID,
                0, // User aircraft object ID
                SimConnectPeriod.SECOND
            );
            console.log('[SimConnect] Polling started — 1Hz');
        } catch (err) {
            console.error('[SimConnect] Failed to start polling:', err.message);
        }

        // Start periodic traffic scan — every 10 seconds
        setInterval(() => {
            if (!this.handle || !this.connected) return;
            try {
                const { SimObjectType } = require('node-simconnect');
                this.handle.requestDataOnSimObjectType(
                    this.TRAFFIC_REQ_ID,
                    this.TRAFFIC_DEF_ID,
                    50000,   // 50km radius in meters
                    SimObjectType.AIRCRAFT
                );
            } catch { }
        }, 10000);
    }

    disconnect() {
        if (this.pollInterval) {
            clearInterval(this.pollInterval);
            this.pollInterval = null;
        }
        if (this.reconnectInterval) {
            clearInterval(this.reconnectInterval);
            this.reconnectInterval = null;
        }
        if (this.handle) {
            try {
                this.handle.close();
            } catch (e) { /* ignore */ }
            this.handle = null;
        }
        this.connected = false;
        this.mockMode = false;
    }

    getNearbyAircraft() {
        return this.nearbyAircraft || [];
    }
}

module.exports = { SimConnectManager };
