import React from 'react';

export default function SessionSummary({ transcript, costs, flightPlan }) {
    const pilotMessages = transcript.filter(m => m.type === 'pilot').length;
    const atcMessages = transcript.filter(m => m.type === 'atc').length;
    const totalCost = costs?.costs?.total || 0;

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

    return (
        <div className="glass-panel p-6 space-y-4">
            <h2 className="text-lg font-bold text-atc-text">✈ Session Summary</h2>

            <div className="grid grid-cols-4 gap-3">
                {[
                    { label: 'Pilot Calls', value: pilotMessages, color: 'text-atc-accent' },
                    { label: 'ATC Responses', value: atcMessages, color: 'text-atc-green' },
                    { label: 'Session Cost', value: `$${totalCost.toFixed(2)}`, color: totalCost > 0 ? 'text-atc-amber' : 'text-atc-green' },
                    { label: 'Flight', value: flightPlan ? `${flightPlan.origin}→${flightPlan.destination}` : 'N/A', color: 'text-atc-cyan' },
                ].map(({ label, value, color }) => (
                    <div key={label} className="bg-atc-surface-2/50 rounded-lg p-3 text-center">
                        <div className="text-xs text-atc-text-muted">{label}</div>
                        <div className={`text-lg font-bold font-mono ${color}`}>{value}</div>
                    </div>
                ))}
            </div>

            <button
                onClick={exportTranscript}
                className="w-full py-2 bg-atc-accent/20 text-atc-accent border border-atc-accent/30 rounded-lg text-sm font-medium hover:bg-atc-accent/30 transition-all"
            >
                📥 Export Transcript
            </button>
        </div>
    );
}
