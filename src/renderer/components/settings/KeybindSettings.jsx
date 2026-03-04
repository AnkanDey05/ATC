import React, { useState, useEffect } from 'react';

const api = window.electronAPI;

export default function KeybindSettings() {
    const [pttKey, setPttKey] = useState('Space');
    const [listening, setListening] = useState(false);

    useEffect(() => {
        if (api) {
            api.getSettings().then(s => {
                if (s?.keybinds?.ptt) setPttKey(s.keybinds.ptt);
            });
        }
    }, []);

    const startListening = () => {
        setListening(true);

        const handler = (e) => {
            e.preventDefault();
            const key = e.code;
            setPttKey(key);
            setListening(false);
            if (api) api.setSettings('keybinds', { ptt: key });
            window.removeEventListener('keydown', handler);
        };

        window.addEventListener('keydown', handler);
    };

    return (
        <div className="space-y-6 max-w-2xl">
            <div>
                <h2 className="text-lg font-bold text-atc-text mb-1">Keybind Settings</h2>
                <p className="text-xs text-atc-text-muted">Configure your Push-to-Talk key and other shortcuts.</p>
            </div>

            <div className="glass-panel-solid p-5 space-y-4">
                <h3 className="font-semibold text-atc-text text-sm">🎙 Push to Talk (PTT)</h3>
                <p className="text-xs text-atc-text-muted">
                    Hold this key to record your radio transmission. Release to send.
                </p>

                <div className="flex items-center gap-3">
                    <div className="bg-atc-bg border border-atc-border rounded-lg px-4 py-2 font-mono text-sm text-atc-accent min-w-[120px] text-center">
                        {listening ? (
                            <span className="text-atc-amber animate-pulse">Press any key...</span>
                        ) : (
                            pttKey
                        )}
                    </div>
                    <button
                        onClick={startListening}
                        disabled={listening}
                        className="px-3 py-2 bg-atc-accent/20 text-atc-accent border border-atc-accent/30 rounded-lg text-sm hover:bg-atc-accent/30 disabled:opacity-40 transition-all"
                    >
                        {listening ? 'Listening...' : 'Change Key'}
                    </button>
                </div>
            </div>
        </div>
    );
}
