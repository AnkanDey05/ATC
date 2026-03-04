import React from 'react';

const PHASE_ACTIONS = {
    ATIS: ['Request Clearance', 'Say Again', 'ATIS Received'],
    CLEARANCE: ['Ready to Copy', 'Confirm Squawk', 'Read Back Correct', 'Say Again'],
    GROUND_DEP: ['Request Pushback', 'Pushback Complete', 'Ready to Taxi', 'Hold Short Acknowledged', 'Wilco'],
    TOWER_DEP: ['Ready for Departure', 'Holding Short', 'Request Immediate', 'Wilco'],
    DEPARTURE: ['Climbing Through {alt}', 'Request Higher', 'Reaching {alt}', 'Wilco'],
    CENTER: ['Level at FL{alt}', 'Request FL{newAlt}', 'Say Again', 'Wilco', 'Position Report', 'Request Direct {nextWaypoint}'],
    APPROACH: ['Established ILS', 'Visual in Sight', 'Go Around', 'Wilco', 'Say Again'],
    TOWER_ARR: ['Short Final', 'Runway Vacated', 'Wilco'],
    GROUND_ARR: ['Taxi to Gate', 'Wilco', 'Request Parking'],
};

function substituteVars(template, simState, flightPlan) {
    const alt = simState?.altitude || 0;
    const flAlt = Math.round(alt / 100);
    const newAlt = Math.round((alt + 2000) / 1000) * 1000;
    const newFlAlt = Math.round(newAlt / 100);

    // Find next waypoint from flight plan route
    const route = flightPlan?.route || '';
    const waypoints = route.split(/\s+/).filter(w => /^[A-Z]{2,5}$/.test(w));
    const nextWaypoint = waypoints[0] || 'DIRECT';

    return template
        .replace(/\{alt\}/g, alt >= 18000 ? `${flAlt}` : `${Math.round(alt)}`)
        .replace(/\{newAlt\}/g, newAlt >= 18000 ? `${newFlAlt}` : `${newAlt}`)
        .replace(/\{nextWaypoint\}/g, nextWaypoint);
}

export default function QuickActions({ phase, simState, flightPlan, onAction }) {
    const actions = PHASE_ACTIONS[phase] || PHASE_ACTIONS.ATIS;

    return (
        <div className="flex flex-wrap gap-1.5">
            {actions.map((template) => {
                const text = substituteVars(template, simState, flightPlan);
                return (
                    <button
                        key={template}
                        onClick={() => onAction(text)}
                        className="px-2.5 py-1 bg-atc-surface-2/60 border border-atc-border/50 rounded-full
                            text-[11px] font-mono text-atc-text-muted
                            hover:bg-atc-accent/15 hover:text-atc-accent hover:border-atc-accent/30
                            active:scale-95 transition-all cursor-pointer whitespace-nowrap"
                    >
                        {text}
                    </button>
                );
            })}
        </div>
    );
}
