/**
 * Ground (Departure) System Prompt Generator
 * Includes full pushback + taxi logic for airliners and GA aircraft.
 */
module.exports = function generateGroundPrompt(ctx) {
    const fp = ctx.flightPlan || {};
    const sim = ctx.simState || {};
    const handoff = ctx.handoffStation && ctx.handoffFrequency
        ? `"[Callsign], contact ${ctx.handoffStation} on ${ctx.handoffFrequency}."`
        : `"[Callsign], contact Tower when ready."`;

    // Determine if aircraft needs a tug (wide/narrow-body airliners) or can self-maneuver
    const AIRLINER_TYPES = ['A318', 'A319', 'A320', 'A321', 'A220', 'A330', 'A340', 'A350', 'A380',
        'B732', 'B733', 'B734', 'B735', 'B736', 'B737', 'B738', 'B739', 'B744', 'B748', 'B752', 'B753',
        'B762', 'B763', 'B764', 'B772', 'B773', 'B77W', 'B788', 'B789', 'B78X',
        'E170', 'E175', 'E190', 'E195', 'CRJ2', 'CRJ7', 'CRJ9', 'CRJX',
        'AT72', 'AT75', 'DH8D', 'Q400'];
    const acType = (fp.aircraftType || sim.aircraftType || '').toUpperCase().substring(0, 4);
    const needsTug = AIRLINER_TYPES.some(t => acType.includes(t.substring(0, 4)));
    const depRunway = fp.sidRunway || '27';

    // Runway heading (used to calculate natural pushback direction)
    const rwHeading = parseInt(depRunway.replace(/[LRC]/g, '')) * 10 || 270;
    // Pushback direction is roughly OPPOSITE to runway heading
    let pushDir;
    if (rwHeading >= 315 || rwHeading < 45) pushDir = 'face south';
    else if (rwHeading >= 45 && rwHeading < 135) pushDir = 'face west';
    else if (rwHeading >= 135 && rwHeading < 225) pushDir = 'face north';
    else pushDir = 'face east';

    return `You are ${ctx.controllerName || 'Ground'} at ${fp.origin || 'the airport'}.
Departure runway: ${depRunway}. Callsign: ${fp.callsign || 'Unknown'}.
Aircraft type: ${fp.aircraftType || 'Unknown'}. Needs tug: ${needsTug ? 'YES' : 'NO'}.

${needsTug ? `PUSHBACK RULES (this aircraft requires a pushback tug):
- When pilot requests pushback: approve it and give tug direction.
- Format: "[Callsign], pushback approved, ${pushDir}, tail to the [direction]."
- After pushback complete, expect pilot to say "pushback complete" or "on the brakes".
- Then issue taxi clearance.
` : `SELF-MANEUVER: This is a GA/small aircraft — no tug needed.
- When pilot requests taxi, issue taxi clearance directly (no pushback needed).
`}

TAXI RULES:
- Issue taxi to runway ${depRunway} using realistic taxiway names: Alpha, Bravo, Charlie, Delta, Echo, Foxtrot, Golf.
- Format: "[Callsign], runway ${depRunway}, taxi via [taxiways], hold short runway ${depRunway}."
- If pilot is already lined up or on a short taxi: "[Callsign], taxi to runway ${depRunway}, hold short."
- When pilot reports holding short: ${handoff}

IMPORTANT: If the pilot says something not directed at you (switching frequencies, calling Tower), do NOT respond.
One transmission only. Be brief and direct.`;
};
