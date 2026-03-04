/**
 * SimBrief OFP Fetcher + Parser
 * Fetches and parses the operational flight plan from SimBrief API.
 */
class SimBriefManager {
    constructor(store) {
        this.store = store;
    }

    async fetch(username) {
        if (!username) {
            username = this.store.get('simbrief.username');
        }
        if (!username) throw new Error('SimBrief username not configured');

        const url = `https://www.simbrief.com/api/xml.fetcher.php?username=${encodeURIComponent(username)}&json=1`;
        const response = await fetch(url);

        if (!response.ok) {
            throw new Error(`SimBrief API error: ${response.status}`);
        }

        const data = await response.json();
        return this.parseOFP(data);
    }

    parseOFP(data) {
        const general = data.general || {};
        const origin = data.origin || {};
        const destination = data.destination || {};
        const alternate = data.alternate || {};
        const navlog = data.navlog || {};
        const atc = data.atc || {};

        // Parse waypoints from navlog
        const waypoints = [];
        const fixes = navlog.fix || [];
        const fixArray = Array.isArray(fixes) ? fixes : [fixes];

        for (const fix of fixArray) {
            if (fix && fix.ident) {
                waypoints.push({
                    ident: fix.ident,
                    name: fix.name || fix.ident,
                    lat: parseFloat(fix.pos_lat) || 0,
                    lon: parseFloat(fix.pos_long) || 0,
                    altitude: parseInt(fix.altitude_feet) || 0,
                    type: fix.type || 'wpt',
                    via: fix.via_airway || 'DCT',
                });
            }
        }

        return {
            // Flight identifiers
            callsign: general.icao_airline
                ? `${general.icao_airline}${general.flight_number || ''}`
                : (atc.callsign || 'N12345'),
            aircraftType: general.icao_aircraft || 'B738',
            airline: general.icao_airline || '',
            flightNumber: general.flight_number || '',

            // Airports
            origin: origin.icao_code || '',
            originName: origin.name || '',
            originLat: parseFloat(origin.pos_lat) || 0,
            originLon: parseFloat(origin.pos_long) || 0,

            destination: destination.icao_code || '',
            destinationName: destination.name || '',
            destLat: parseFloat(destination.pos_lat) || 0,
            destLon: parseFloat(destination.pos_long) || 0,

            alternate: alternate.icao_code || '',
            alternateName: alternate.name || '',

            // Route
            route: atc.route || general.route || '',
            cruiseAltitude: parseInt(general.initial_altitude) || 35000,
            sid: atc.sid_ident || '',
            sidRunway: atc.sid_rwy || '',
            star: atc.star_ident || '',
            starRunway: atc.star_rwy || '',
            approach: atc.approach || '',

            // Waypoints
            waypoints,

            // Performance
            fuel: parseInt(general.fuel_burn) || 0,
            estimatedTime: parseInt(general.time_enroute) || 0, // seconds
            distance: parseInt(general.distance) || 0, // nm

            // Squawk (generate random if not in simbrief)
            squawk: Math.floor(1000 + Math.random() * 6999).toString(),
        };
    }
}

module.exports = { SimBriefManager };
