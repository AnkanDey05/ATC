import React, { useState, useEffect } from 'react';
import ProviderToggles from './ProviderToggles';
import AudioSettings from './AudioSettings';
import KeybindSettings from './KeybindSettings';

const api = window.electronAPI;

const TABS = [
    { id: 'providers', label: '🤖 AI Providers', icon: '🤖' },
    { id: 'audio', label: '🔊 Audio', icon: '🔊' },
    { id: 'keybinds', label: '⌨ Keybinds', icon: '⌨' },
    { id: 'display', label: '💻 Display', icon: '💻' },
];

export default function Settings({ providerConfig, onConfigChange, costs, onAudioSettingsChange }) {
    const [activeTab, setActiveTab] = useState('providers');
    const [apiKeys, setApiKeys] = useState({});

    useEffect(() => {
        if (api) {
            api.getApiKeys().then(setApiKeys);
        }
    }, []);

    const totalCost = costs?.costs?.total || 0;

    return (
        <div className="h-full flex overflow-hidden">
            {/* Sidebar nav */}
            <div className="w-48 bg-atc-surface/50 border-r border-atc-border p-3 flex flex-col gap-1 shrink-0">
                <div className="text-xs font-semibold text-atc-text-muted mb-2 px-2">SETTINGS</div>

                {TABS.map(tab => (
                    <button
                        key={tab.id}
                        onClick={() => setActiveTab(tab.id)}
                        className={`w-full text-left px-3 py-2 rounded-lg text-sm transition-all ${activeTab === tab.id
                            ? 'bg-atc-accent/15 text-atc-accent border border-atc-accent/20'
                            : 'text-atc-text-dim hover:bg-white/5 hover:text-atc-text border border-transparent'
                            }`}
                    >
                        {tab.label}
                    </button>
                ))}

                {/* Cost summary in sidebar */}
                <div className="mt-auto glass-panel p-3 space-y-2">
                    <div className="text-xs text-atc-text-muted">Session Cost</div>
                    <div className="text-xl font-mono font-bold text-atc-amber">
                        ${totalCost.toFixed(4)}
                    </div>
                    <div className="text-[10px] text-atc-text-muted space-y-0.5">
                        <div>STT: ${(costs?.costs?.stt || 0).toFixed(4)}</div>
                        <div>LLM: ${(costs?.costs?.llm || 0).toFixed(4)}</div>
                        <div>TTS: ${(costs?.costs?.tts || 0).toFixed(4)}</div>
                    </div>
                    <button
                        onClick={() => api?.resetCosts()}
                        className="w-full text-xs text-atc-text-muted hover:text-atc-text bg-atc-surface-2 hover:bg-atc-surface-2/80 rounded px-2 py-1 transition-colors"
                    >
                        Reset Counter
                    </button>
                </div>
            </div>

            {/* Content */}
            <div className="flex-1 overflow-y-auto p-6">
                {activeTab === 'providers' && (
                    <ProviderToggles
                        config={providerConfig}
                        onConfigChange={onConfigChange}
                        apiKeys={apiKeys}
                        onApiKeysChange={setApiKeys}
                    />
                )}
                {activeTab === 'audio' && <AudioSettings onAudioSettingsChange={onAudioSettingsChange} />}
                {activeTab === 'keybinds' && <KeybindSettings />}
                {activeTab === 'display' && (
                    <div className="glass-panel-solid p-5 space-y-4">
                        <div className="flex items-center gap-2">
                            <span className="text-lg">💻</span>
                            <h3 className="font-semibold text-atc-text">Display Settings</h3>
                        </div>
                        <div className="flex items-center justify-between p-3 rounded-lg bg-white/5">
                            <div>
                                <div className="text-sm font-medium text-atc-text">Overlay Mode</div>
                                <div className="text-xs text-atc-text-muted">Always-on-top, compact, semi-transparent window</div>
                            </div>
                            <button
                                onClick={() => api?.setOverlayMode(true)}
                                className="px-3 py-1.5 bg-atc-accent/20 text-atc-accent border border-atc-accent/30 rounded text-xs font-medium hover:bg-atc-accent/30 transition-all"
                            >
                                Enable Overlay
                            </button>
                        </div>
                        <div className="flex items-center justify-between p-3 rounded-lg bg-white/5">
                            <div>
                                <div className="text-sm font-medium text-atc-text">Normal Mode</div>
                                <div className="text-xs text-atc-text-muted">Full-size resizable window</div>
                            </div>
                            <button
                                onClick={() => api?.setOverlayMode(false)}
                                className="px-3 py-1.5 bg-atc-surface-2 text-atc-text-muted border border-atc-border rounded text-xs font-medium hover:text-atc-text hover:bg-atc-surface-2/80 transition-all"
                            >
                                Normal Mode
                            </button>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}
