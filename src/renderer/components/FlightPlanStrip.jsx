import React, { useState, useEffect } from 'react';

const api = window.electronAPI;

export default function FlightPlanStrip({ simState, phase }) {
    const [flightPlan, setFlightPlan] = useState(null);
    const [simbriefUser, setSimbriefUser] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');

    useEffect(() => {
        if (api) {
            api.getFlightPlan().then(plan => {
                if (plan) setFlightPlan(plan);
            });
        }
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

            {/* Route string */}
            <div className="text-[10px] font-mono text-atc-text-muted leading-relaxed overflow-y-auto max-h-16">
                {flightPlan.route || 'No route string available'}
            </div>
        </div>
    );
}
