import React, { useState, useEffect, useMemo } from 'react';

const api = window.electronAPI;

export default function FlightPlanStrip({ simState, phase }) {
    const [flightPlan, setFlightPlan] = useState(null);
    const [simbriefUser, setSimbriefUser] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [passedWaypoints, setPassedWaypoints] = useState([]);

    useEffect(() => {
        if (api) {
            api.getFlightPlan().then(plan => {
                if (plan) setFlightPlan(plan);
            });
        }
    }, []);

    // C2: Listen for waypoint passed events
    useEffect(() => {
        if (!api?.onWaypointPassed) return;
        const unsub = api.onWaypointPassed((data) => {
            setPassedWaypoints(data.passed || []);
        });
        return () => unsub && unsub();
    }, []);

    const fetchSimBrief = async () => {
        if (!simbriefUser.trim()) return;
        setLoading(true);
        setError('');
        try {
            const plan = await api.fetchSimBrief(simbriefUser.trim());
            if (plan.error) {
                setError(plan.error);
            } else {
                setFlightPlan(plan);
            }
        } catch (err) {
            setError(err.message);
        }
        setLoading(false);
    };

    // C2: Calculate progress and ETA
    const routeProgress = useMemo(() => {
        if (!flightPlan?.waypoints || flightPlan.waypoints.length === 0) {
            return { percent: 0, eta: null, nextWp: null, distToNext: null };
        }
        const total = flightPlan.waypoints.length;
        const passed = passedWaypoints.length;
        const percent = Math.round((passed / total) * 100);

        // Find next upcoming waypoint
        const nextWp = flightPlan.waypoints.find(wp => !passedWaypoints.includes(wp.ident));

        // Calculate distance to destination
        let distToDest = null;
        let eta = null;
        if (simState?.latitude && flightPlan.destLat && flightPlan.destLon) {
            const R = 3440.065;
            const dLat = (flightPlan.destLat - simState.latitude) * Math.PI / 180;
            const dLon = (flightPlan.destLon - simState.longitude) * Math.PI / 180;
            const a = Math.sin(dLat / 2) ** 2 +
                Math.cos(simState.latitude * Math.PI / 180) * Math.cos(flightPlan.destLat * Math.PI / 180) *
                Math.sin(dLon / 2) ** 2;
            distToDest = R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

            if (simState.groundSpeed > 10) {
                const hoursRemaining = distToDest / simState.groundSpeed;
                const mins = Math.round(hoursRemaining * 60);
                const h = Math.floor(mins / 60);
                const m = mins % 60;
                eta = `${h}h${m.toString().padStart(2, '0')}m`;
            }
        }

        // Distance to next waypoint
        let distToNext = null;
        if (nextWp?.lat && nextWp?.lon && simState?.latitude) {
            const R = 3440.065;
            const dLat = (nextWp.lat - simState.latitude) * Math.PI / 180;
            const dLon = (nextWp.lon - simState.longitude) * Math.PI / 180;
            const a = Math.sin(dLat / 2) ** 2 +
                Math.cos(simState.latitude * Math.PI / 180) * Math.cos(nextWp.lat * Math.PI / 180) *
                Math.sin(dLon / 2) ** 2;
            distToNext = Math.round(R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)));
        }

        return { percent, eta, nextWp, distToNext, distToDest: distToDest ? Math.round(distToDest) : null };
    }, [flightPlan, passedWaypoints, simState?.latitude, simState?.longitude, simState?.groundSpeed]);

    if (!flightPlan) {
        return (
            <div className="glass-panel p-4 flex-1 flex flex-col gap-3">
                <div className="text-sm font-semibold text-atc-text-dim flex items-center gap-2">
                    ✈ Flight Plan
                </div>

                {/* SimBrief fetch */}
                <div className="flex gap-2">
                    <input
                        type="text"
                        value={simbriefUser}
                        onChange={(e) => setSimbriefUser(e.target.value)}
                        placeholder="SimBrief username"
                        className="flex-1 bg-atc-surface-2 border border-atc-border rounded px-3 py-1.5 text-sm text-atc-text placeholder:text-atc-text-muted focus:outline-none focus:border-atc-accent/50"
                        onKeyDown={(e) => e.key === 'Enter' && fetchSimBrief()}
                    />
                    <button
                        onClick={fetchSimBrief}
                        disabled={loading || !simbriefUser.trim()}
                        className="px-3 py-1.5 bg-atc-accent/20 text-atc-accent border border-atc-accent/30 rounded text-sm hover:bg-atc-accent/30 disabled:opacity-40 transition-all"
                    >
                        {loading ? '...' : 'Fetch'}
                    </button>
                </div>

                {error && <div className="text-xs text-atc-red">{error}</div>}

                <div className="text-xs text-atc-text-muted text-center mt-2">
                    Enter your SimBrief username to import your flight plan,<br />
                    or the plan will be populated from your next SimBrief dispatch.
                </div>
            </div>
        );
    }

    const waypoints = flightPlan.waypoints || [];

    return (
        <div className="glass-panel p-4 flex-1 flex flex-col gap-3 overflow-hidden">
            <div className="text-sm font-semibold text-atc-text-dim flex items-center justify-between">
                <span>✈ Flight Plan</span>
                <button
                    onClick={() => setFlightPlan(null)}
                    className="text-xs text-atc-text-muted hover:text-atc-text"
                >
                    Change
                </button>
            </div>

            {/* Route summary */}
            <div className="flex items-center gap-3">
                <div className="text-center">
                    <div className="text-lg font-bold font-mono text-atc-cyan">{flightPlan.origin}</div>
                    <div className="text-[10px] text-atc-text-muted truncate max-w-[80px]">{flightPlan.originName}</div>
                </div>
                <div className="flex-1 flex items-center gap-1">
                    <div className="h-px flex-1 bg-gradient-to-r from-atc-cyan to-atc-accent" />
                    <div className="text-xs text-atc-text-muted font-mono">
                        {flightPlan.aircraftType} • FL{Math.round(flightPlan.cruiseAltitude / 100)}
                    </div>
                    <div className="h-px flex-1 bg-gradient-to-r from-atc-accent to-atc-green" />
                </div>
                <div className="text-center">
                    <div className="text-lg font-bold font-mono text-atc-green">{flightPlan.destination}</div>
                    <div className="text-[10px] text-atc-text-muted truncate max-w-[80px]">{flightPlan.destinationName}</div>
                </div>
            </div>

            {/* C2: Progress bar */}
            <div className="space-y-1">
                <div className="flex justify-between text-[10px] text-atc-text-muted font-mono">
                    <span>{routeProgress.percent}% complete</span>
                    <span className="flex gap-3">
                        {routeProgress.distToDest != null && <span>{routeProgress.distToDest}nm remaining</span>}
                        {routeProgress.eta && <span>ETA {routeProgress.eta}</span>}
                    </span>
                </div>
                <div className="w-full h-1.5 bg-atc-surface-2 rounded-full overflow-hidden">
                    <div
                        className="h-full bg-gradient-to-r from-atc-cyan via-atc-accent to-atc-green rounded-full transition-all duration-500"
                        style={{ width: `${routeProgress.percent}%` }}
                    />
                </div>
            </div>

            {/* Details grid */}
            <div className="grid grid-cols-4 gap-2 text-xs">
                {[
                    { label: 'Callsign', value: flightPlan.callsign },
                    { label: 'SID', value: flightPlan.sid || 'N/A' },
                    { label: 'STAR', value: flightPlan.star || 'N/A' },
                    { label: 'Squawk', value: flightPlan.squawk },
                ].map(({ label, value }) => (
                    <div key={label} className="bg-atc-surface-2/50 rounded px-2 py-1">
                        <div className="text-[9px] text-atc-text-muted">{label}</div>
                        <div className="font-mono font-semibold text-atc-text truncate">{value}</div>
                    </div>
                ))}
            </div>

            {/* C2: Waypoint list with pass tracking */}
            {waypoints.length > 0 ? (
                <div className="flex items-center gap-1 overflow-x-auto text-[10px] font-mono pb-1">
                    {waypoints.map((wp, i) => {
                        const isPassed = passedWaypoints.includes(wp.ident);
                        const isNext = routeProgress.nextWp?.ident === wp.ident;
                        return (
                            <React.Fragment key={wp.ident + i}>
                                <span
                                    className={`
                                        px-1.5 py-0.5 rounded whitespace-nowrap shrink-0
                                        ${isPassed
                                            ? 'text-atc-text-dim line-through opacity-50'
                                            : isNext
                                                ? 'bg-atc-accent/20 text-atc-accent border border-atc-accent/30 font-bold'
                                                : 'text-atc-text-muted'
                                        }
                                    `}
                                    title={isNext && routeProgress.distToNext ? `${routeProgress.distToNext}nm` : undefined}
                                >
                                    {isPassed && '✓ '}{wp.ident}
                                    {isNext && routeProgress.distToNext != null && (
                                        <span className="text-atc-accent/60 ml-1">{routeProgress.distToNext}nm</span>
                                    )}
                                </span>
                                {i < waypoints.length - 1 && (
                                    <span className="text-atc-text-dim shrink-0">›</span>
                                )}
                            </React.Fragment>
                        );
                    })}
                </div>
            ) : (
                <div className="text-[10px] font-mono text-atc-text-muted leading-relaxed overflow-y-auto max-h-16">
                    {flightPlan.route || 'No route string available'}
                </div>
            )}
        </div>
    );
}

