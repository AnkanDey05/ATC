/**
 * ArtccManager — detects which ARTCC/FIR the aircraft is currently in
 * using simplified polygon boundaries.
 */
const ARTCC_BOUNDARIES = require('../assets/artcc-boundaries.json');

class ArtccManager {
    constructor() {
        this._currentArtcc = null;
    }

    /**
     * Get ARTCC for current position
     */
    getCurrentArtcc(lat, lon) {
        for (const artcc of ARTCC_BOUNDARIES) {
            if (this.pointInPolygon(lat, lon, artcc.polygon)) {
                return artcc;
            }
        }
        // Default for oceanic/unknown
        return { id: 'ZXX', name: 'Oceanic Control', frequency: '129.90' };
    }

    /**
     * Check if aircraft has crossed into a new ARTCC
     * @returns {object|null} New ARTCC if boundary crossed, null otherwise
     */
    checkBoundaryCrossing(lat, lon) {
        const artcc = this.getCurrentArtcc(lat, lon);
        if (!this._currentArtcc || this._currentArtcc.id !== artcc.id) {
            const prev = this._currentArtcc;
            this._currentArtcc = artcc;
            if (prev) {
                return { from: prev, to: artcc };
            }
        }
        return null;
    }

    /**
     * Ray casting point-in-polygon algorithm
     */
    pointInPolygon(lat, lon, polygon) {
        let inside = false;
        for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
            const xi = polygon[i][0], yi = polygon[i][1];
            const xj = polygon[j][0], yj = polygon[j][1];
            const intersect = ((yi > lon) !== (yj > lon)) &&
                (lat < (xj - xi) * (lon - yi) / (yj - yi) + xi);
            if (intersect) inside = !inside;
        }
        return inside;
    }
}

module.exports = { ArtccManager };
