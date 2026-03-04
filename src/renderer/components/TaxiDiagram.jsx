import React, { useMemo } from 'react';

/**
 * TaxiDiagram — parsed taxi route from ATC clearance + simplified runway SVG.
 * Visible only during GROUND_DEP and GROUND_ARR phases.
 */

// Parse taxiway names from ATC text
function parseTaxiRoute(transcriptMessages) {
    const groundMsgs = transcriptMessages
        .filter(m => m.type === 'atc')
        .map(m => m.text);

    // Get last ground message containing "taxi"
    const taxiMsg = [...groundMsgs].reverse().find(t => /taxi/i.test(t));
    if (!taxiMsg) return { taxiways: [], holdShort: null };

    // Extract taxiway names (Alpha, Bravo, Charlie, etc.)
    const taxiwayPattern = /\b(Alpha|Bravo|Charlie|Delta|Echo|Foxtrot|Golf|Hotel|India|Juliet|Kilo|Lima|Mike|November|Oscar|Papa|Quebec|Romeo|Sierra|Tango|Uniform|Victor|Whiskey|X-ray|Yankee|Zulu|[A-Z]{1,2}\d?)\b/gi;
    const taxiways = [];
    let match;
    while ((match = taxiwayPattern.exec(taxiMsg)) !== null) {
        const tw = match[1].charAt(0).toUpperCase() + match[1].slice(1).toLowerCase();
        if (!taxiways.includes(tw)) taxiways.push(tw);
    }

    // Extract hold short instruction
    const holdShortMatch = taxiMsg.match(/hold\s+short\s+(?:of\s+)?(?:runway\s+)?(\d{1,2}[LRC]?)/i);
    const holdShort = holdShortMatch ? holdShortMatch[1] : null;

    return { taxiways, holdShort };
}

export default function TaxiDiagram({ simState, transcript, phase }) {
    const showDiagram = phase === 'GROUND_DEP' || phase === 'GROUND_ARR';
    const route = useMemo(() => parseTaxiRoute(transcript || []), [transcript]);

    if (!showDiagram) return null;

    return (
        <div className="glass-panel p-3 shrink-0">
            <div className="flex items-center gap-2 mb-2">
                <span className="text-sm">🛣️</span>
                <h3 className="text-xs font-semibold text-atc-text uppercase tracking-wide">Taxi Route</h3>
            </div>

            {/* Taxi route path */}
            {route.taxiways.length > 0 ? (
                <div className="flex items-center gap-1.5 flex-wrap">
                    {route.taxiways.map((tw, i) => (
                        <React.Fragment key={tw + i}>
                            <span className="px-2 py-0.5 bg-atc-accent/15 border border-atc-accent/30 rounded text-xs font-mono text-atc-accent font-bold">
                                {tw}
                            </span>
                            {i < route.taxiways.length - 1 && (
                                <span className="text-atc-text-dim text-xs">→</span>
                            )}
                        </React.Fragment>
                    ))}
                    {route.holdShort && (
                        <>
                            <span className="text-atc-text-dim text-xs">→</span>
                            <span className="px-2 py-0.5 bg-amber-500/20 border border-amber-500/40 rounded text-xs font-mono text-amber-400 font-bold">
                                HS RWY {route.holdShort}
                            </span>
                        </>
                    )}
                </div>
            ) : (
                <p className="text-xs text-atc-text-muted font-mono">No taxi clearance received yet</p>
            )}

            {/* Simplified runway SVG */}
            <svg viewBox="0 0 300 100" className="w-full h-16 mt-2">
                {/* Runway */}
                <rect x="30" y="35" width="240" height="30" rx="2" fill="#1e293b" stroke="#38bdf8" strokeWidth="1" opacity="0.5" />
                <text x="150" y="55" textAnchor="middle" fill="#38bdf8" fontSize="10" fontFamily="monospace" opacity="0.7">RWY</text>
                {/* Centerline dashes */}
                {[50, 90, 130, 170, 210, 240].map(x => (
                    <rect key={x} x={x} y="49" width="10" height="2" fill="#38bdf8" opacity="0.3" />
                ))}
                {/* Aircraft dot */}
                {simState?.latitude && (
                    <circle cx="150" cy="50" r="4" fill="#4ade80" stroke="#fff" strokeWidth="1">
                        <animate attributeName="r" values="4;5;4" dur="2s" repeatCount="indefinite" />
                    </circle>
                )}
            </svg>
        </div>
    );
}
