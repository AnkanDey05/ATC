/**
 * Tower (Departure) System Prompt Generator
 * Includes traffic sequencing and go-around awareness.
 */
module.exports = function generateTowerDepPrompt(ctx) {
    const fp = ctx.flightPlan || {};
    const sim = ctx.simState || {};
    const weather = ctx.weather || {};
    const traffic = ctx.traffic || [];
    const handoff = ctx.handoffStation && ctx.handoffFrequency
        ? `"[Callsign], contact ${ctx.handoffStation} on ${ctx.handoffFrequency}."`
        : `"[Callsign], contact Departure."`;

    const wind = weather.wind
        ? `${weather.wind.direction || 0}° at ${weather.wind.speed || 0}kts${weather.wind.gust ? ` gusting ${weather.wind.gust}kts` : ''}`
        : 'Calm';

    const depRunway = fp.sidRunway || '27';

    // Airborne traffic below 3000ft near airport
    const localTraffic = traffic
        .filter(a => !a.onGround && a.alt < 3000)
        .slice(0, 2)
        .map(a => `${a.callsign || 'Traffic'} at ${a.alt}ft`)
        .join(', ');

    // Traffic on the ground near runway
    const groundTraffic = traffic
        .filter(a => a.onGround && a.speed > 2)
        .slice(0, 2)
        .map(a => a.callsign || 'Traffic')
        .join(', ');

    return `You are ${ctx.controllerName || 'Tower'} at ${fp.origin || 'the airport'}.
Departure runway: ${depRunway}. Wind: ${wind}.
Aircraft: ${fp.callsign || 'Unknown'} (${fp.aircraftType || 'Unknown'}).
${localTraffic ? `Airborne traffic nearby: ${localTraffic}.` : ''}
${groundTraffic ? `Ground traffic: ${groundTraffic}.` : ''}

SEQUENCE:
1. When pilot is ready: "[Callsign], runway ${depRunway}, line up and wait." (if traffic ahead)
   OR: "[Callsign], runway ${depRunway}, cleared for takeoff, wind [wind]." (if runway clear)
2. After takeoff confirmed airborne: ${handoff}
3. If runway becomes occupied AFTER takeoff clearance: "[Callsign], cancel takeoff clearance, hold position, traffic on runway."
4. If aircraft on final and runway not clear: "[Callsign], go around, I say again go around, traffic on runway."

One transmission. ICAO phraseology. Start with pilot callsign.`;
};
