/**
 * Weather Manager — AVWX METAR fetcher + parser
 * Fetches live METAR data and parses into useful fields.
 */
class WeatherManager {
    constructor(store) {
        this.store = store;
        this.cache = new Map();
        this.cacheTimeout = 30 * 60 * 1000; // 30 minutes
    }

    async fetch(icao) {
        if (!icao) throw new Error('No ICAO code provided');

        // Check cache
        const cached = this.cache.get(icao);
        if (cached && (Date.now() - cached.timestamp) < this.cacheTimeout) {
            return cached.data;
        }

        const apiKey = this.store.get('apiKeys.avwx');
        let data;

        if (apiKey) {
            data = await this.fetchFromAvwx(icao, apiKey);
        } else {
            // Fallback: generate basic weather data
            data = this.generateDefaultWeather(icao);
        }

        this.cache.set(icao, { data, timestamp: Date.now() });
        return data;
    }

    async fetchFromAvwx(icao, apiKey) {
        const url = `https://avwx.rest/api/metar/${icao}?token=${apiKey}`;
        const response = await fetch(url);

        if (!response.ok) {
            console.warn(`[Weather] AVWX API error for ${icao}: ${response.status}`);
            return this.generateDefaultWeather(icao);
        }

        const metar = await response.json();
        return this.parseMetar(metar, icao);
    }

    parseMetar(metar, icao) {
        return {
            icao,
            raw: metar.raw || '',
            time: metar.time?.dt || new Date().toISOString(),
            wind: {
                direction: metar.wind_direction?.value || 0,
                speed: metar.wind_speed?.value || 0,
                gust: metar.wind_gust?.value || 0,
                variable: metar.wind_direction?.repr === 'VRB',
            },
            visibility: {
                value: metar.visibility?.value || 10,
                unit: metar.visibility?.units || 'sm',
            },
            clouds: (metar.clouds || []).map(c => ({
                type: c.type || 'FEW',
                altitude: (c.altitude || 0) * 100, // Convert to feet (AVWX gives hundreds)
            })),
            temperature: metar.temperature?.value || 15,
            dewpoint: metar.dewpoint?.value || 10,
            altimeter: metar.altimeter?.value || 29.92,
            flightRules: metar.flight_rules || 'VFR',
            remarks: metar.remarks || '',
        };
    }

    generateDefaultWeather(icao) {
        return {
            icao,
            raw: `${icao} AUTO 270010KT 10SM FEW250 15/10 A2992`,
            time: new Date().toISOString(),
            wind: { direction: 270, speed: 10, gust: 0, variable: false },
            visibility: { value: 10, unit: 'sm' },
            clouds: [{ type: 'FEW', altitude: 25000 }],
            temperature: 15,
            dewpoint: 10,
            altimeter: 29.92,
            flightRules: 'VFR',
            remarks: '',
        };
    }

    /**
     * Determine active runway from wind direction and airport runway data
     */
    determineActiveRunway(windDirection, runways) {
        if (!runways || runways.length === 0) return '27';

        let bestRunway = runways[0];
        let minDiff = 360;

        for (const rwy of runways) {
            const heading = parseInt(rwy.replace(/[LRC]/g, '')) * 10;
            let diff = Math.abs(windDirection - heading);
            if (diff > 180) diff = 360 - diff;
            if (diff < minDiff) {
                minDiff = diff;
                bestRunway = rwy;
            }
        }

        return bestRunway;
    }

    /**
     * Generate ATIS letter (cycles A-Z based on UTC hour)
     */
    getAtisLetter() {
        const hour = new Date().getUTCHours();
        return String.fromCharCode(65 + (hour % 26)); // A=65
    }
}

module.exports = { WeatherManager };
