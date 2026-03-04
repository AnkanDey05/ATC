import React, { useState, useEffect, useCallback, useRef } from 'react';
import Dashboard from './components/Dashboard';
import Settings from './components/settings/Settings';
import audioEngine from './audioEngine';

const api = window.electronAPI;

// Helper: check if event target is an interactive element
function isInputFocused(e) {
    const tag = e.target.tagName;
    return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || e.target.isContentEditable;
}

export default function App() {
    const [view, setView] = useState('dashboard'); // 'dashboard' | 'settings'
    const [simState, setSimState] = useState(null);
    const [simConnected, setSimConnected] = useState(false);
    const [simMock, setSimMock] = useState(false);
    const [atcPhase, setAtcPhase] = useState({ phase: 'PREFLIGHT', controller: null });
    const [transcript, setTranscript] = useState([]);
    const [costs, setCosts] = useState({ costs: { total: 0 }, usage: {} });
    const [isRecording, setIsRecording] = useState(false);
    const [isProcessing, setIsProcessing] = useState(false);
    const [providerConfig, setProviderConfig] = useState(null);
    const [flightPlan, setFlightPlan] = useState(null);

    // Load initial data & sync audio settings
    useEffect(() => {
        if (!api) return;

        api.getProviderConfig().then(setProviderConfig);
        api.getCosts().then(setCosts);
        api.getAtcState().then(setAtcPhase);
        api.getFlightPlan().then(fp => { if (fp) setFlightPlan(fp); });

        // Apply saved audio settings to the engine
        api.getSettings().then(settings => {
            if (settings?.audio) {
                audioEngine.setRadioEffect(settings.audio.radioEffect !== false);
                audioEngine.setVolume(settings.audio.volume ?? 0.8);
            }
        });

        // Subscribe to events
        const unsubs = [
            api.onSimState((state) => setSimState(state)),
            api.onSimConnection((status) => {
                setSimConnected(status.connected);
                setSimMock(status.mock);
            }),
            api.onAtcPhase((phase) => {
                setAtcPhase(phase);
                setTranscript(prev => [...prev, {
                    type: 'system',
                    text: `✦ ${phase.to} — ${phase.controller?.name || 'Controller'} on ${phase.controller?.frequency || '121.5'}`,
                    timestamp: Date.now(),
                }]);
            }),
            api.onAtcResponse((response) => {
                setTranscript(prev => [...prev, {
                    type: 'atc',
                    text: response.text || response,
                    controller: response.controller,
                    timestamp: Date.now(),
                }]);
            }),
            api.onCostUpdate(setCosts),
            api.onPttStatus((status) => setIsRecording(status.recording)),

            // ── TTS Audio Playback ────────────────────────
            api.onTtsAudio(async (data) => {
                if (data?.audio) {
                    try {
                        await audioEngine.play(data.audio);
                    } catch (err) {
                        console.error('[App] Audio playback failed:', err);
                    }
                }

                // Also add to transcript if text came with audio
                if (data?.text) {
                    setTranscript(prev => {
                        // Avoid duplicate — check if the last ATC message matches
                        const last = prev[prev.length - 1];
                        if (last?.type === 'atc' && last?.text === data.text) return prev;
                        return [...prev, {
                            type: 'atc',
                            text: data.text,
                            controller: data.controller,
                            timestamp: Date.now(),
                        }];
                    });
                }
            }),

            // A2: Copilot auto-responses
            api.onCopilotResponse?.((data) => {
                if (data?.text) {
                    setTranscript(prev => [...prev, {
                        type: 'pilot',
                        text: `🤖 ${data.text}`,
                        timestamp: Date.now(),
                    }]);
                }
            }),
            // A3: Auto-respond responses
            api.onAutoRespondResponse?.((data) => {
                if (data?.text) {
                    setTranscript(prev => [...prev, {
                        type: 'pilot',
                        text: `✈️ ${data.text}`,
                        timestamp: Date.now(),
                    }]);
                }
            }),
        ];

        return () => unsubs.forEach(unsub => unsub && unsub());
    }, []);

    // PTT key stored as ref to avoid stale closures
    const pttKeyRef = useRef('Space');
    const mediaRecorderRef = useRef(null);
    const audioChunksRef = useRef([]);
    const streamRef = useRef(null);

    useEffect(() => {
        if (api) {
            api.getSettings().then(s => {
                if (s?.keybinds?.ptt) pttKeyRef.current = s.keybinds.ptt;
            });
        }
    }, []);

    // Start mic recording
    const startRecording = useCallback(async () => {
        if (isProcessing || isRecording) return;

        try {
            const stream = await navigator.mediaDevices.getUserMedia({
                audio: { channelCount: 1, sampleRate: 16000 }
            });
            streamRef.current = stream;
            audioChunksRef.current = [];

            const recorder = new MediaRecorder(stream, {
                mimeType: MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
                    ? 'audio/webm;codecs=opus'
                    : 'audio/webm'
            });

            recorder.ondataavailable = (e) => {
                if (e.data.size > 0) audioChunksRef.current.push(e.data);
            };

            recorder.onstop = async () => {
                // Combine chunks into a single blob
                const blob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
                const arrayBuffer = await blob.arrayBuffer();
                const audioArray = Array.from(new Uint8Array(arrayBuffer));

                // Stop all mic tracks
                if (streamRef.current) {
                    streamRef.current.getTracks().forEach(t => t.stop());
                    streamRef.current = null;
                }

                if (audioArray.length < 1000) {
                    console.warn('[PTT] Recording too short, skipping');
                    return;
                }

                setIsProcessing(true);

                try {
                    const result = await api.sendAudio(audioArray);
                    if (result?.silent) {
                        // Handoff message — no ATC response, no transcript entry
                    } else if (result && !result.error && result.transcript) {
                        // Add pilot's spoken text to transcript
                        setTranscript(prev => [...prev, {
                            type: 'pilot',
                            text: result.transcript,
                            timestamp: Date.now(),
                        }]);
                        // ATC response + audio comes via tts:audio event
                    } else if (result?.error) {
                        setTranscript(prev => [...prev, {
                            type: 'system',
                            text: `⚠ STT Error: ${result.error}`,
                            timestamp: Date.now(),
                        }]);
                    }
                } catch (err) {
                    setTranscript(prev => [...prev, {
                        type: 'system',
                        text: `⚠ Voice pipeline error: ${err.message}`,
                        timestamp: Date.now(),
                    }]);
                } finally {
                    setIsProcessing(false);
                }
            };

            mediaRecorderRef.current = recorder;
            recorder.start(100); // Collect data every 100ms
            setIsRecording(true);
        } catch (err) {
            console.error('[PTT] Mic access error:', err);
            setTranscript(prev => [...prev, {
                type: 'system',
                text: `⚠ Microphone error: ${err.message}`,
                timestamp: Date.now(),
            }]);
        }
    }, [isProcessing, isRecording]);

    // Stop mic recording
    const stopRecording = useCallback(() => {
        if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
            mediaRecorderRef.current.stop();
        }
        setIsRecording(false);
    }, []);

    // PTT keyboard handler
    useEffect(() => {
        if (!api) return;

        const handleKeyDown = (e) => {
            if (isInputFocused(e)) return;
            if (e.code === pttKeyRef.current && !e.repeat && view === 'dashboard') {
                e.preventDefault();
                startRecording();
            }
        };
        const handleKeyUp = (e) => {
            if (isInputFocused(e)) return;
            if (e.code === pttKeyRef.current && view === 'dashboard') {
                e.preventDefault();
                stopRecording();
            }
        };

        window.addEventListener('keydown', handleKeyDown);
        window.addEventListener('keyup', handleKeyUp);
        return () => {
            window.removeEventListener('keydown', handleKeyDown);
            window.removeEventListener('keyup', handleKeyUp);
        };
    }, [view, startRecording, stopRecording]);

    // Send typed message → LLM → TTS
    const sendMessage = useCallback(async (text) => {
        if (!api || !text.trim() || isProcessing) return;

        setTranscript(prev => [...prev, {
            type: 'pilot',
            text: text.trim(),
            timestamp: Date.now(),
        }]);

        setIsProcessing(true);

        try {
            const result = await api.sendTranscript(text.trim());
            // The ATC response text + audio arrive via the tts:audio event,
            // which is handled by onTtsAudio listener above.
            // We only handle errors here.
            if (result?.error) {
                setTranscript(prev => [...prev, {
                    type: 'system',
                    text: `⚠ Error: ${result.error}`,
                    timestamp: Date.now(),
                }]);
            }
        } catch (err) {
            setTranscript(prev => [...prev, {
                type: 'system',
                text: `⚠ Pipeline error: ${err.message}`,
                timestamp: Date.now(),
            }]);
        } finally {
            setIsProcessing(false);
        }
    }, [isProcessing]);

    // Audio settings sync callback
    const handleAudioSettingsChange = useCallback((audioSettings) => {
        audioEngine.setRadioEffect(audioSettings.radioEffect !== false);
        audioEngine.setVolume(audioSettings.volume ?? 0.8);
    }, []);

    return (
        <div className="h-screen flex flex-col bg-atc-bg overflow-hidden">
            {/* ── Title Bar ─────────────────────── */}
            <div className="titlebar-drag h-9 flex items-center justify-between px-4 bg-atc-surface/80 border-b border-atc-border shrink-0">
                <div className="flex items-center gap-2">
                    <div className="text-atc-accent font-bold text-sm tracking-wider">✈ MSFS ATC</div>
                    <div className="flex items-center gap-1.5 ml-4">
                        <span className={`status-dot ${simConnected ? 'connected' : simMock ? 'pending' : 'disconnected'}`} />
                        <span className="text-xs text-atc-text-muted">
                            {simConnected ? 'SimConnect' : simMock ? 'Mock Mode' : 'Disconnected'}
                        </span>
                    </div>
                    {isProcessing && (
                        <div className="flex items-center gap-1 ml-3">
                            <div className="w-1.5 h-1.5 rounded-full bg-atc-amber animate-pulse" />
                            <span className="text-[10px] text-atc-amber">Processing...</span>
                        </div>
                    )}
                </div>

                <div className="titlebar-no-drag flex items-center gap-1">
                    <button
                        onClick={() => setView('dashboard')}
                        className={`px-3 py-1 text-xs rounded transition-all ${view === 'dashboard'
                            ? 'bg-atc-accent/20 text-atc-accent'
                            : 'text-atc-text-muted hover:text-atc-text'
                            }`}
                    >
                        Dashboard
                    </button>
                    <button
                        onClick={() => setView('settings')}
                        className={`px-3 py-1 text-xs rounded transition-all ${view === 'settings'
                            ? 'bg-atc-accent/20 text-atc-accent'
                            : 'text-atc-text-muted hover:text-atc-text'
                            }`}
                    >
                        ⚙ Settings
                    </button>

                    <div className="flex ml-4 gap-0.5">
                        <button onClick={() => api?.minimizeWindow()} className="w-7 h-7 flex items-center justify-center text-atc-text-muted hover:bg-white/10 rounded text-xs">─</button>
                        <button onClick={() => api?.maximizeWindow()} className="w-7 h-7 flex items-center justify-center text-atc-text-muted hover:bg-white/10 rounded text-xs">□</button>
                        <button onClick={() => api?.closeWindow()} className="w-7 h-7 flex items-center justify-center text-atc-text-muted hover:bg-red-500/80 hover:text-white rounded text-xs">✕</button>
                    </div>
                </div>
            </div>

            {/* ── Content ───────────────────────── */}
            <div className="flex-1 overflow-hidden">
                {view === 'dashboard' ? (
                    <Dashboard
                        simState={simState}
                        atcPhase={atcPhase}
                        transcript={transcript}
                        costs={costs}
                        isRecording={isRecording}
                        isProcessing={isProcessing}
                        onSendMessage={sendMessage}
                        simConnected={simConnected}
                        simMock={simMock}
                        flightPlan={flightPlan}
                    />
                ) : (
                    <Settings
                        providerConfig={providerConfig}
                        onConfigChange={setProviderConfig}
                        costs={costs}
                        onAudioSettingsChange={handleAudioSettingsChange}
                    />
                )}
            </div>
        </div>
    );
}
