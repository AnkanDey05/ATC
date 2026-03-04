import React, { useState, useRef, useEffect, useCallback } from 'react';
import ATCCard from './ATCCard';
import FlightPlanStrip from './FlightPlanStrip';
import Transcript from './Transcript';
import PTTButton from './PTTButton';
import CostBadge from './CostBadge';
import QuickActions from './QuickActions';
import TaxiDiagram from './TaxiDiagram';

const api = window.electronAPI;

export default function Dashboard({ simState, atcPhase, transcript, costs, isRecording, isProcessing, onSendMessage, simConnected, simMock, flightPlan }) {
    const [textInput, setTextInput] = useState('');
    const [freqInput, setFreqInput] = useState('');
    const [freqError, setFreqError] = useState(false);

    // A2: Copilot state
    const [copilotActive, setCopilotActive] = useState(false);
    // A3: Auto-respond state
    const [autoRespondActive, setAutoRespondActive] = useState(false);
    // A5: TOD alert
    const [todAlert, setTodAlert] = useState(null);
    // A4: Auto-tune toast
    const [autoTuneToast, setAutoTuneToast] = useState(null);

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

    // A3: Auto-deactivate auto-respond when leaving CENTER
    useEffect(() => {
        if (phase !== 'CENTER' && autoRespondActive) {
            setAutoRespondActive(false);
            if (api) api.disableAutoRespond();
        }
    }, [phase]);

    // A4: Listen for auto-tune events
    useEffect(() => {
        if (!api) return;
        const unsubs = [
            api.onAutoTuned?.((data) => {
                setAutoTuneToast(`Auto-tuned to ${data.phase}`);
                setTimeout(() => setAutoTuneToast(null), 3000);
            }),
            api.onTodAlert?.((data) => {
                setTodAlert(data);
            }),
        ];
        return () => unsubs.forEach(u => u && u());
    }, []);

    // A5: Dismiss TOD when descending
    useEffect(() => {
        if (todAlert && simState?.verticalSpeed < -200) {
            setTodAlert(null);
        }
    }, [simState?.verticalSpeed, todAlert]);

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

    // A2: Copilot toggle
    const toggleCopilot = async () => {
        if (!api) return;
        if (copilotActive) {
            await api.disableCopilot();
            setCopilotActive(false);
        } else {
            await api.enableCopilot();
            setCopilotActive(true);
        }
    };

    // A3: Auto-respond toggle
    const toggleAutoRespond = async () => {
        if (!api || phase !== 'CENTER') return;
        if (autoRespondActive) {
            await api.disableAutoRespond();
            setAutoRespondActive(false);
        } else {
            await api.enableAutoRespond();
            setAutoRespondActive(true);
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
            {/* ── Auto-tune toast ─────────────────────── */}
            {autoTuneToast && (
                <div className="fixed top-4 left-1/2 -translate-x-1/2 z-50 px-4 py-2 bg-atc-accent/20 border border-atc-accent/40 rounded-lg text-atc-accent text-sm font-mono animate-fade-in">
                    📡 {autoTuneToast}
                </div>
            )}

            {/* ── TOD Alert Banner ────────────────────── */}
            {todAlert && (
                <div className="glass-panel px-4 py-2 border-amber-500/40 bg-amber-900/20 shrink-0 flex items-center justify-between">
                    <span className="text-amber-400 text-sm font-mono">
                        ⬇️ TOD in ~{todAlert.distance}nm — Request descent clearance
                    </span>
                    <button
                        onClick={() => {
                            onSendMessage(`Request descent clearance`);
                            setTodAlert(null);
                        }}
                        className="px-2 py-0.5 bg-amber-500/20 border border-amber-500/40 rounded text-amber-300 text-xs font-mono hover:bg-amber-500/30 transition-colors"
                    >
                        Request Descent
                    </button>
                </div>
            )}

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

                    {/* Status badges */}
                    <div className="ml-auto flex items-center gap-2">
                        {copilotActive && (
                            <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-blue-500/20 text-blue-400 border border-blue-500/30">
                                🤖 COPILOT
                            </span>
                        )}
                        {autoRespondActive && (
                            <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                                ✈️ AUTO
                            </span>
                        )}
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

            {/* ── B4: Taxi Diagram (GROUND phases only) ── */}
            <TaxiDiagram simState={simState} transcript={transcript} phase={phase} />

            {/* ── Quick Actions ───────────────────────── */}
            <div className="glass-panel px-4 py-2 shrink-0">
                <QuickActions
                    phase={phase}
                    simState={simState}
                    flightPlan={flightPlan}
                    onAction={onSendMessage}
                />
            </div>

            {/* ── Bottom: PTT + Toggles + Text Input + Cost ── */}
            <div className="glass-panel px-4 py-3 flex items-center gap-3 shrink-0">
                {/* A2: Copilot toggle */}
                <button
                    onClick={toggleCopilot}
                    title={copilotActive ? 'Disable Copilot' : 'Enable Copilot'}
                    className={`
                        w-9 h-9 rounded-lg flex items-center justify-center text-lg border transition-all
                        ${copilotActive
                            ? 'bg-blue-500/20 border-blue-500/50 text-blue-400 shadow-[0_0_8px_rgba(59,130,246,0.3)]'
                            : 'bg-atc-surface-2 border-atc-border text-atc-text-muted hover:text-atc-text hover:border-atc-accent/30'
                        }
                    `}
                >
                    🤖
                </button>

                {/* A3: Auto-respond toggle (CENTER only) */}
                <button
                    onClick={toggleAutoRespond}
                    disabled={phase !== 'CENTER'}
                    title={phase !== 'CENTER' ? 'Auto-respond (CENTER only)' : autoRespondActive ? 'Disable Auto-respond' : 'Enable Auto-respond'}
                    className={`
                        w-9 h-9 rounded-lg flex items-center justify-center text-lg border transition-all
                        ${phase !== 'CENTER'
                            ? 'bg-atc-surface-2 border-atc-border text-atc-text-dim opacity-40 cursor-not-allowed'
                            : autoRespondActive
                                ? 'bg-emerald-500/20 border-emerald-500/50 text-emerald-400 shadow-[0_0_8px_rgba(16,185,129,0.3)]'
                                : 'bg-atc-surface-2 border-atc-border text-atc-text-muted hover:text-atc-text hover:border-atc-accent/30'
                        }
                    `}
                >
                    ✈️
                </button>

                <PTTButton isRecording={isRecording} />

                <form onSubmit={handleSubmit} className="flex-1 flex gap-2">
                    <input
                        ref={inputRef}
                        type="text"
                        value={textInput}
                        onChange={(e) => setTextInput(e.target.value)}
                        placeholder={copilotActive ? 'Copilot active — auto-responding...' : 'Type your radio call... (or hold SPACE for PTT)'}
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
