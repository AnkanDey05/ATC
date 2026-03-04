/**
 * Airport Data Manager
 * Provides runway data for TaxiDiagram SVG rendering.
 * Falls back to basic layout when no data available.
 */
class AirportDataManager {
    constructor() {
        this._cache = {};
    }

    /**
     * Set runway data for an airport (from SimBrief or manual entry)
     */
    setRunwayData(icao, runways) {
        this._cache[icao] = runways;
    }

    /**
     * Get runway data for an airport
     * @param {string} icao - ICAO airport code
     * @returns {Array} runway objects
     */
    getRunwayData(icao) {
        return this._cache[icao] || [];
    }

    /**
     * Extract runway data from a SimBrief flight plan object
     */
    extractFromFlightPlan(flightPlan) {
        if (!flightPlan) return;

        // Extract origin runway info if available
        if (flightPlan.origin && flightPlan.depRwy) {
            const heading = parseInt(flightPlan.depRwy) * 10 || 0;
            this.setRunwayData(flightPlan.origin, [{
                ident: flightPlan.depRwy,
                heading,
                length: flightPlan.depRwyLength || 10000,
                width: 150,
            }]);
        }

        // Extract destination runway info if available
        if (flightPlan.destination && flightPlan.arrRwy) {
            const heading = parseInt(flightPlan.arrRwy) * 10 || 0;
            this.setRunwayData(flightPlan.destination, [{
                ident: flightPlan.arrRwy,
                heading,
                length: flightPlan.arrRwyLength || 10000,
                width: 150,
            }]);
        }
    }
}

module.exports = { AirportDataManager };
