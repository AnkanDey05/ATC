import React, { useState, useRef, useEffect, useCallback } from 'react';
import ATCCard from './ATCCard';
import FlightPlanStrip from './FlightPlanStrip';
import Transcript from './Transcript';
import PTTButton from './PTTButton';
import CostBadge from './CostBadge';

const api = window.electronAPI;

export default function Dashboard({ simState, atcPhase, transcript, costs, isRecording, isProcessing, onSendMessage, simConnected, simMock }) {
    const [textInput, setTextInput] = useState('');
    const [freqInput, setFreqInput] = useState('');
    const [freqError, setFreqError] = useState(false);
    const inputRef = useRef(null);
    const freqRef = useRef(null);

    const phase = atcPhase?.phase || 'ATIS';
    const controller = atcPhase?.controller || null;
    const stations = atcPhase?.stations || {};

    // Sync frequency input with current station
    useEffect(() => {
        if (controller?.frequency) {
            setFreqInput(controller.frequency);
            setFreqError(false);
        }
    }, [controller?.frequency]);

    const handleFreqSubmit = useCallback(async (e) => {
        e?.preventDefault();
        if (!api || !freqInput.trim()) return;

        const result = await api.tuneFrequency(freqInput.trim());
        if (result?.matched) {
            setFreqError(false);
        } else {
            setFreqError(true);
            setTimeout(() => setFreqError(false), 2000);
        }
    }, [freqInput]);

    const handleSubmit = (e) => {
        e.preventDefault();
        if (textInput.trim()) {
            onSendMessage(textInput);
            setTextInput('');
        }
    };

    // Build station list for quick reference
    const stationList = Object.entries(stations).map(([ph, s]) => ({
        phase: ph,
        ...s,
        active: ph === phase,
    }));

    return (
        <div className="h-full flex flex-col p-3 gap-3">
            {/* ── Frequency Tuner + Station List ─────── */}
            <div className="glass-panel px-4 py-2.5 shrink-0">
                <div className="flex items-center gap-4">
                    {/* Active frequency tuner */}
                    <form onSubmit={handleFreqSubmit} className="flex items-center gap-2">
                        <span className="text-[10px] text-atc-text-muted font-mono uppercase">COM1</span>
                        <input
                            ref={freqRef}
                            type="text"
                            value={freqInput}
                            onChange={(e) => setFreqInput(e.target.value)}
                            onBlur={handleFreqSubmit}
                            className={`
                                w-24 bg-black/40 border rounded px-2 py-1 text-lg font-mono font-bold text-center
                                focus:outline-none transition-colors
                                ${freqError
                                    ? 'border-red-500 text-red-400'
                                    : 'border-atc-accent/40 text-atc-green focus:border-atc-accent'
                                }
                            `}
                            placeholder="118.00"
                        />
                        {controller && (
                            <span className="text-xs font-mono text-atc-accent">
                                {controller.station}
                            </span>
                        )}
                    </form>

                    {/* Divider */}
                    <div className="w-px h-6 bg-atc-border" />

                    {/* Station frequency list */}
                    <div className="flex items-center gap-2 overflow-x-auto">
                        {stationList.map((s) => (
                            <button
                                key={s.phase}
                                onClick={() => {
                                    setFreqInput(s.frequency);
                                    if (api) api.tuneFrequency(s.frequency);
                                }}
                                className={`
                                    flex flex-col items-center px-2 py-0.5 rounded text-[10px] font-mono
                                    transition-all cursor-pointer whitespace-nowrap
                                    ${s.active
                                        ? 'bg-atc-accent/15 text-atc-accent border border-atc-accent/30'
                                        : 'text-atc-text-muted hover:text-atc-text hover:bg-white/5 border border-transparent'
                                    }
                                `}
                            >
                                <span className="font-semibold">{s.station}</span>
                                <span className={s.active ? 'text-atc-green' : 'text-atc-text-dim'}>{s.frequency}</span>
                            </button>
                        ))}
                    </div>

                    {/* Connection status */}
                    <div className="ml-auto flex items-center gap-1.5">
                        <span className={`status-dot ${simConnected ? 'connected' : 'disconnected'}`} />
                        <span className="text-[10px] text-atc-text-muted font-mono">
                            {simConnected ? 'MSFS' : 'Offline'}
                        </span>
                    </div>
                </div>
            </div>

            {/* ── Main Content Grid ─────────────────── */}
            <div className="flex-1 grid grid-cols-[1fr_340px] gap-3 min-h-0">
                <div className="flex flex-col gap-3 min-h-0">
                    <ATCCard
                        phase={phase}
                        controller={controller}
                        simState={simState}
                        simConnected={simConnected}
                        simMock={simMock}
                    />
                    <FlightPlanStrip simState={simState} phase={phase} />
                </div>
                <div className="flex flex-col gap-3 min-h-0">
                    <Transcript messages={transcript} />
                </div>
            </div>

            {/* ── Bottom: PTT + Text Input + Cost ──── */}
            <div className="glass-panel px-4 py-3 flex items-center gap-3 shrink-0">
                <PTTButton isRecording={isRecording} />

                <form onSubmit={handleSubmit} className="flex-1 flex gap-2">
                    <input
                        ref={inputRef}
                        type="text"
                        value={textInput}
                        onChange={(e) => setTextInput(e.target.value)}
                        placeholder="Type your radio call... (or hold SPACE for PTT)"
                        className="flex-1 bg-atc-surface-2 border border-atc-border rounded-lg px-3 py-2 text-sm text-atc-text placeholder:text-atc-text-muted focus:outline-none focus:border-atc-accent/50 transition-colors font-mono"
                    />
                    <button
                        type="submit"
                        disabled={!textInput.trim() || isProcessing}
                        className="px-4 py-2 bg-atc-accent/20 text-atc-accent border border-atc-accent/30 rounded-lg text-sm font-medium hover:bg-atc-accent/30 disabled:opacity-30 disabled:cursor-not-allowed transition-all min-w-[80px]"
                    >
                        {isProcessing ? (
                            <span className="flex items-center gap-1.5">
                                <span className="w-3 h-3 border-2 border-atc-accent/30 border-t-atc-accent rounded-full animate-spin" />
                                ATC...
                            </span>
                        ) : 'Send ↵'}
                    </button>
                </form>

                <CostBadge costs={costs} />
            </div>
        </div>
    );
}
