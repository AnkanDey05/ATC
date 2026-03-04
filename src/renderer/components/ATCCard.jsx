import React from 'react';

const PHASE_COLORS = {
    ATIS: 'text-atc-cyan', CLEARANCE: 'text-atc-amber', GROUND_DEP: 'text-atc-green',
    TOWER_DEP: 'text-atc-red', DEPARTURE: 'text-blue-400', CENTER: 'text-purple-400',
    APPROACH: 'text-orange-400', TOWER_ARR: 'text-atc-red', GROUND_ARR: 'text-atc-green',
};

export default function ATCCard({ phase, controller, simState, simConnected }) {
    const formatAlt = (alt) => {
        if (!alt) return '---';
        if (alt >= 18000) return `FL${Math.round(alt / 100)}`;
        return `${Math.round(alt).toLocaleString()} ft`;
    };
    const formatSpeed = (spd) => spd ? `${Math.round(spd)} kts` : '---';
    const formatHdg = (hdg) => hdg ? `${Math.round(hdg).toString().padStart(3, '0')}°` : '---';
    const formatVs = (vs) => {
        if (!vs) return '---';
        const sign = vs > 0 ? '+' : '';
        return `${sign}${Math.round(vs)} fpm`;
    };

    return (
        <div className="glass-panel p-4 flex flex-col gap-3">
            {/* Controller header */}
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                    <div>
                        <div className={`text-lg font-bold ${PHASE_COLORS[phase] || 'text-atc-text'}`}>
                            {controller?.station || phase.replace('_', ' ')}
                        </div>
                        {controller && (
                            <div className="text-xs text-atc-text-dim">
                                {controller.name} — {controller.frequency}
                            </div>
                        )}
                    </div>
                </div>

                {controller && (
                    <div className="bg-atc-surface-2 border border-atc-border rounded-lg px-3 py-1.5">
                        <div className="text-xs text-atc-text-muted">FREQ</div>
                        <div className="text-lg font-mono font-bold text-atc-green">{controller.frequency}</div>
                    </div>
                )}
            </div>

            {/* Aircraft state strip */}
            <div className="grid grid-cols-5 gap-2">
                {[
                    { label: 'ALT', value: formatAlt(simState?.altitude) },
                    { label: 'IAS', value: formatSpeed(simState?.indicatedAirspeed) },
                    { label: 'HDG', value: formatHdg(simState?.heading) },
                    { label: 'V/S', value: formatVs(simState?.verticalSpeed) },
                    { label: 'XPDR', value: simState?.transponderCode?.toString() || '1200' },
                ].map(({ label, value }) => (
                    <div key={label} className="bg-atc-surface-2/50 rounded-lg px-2 py-1.5 text-center">
                        <div className="text-[10px] text-atc-text-muted font-mono">{label}</div>
                        <div className="text-sm font-mono font-semibold text-atc-text">{value}</div>
                    </div>
                ))}
            </div>
        </div>
    );
}
