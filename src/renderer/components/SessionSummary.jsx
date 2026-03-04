import React, { useMemo } from 'react';

export default function SessionSummary({ transcript, costs, flightPlan }) {
    const stats = useMemo(() => {
        const pilotMessages = transcript.filter(m => m.type === 'pilot');
        const atcMessages = transcript.filter(m => m.type === 'atc');
        const systemMessages = transcript.filter(m => m.type === 'system');

        // Phase timing — extract from system messages (phase transitions)
        const phaseTimings = {};
        let lastPhaseStart = null;
        let lastPhaseName = null;
        for (const msg of systemMessages) {
            const phaseMatch = msg.text?.match(/✦\s+(\w+)\s+—/);
            if (phaseMatch) {
                if (lastPhaseName && lastPhaseStart) {
                    const duration = msg.timestamp - lastPhaseStart;
                    phaseTimings[lastPhaseName] = (phaseTimings[lastPhaseName] || 0) + duration;
                }
                lastPhaseName = phaseMatch[1];
                lastPhaseStart = msg.timestamp;
            }
        }
        // Add final phase duration
        if (lastPhaseName && lastPhaseStart) {
            phaseTimings[lastPhaseName] = (phaseTimings[lastPhaseName] || 0) + (Date.now() - lastPhaseStart);
        }

        // Flight time
        const firstTimestamp = transcript[0]?.timestamp || Date.now();
        const flightTimeMs = Date.now() - firstTimestamp;
        const flightMins = Math.floor(flightTimeMs / 60000);
        const flightHours = Math.floor(flightMins / 60);
        const flightMinsRem = flightMins % 60;
        const flightTime = `${flightHours}:${flightMinsRem.toString().padStart(2, '0')}`;

        // Readback corrections
        const corrections = atcMessages.filter(m =>
            /\b(say again|negative|incorrect|wrong|correction)\b/i.test(m.text)
        ).length;

        // Go-arounds
        const goArounds = transcript.filter(m =>
            /\b(go[- ]?around|missed approach)\b/i.test(m.text)
        ).length;

        return {
            pilotCount: pilotMessages.length,
            atcCount: atcMessages.length,
            flightTime,
            phaseTimings,
            corrections,
            goArounds,
        };
    }, [transcript]);

    const totalCost = costs?.costs?.total || 0;
    const sttCost = costs?.costs?.stt || 0;
    const llmCost = costs?.costs?.llm || 0;
    const ttsCost = costs?.costs?.tts || 0;

    const formatDuration = (ms) => {
        const mins = Math.floor(ms / 60000);
        if (mins < 1) return '<1m';
        if (mins < 60) return `${mins}m`;
        return `${Math.floor(mins / 60)}h${(mins % 60).toString().padStart(2, '0')}m`;
    };

    const exportTranscript = () => {
        const lines = transcript.map(msg => {
            const time = new Date(msg.timestamp).toISOString().slice(11, 19);
            if (msg.type === 'system') return `\n--- ${msg.text} ---\n`;
            const speaker = msg.type === 'pilot' ? 'PILOT' : `ATC (${msg.controller?.name || 'Controller'})`;
            return `[${time}] ${speaker}: ${msg.text}`;
        }).join('\n');

        const header = [
            '╔════════════════════════════════════════════╗',
            '║        MSFS ATC — Session Transcript       ║',
            '╚════════════════════════════════════════════╝',
            '',
            `Flight: ${flightPlan?.callsign || 'N/A'} | ${flightPlan?.origin || '????'} → ${flightPlan?.destination || '????'}`,
            `Aircraft: ${flightPlan?.aircraftType || 'N/A'}`,
            `Date: ${new Date().toISOString().slice(0, 10)}`,
            `Flight Time: ${stats.flightTime}`,
            `Total Cost: $${totalCost.toFixed(4)}`,
            '',
            '════════════════════════════════════════════',
            '',
        ].join('\n');

        const blob = new Blob([header + lines], { type: 'text/plain' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `atc-transcript-${Date.now()}.txt`;
        a.click();
        URL.revokeObjectURL(url);
    };

    const exportJson = () => {
        const sessionData = {
            flight: {
                callsign: flightPlan?.callsign,
                origin: flightPlan?.origin,
                destination: flightPlan?.destination,
                aircraft: flightPlan?.aircraftType,
                date: new Date().toISOString(),
            },
            stats: {
                flightTime: stats.flightTime,
                pilotTransmissions: stats.pilotCount,
                atcResponses: stats.atcCount,
                readbackCorrections: stats.corrections,
                goArounds: stats.goArounds,
            },
            costs: { total: totalCost, stt: sttCost, llm: llmCost, tts: ttsCost },
            phaseTimings: Object.fromEntries(
                Object.entries(stats.phaseTimings).map(([k, v]) => [k, formatDuration(v)])
            ),
            transcript: transcript.map(m => ({
                type: m.type,
                text: m.text,
                timestamp: new Date(m.timestamp).toISOString(),
                controller: m.controller?.name || undefined,
            })),
        };
        const blob = new Blob([JSON.stringify(sessionData, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `atc-session-${Date.now()}.json`;
        a.click();
        URL.revokeObjectURL(url);
    };

    const shareFlight = () => {
        const summary = [
            `✈ MSFS ATC Flight Report`,
            `━━━━━━━━━━━━━━━━━━━━━━━━━━`,
            `${flightPlan?.callsign || 'N/A'} | ${flightPlan?.origin || '????'} → ${flightPlan?.destination || '????'}`,
            `Aircraft: ${flightPlan?.aircraftType || 'N/A'}`,
            `Flight Time: ${stats.flightTime}`,
            `Transmissions: ${stats.pilotCount} pilot / ${stats.atcCount} ATC`,
            stats.corrections > 0 ? `Readback Corrections: ${stats.corrections}` : null,
            stats.goArounds > 0 ? `Go-Arounds: ${stats.goArounds}` : null,
            `Session Cost: $${totalCost.toFixed(4)}`,
        ].filter(Boolean).join('\n');

        navigator.clipboard.writeText(summary);
    };

    return (
        <div className="glass-panel p-6 space-y-4">
            <h2 className="text-lg font-bold text-atc-text">✈ Session Summary</h2>

            {/* Main stats */}
            <div className="grid grid-cols-4 gap-3">
                {[
                    { label: 'Flight Time', value: stats.flightTime, color: 'text-atc-cyan' },
                    { label: 'Pilot Calls', value: stats.pilotCount, color: 'text-atc-accent' },
                    { label: 'ATC Responses', value: stats.atcCount, color: 'text-atc-green' },
                    { label: 'Flight', value: flightPlan ? `${flightPlan.origin}→${flightPlan.destination}` : 'N/A', color: 'text-atc-cyan' },
                ].map(({ label, value, color }) => (
                    <div key={label} className="bg-atc-surface-2/50 rounded-lg p-3 text-center">
                        <div className="text-xs text-atc-text-muted">{label}</div>
                        <div className={`text-lg font-bold font-mono ${color}`}>{value}</div>
                    </div>
                ))}
            </div>

            {/* Secondary stats */}
            <div className="grid grid-cols-3 gap-3">
                <div className="bg-atc-surface-2/50 rounded-lg p-3 text-center">
                    <div className="text-xs text-atc-text-muted">Corrections</div>
                    <div className={`text-lg font-bold font-mono ${stats.corrections > 0 ? 'text-atc-amber' : 'text-atc-green'}`}>{stats.corrections}</div>
                </div>
                <div className="bg-atc-surface-2/50 rounded-lg p-3 text-center">
                    <div className="text-xs text-atc-text-muted">Go-Arounds</div>
                    <div className={`text-lg font-bold font-mono ${stats.goArounds > 0 ? 'text-atc-amber' : 'text-atc-green'}`}>{stats.goArounds}</div>
                </div>
                <div className="bg-atc-surface-2/50 rounded-lg p-3 text-center">
                    <div className="text-xs text-atc-text-muted">Session Cost</div>
                    <div className={`text-lg font-bold font-mono ${totalCost > 0 ? 'text-atc-amber' : 'text-atc-green'}`}>${totalCost.toFixed(2)}</div>
                </div>
            </div>

            {/* Phase timing breakdown */}
            {Object.keys(stats.phaseTimings).length > 0 && (
                <div className="space-y-2">
                    <div className="text-xs font-semibold text-atc-text-dim">Phase Timing</div>
                    <div className="grid grid-cols-3 gap-1.5">
                        {Object.entries(stats.phaseTimings).map(([phase, ms]) => (
                            <div key={phase} className="flex justify-between px-2 py-1 rounded bg-white/5 text-[10px] font-mono">
                                <span className="text-atc-text-muted">{phase}</span>
                                <span className="text-atc-text">{formatDuration(ms)}</span>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* Cost breakdown */}
            {totalCost > 0 && (
                <div className="space-y-2">
                    <div className="text-xs font-semibold text-atc-text-dim">Cost Breakdown</div>
                    <div className="grid grid-cols-3 gap-2">
                        {[
                            { label: 'STT', cost: sttCost },
                            { label: 'LLM', cost: llmCost },
                            { label: 'TTS', cost: ttsCost },
                        ].map(({ label, cost }) => (
                            <div key={label} className="flex justify-between px-2 py-1 rounded bg-white/5 text-[10px] font-mono">
                                <span className="text-atc-text-muted">{label}</span>
                                <span className="text-atc-amber">${cost.toFixed(4)}</span>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* Export buttons */}
            <div className="grid grid-cols-3 gap-2">
                <button
                    onClick={exportTranscript}
                    className="py-2 bg-atc-accent/20 text-atc-accent border border-atc-accent/30 rounded-lg text-sm font-medium hover:bg-atc-accent/30 transition-all"
                >
                    📥 TXT Transcript
                </button>
                <button
                    onClick={exportJson}
                    className="py-2 bg-atc-accent/20 text-atc-accent border border-atc-accent/30 rounded-lg text-sm font-medium hover:bg-atc-accent/30 transition-all"
                >
                    📋 JSON Export
                </button>
                <button
                    onClick={shareFlight}
                    className="py-2 bg-atc-accent/20 text-atc-accent border border-atc-accent/30 rounded-lg text-sm font-medium hover:bg-atc-accent/30 transition-all"
                >
                    ✈ Share Flight
                </button>
            </div>
        </div>
    );
}

