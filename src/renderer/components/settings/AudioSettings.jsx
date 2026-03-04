import React, { useState, useEffect } from 'react';

const api = window.electronAPI;

export default function AudioSettings({ onAudioSettingsChange }) {
    const [settings, setSettings] = useState({
        radioEffect: true,
        inputDevice: 'default',
        outputDevice: 'default',
        volume: 0.8,
    });

    useEffect(() => {
        if (api) {
            api.getSettings().then(s => {
                if (s?.audio) setSettings(s.audio);
            });
        }
    }, []);

    const updateSetting = (key, value) => {
        const updated = { ...settings, [key]: value };
        setSettings(updated);
        if (api) api.setSettings('audio', updated);
        if (onAudioSettingsChange) onAudioSettingsChange(updated);
    };

    return (
        <div className="space-y-6 max-w-2xl">
            <div>
                <h2 className="text-lg font-bold text-atc-text mb-1">Audio Settings</h2>
                <p className="text-xs text-atc-text-muted">Configure audio devices and radio effects.</p>
            </div>

            {/* Radio Effect */}
            <div className="glass-panel-solid p-5 space-y-4">
                <h3 className="font-semibold text-atc-text text-sm">📻 Radio Audio Effect</h3>
                <p className="text-xs text-atc-text-muted">
                    Applies a VHF radio bandpass filter (300Hz–3400Hz) and light static to all ATC voice audio for realism.
                </p>

                <label className="flex items-center gap-3 cursor-pointer">
                    <div
                        onClick={() => updateSetting('radioEffect', !settings.radioEffect)}
                        className={`relative w-10 h-5 rounded-full transition-colors cursor-pointer ${settings.radioEffect ? 'bg-atc-accent' : 'bg-atc-surface-2 border border-atc-border'
                            }`}
                    >
                        <div className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-transform ${settings.radioEffect ? 'translate-x-5' : 'translate-x-0.5'
                            }`} />
                    </div>
                    <span className="text-sm text-atc-text">{settings.radioEffect ? 'Enabled' : 'Disabled'}</span>
                </label>
            </div>

            {/* Volume */}
            <div className="glass-panel-solid p-5 space-y-4">
                <h3 className="font-semibold text-atc-text text-sm">🔊 Output Volume</h3>
                <div className="flex items-center gap-3">
                    <input
                        type="range"
                        min="0"
                        max="1"
                        step="0.05"
                        value={settings.volume}
                        onChange={(e) => updateSetting('volume', parseFloat(e.target.value))}
                        className="flex-1 h-1.5 rounded-lg appearance-none bg-atc-surface-2 accent-atc-accent cursor-pointer"
                    />
                    <span className="text-sm font-mono text-atc-text w-12 text-right">
                        {Math.round(settings.volume * 100)}%
                    </span>
                </div>
            </div>
        </div>
    );
}
