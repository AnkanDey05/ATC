import React, { useState, useRef, useEffect } from 'react';

const api = window.electronAPI;

/* ─── Standalone API Key Input ─────────────────────────────
   Extracted as a proper component so React preserves its
   instance across parent re-renders.                         */
function ApiKeyInput({ provider, label, hasKey, maskedKey, onSave, onClear, validating }) {
    const [value, setValue] = useState('');
    const [editing, setEditing] = useState(false);
    const inputRef = useRef(null);

    // If key already exists and not in edit mode, show masked key
    if (hasKey && !editing) {
        return (
            <div
                className="flex items-center gap-2 mt-2"
                onClick={(e) => e.stopPropagation()}
                onMouseDown={(e) => e.stopPropagation()}
            >
                <span className="status-dot connected" />
                <div className="flex-1 flex items-center gap-1.5">
                    <span className="text-xs text-atc-text font-mono flex-1">
                        {label}: ••••••••{maskedKey || '****'}
                    </span>
                    <button
                        type="button"
                        onClick={(e) => {
                            e.stopPropagation();
                            setEditing(true);
                            setTimeout(() => inputRef.current?.focus(), 50);
                        }}
                        className="px-2 py-1 text-atc-text-muted hover:text-atc-amber border border-atc-border rounded text-xs transition-all hover:border-atc-amber/40"
                    >
                        Change
                    </button>
                    <button
                        type="button"
                        onClick={(e) => {
                            e.stopPropagation();
                            if (onClear) onClear(provider);
                        }}
                        className="px-2 py-1 text-atc-text-muted hover:text-red-400 border border-atc-border rounded text-xs transition-all hover:border-red-400/40"
                    >
                        Clear
                    </button>
                </div>
            </div>
        );
    }

    return (
        <div
            className="flex items-center gap-2 mt-2"
            onClick={(e) => e.stopPropagation()}
            onMouseDown={(e) => e.stopPropagation()}
        >
            <span className={`status-dot ${hasKey ? 'connected' : 'disconnected'}`} />
            <div className="flex-1 flex gap-1.5">
                <input
                    ref={inputRef}
                    type="password"
                    value={value}
                    onChange={(e) => setValue(e.target.value)}
                    placeholder={`Enter ${label} key...`}
                    className="flex-1 bg-atc-bg/50 border border-atc-border rounded px-2 py-1 text-xs text-atc-text placeholder:text-atc-text-muted focus:outline-none focus:border-atc-accent/50 font-mono"
                />
                <button
                    type="button"
                    onClick={(e) => {
                        e.stopPropagation();
                        if (value.trim()) {
                            onSave(provider, value.trim());
                            setValue('');
                            setEditing(false);
                        }
                    }}
                    disabled={!value.trim() || validating}
                    className="px-2 py-1 bg-atc-accent/20 text-atc-accent border border-atc-accent/30 rounded text-xs disabled:opacity-30 transition-all hover:bg-atc-accent/30"
                >
                    {validating ? '...' : 'Save'}
                </button>
                {hasKey && (
                    <button
                        type="button"
                        onClick={(e) => { e.stopPropagation(); setValue(''); setEditing(false); }}
                        className="px-2 py-1 text-atc-text-muted hover:text-atc-text border border-atc-border rounded text-xs transition-all"
                    >
                        Cancel
                    </button>
                )}
            </div>
        </div>
    );
}

export default function ProviderToggles({ config, onConfigChange, apiKeys, onApiKeysChange }) {
    const [validating, setValidating] = useState({});

    if (!config) return <div className="text-atc-text-muted">Loading configuration...</div>;

    const updateProvider = async (component, field, value) => {
        const newConfig = {
            ...config,
            [component]: { ...config[component], [field]: value },
        };
        onConfigChange(newConfig);
        if (api) await api.setProviderConfig(newConfig);
    };

    const clearApiKey = async (provider) => {
        if (!api) return;
        await api.setApiKey(provider, '');
        const updated = await api.getApiKeys();
        onApiKeysChange(updated);
    };

    const saveApiKey = async (provider, key) => {
        if (!api) return;
        setValidating(v => ({ ...v, [provider]: true }));

        try {
            const result = await api.validateApiKey(provider, key);
            if (result.valid) {
                await api.setApiKey(provider, key);
                const updated = await api.getApiKeys();
                onApiKeysChange(updated);
            } else {
                alert(`Invalid API key: ${result.error || 'Authentication failed'}`);
            }
        } catch (err) {
            alert(`Error validating key: ${err.message}`);
        }

        setValidating(v => ({ ...v, [provider]: false }));
    };

    return (
        <div className="space-y-6 max-w-2xl">
            <div>
                <h2 className="text-lg font-bold text-atc-text mb-1">AI Providers</h2>
                <p className="text-xs text-atc-text-muted">Each component can be independently switched between free and paid providers without restarting.</p>
            </div>

            {/* ─── STT ───────────────────────────────────── */}
            <div className="glass-panel-solid p-5 space-y-3">
                <div className="flex items-center gap-2">
                    <span className="text-lg">🎙️</span>
                    <h3 className="font-semibold text-atc-text">Speech to Text (STT)</h3>
                </div>

                <div className="space-y-2">
                    {/* Free STT */}
                    <div
                        onClick={() => updateProvider('stt', 'provider', 'free')}
                        className="flex items-start gap-3 p-3 rounded-lg cursor-pointer hover:bg-white/5 transition-colors"
                    >
                        <input type="radio" name="stt" checked={config.stt.provider === 'free'} readOnly className="mt-0.5 accent-atc-accent pointer-events-none" />
                        <div className="flex-1">
                            <div className="text-sm font-medium text-atc-text">Free — whisper.cpp local</div>
                            <div className="text-xs text-atc-text-muted mt-0.5">Runs locally on your machine. No API key needed. ~150MB model.</div>
                            {config.stt.provider === 'free' && (
                                <div className="mt-2" onClick={(e) => e.stopPropagation()}>
                                    <span className="text-[10px] text-atc-text-muted">Model size:</span>
                                    <select
                                        value={config.stt.whisperModel}
                                        onChange={(e) => updateProvider('stt', 'whisperModel', e.target.value)}
                                        className="ml-2 bg-atc-bg border border-atc-border rounded px-2 py-0.5 text-xs text-atc-text"
                                    >
                                        <option value="base.en">base.en (150MB, fastest)</option>
                                        <option value="small.en">small.en (500MB, better)</option>
                                        <option value="medium.en">medium.en (1.5GB, best)</option>
                                    </select>
                                </div>
                            )}
                        </div>
                    </div>

                    {/* Paid STT */}
                    <div>
                        <div
                            onClick={() => updateProvider('stt', 'provider', 'paid')}
                            className="flex items-start gap-3 p-3 pb-1 rounded-t-lg cursor-pointer hover:bg-white/5 transition-colors"
                        >
                            <input type="radio" name="stt" checked={config.stt.provider === 'paid'} readOnly className="mt-0.5 accent-atc-accent pointer-events-none" />
                            <div className="flex-1">
                                <div className="text-sm font-medium text-atc-text">Paid — OpenAI Whisper API</div>
                                <div className="text-xs text-atc-text-muted mt-0.5">$0.006/min — cloud, high accuracy, no local compute.</div>
                            </div>
                        </div>
                        {config.stt.provider === 'paid' && (
                            <div className="px-3 pb-3 pl-9">
                                <ApiKeyInput provider="openai" label="OpenAI" hasKey={apiKeys.hasOpenai} maskedKey={apiKeys.openai?.slice(-4)} onSave={saveApiKey} onClear={clearApiKey} validating={validating.openai} />
                            </div>
                        )}
                    </div>
                </div>
            </div>

            {/* ─── LLM ───────────────────────────────────── */}
            <div className="glass-panel-solid p-5 space-y-3">
                <div className="flex items-center gap-2">
                    <span className="text-lg">🧠</span>
                    <h3 className="font-semibold text-atc-text">ATC Brain (LLM)</h3>
                </div>

                <div className="space-y-2">
                    {/* Free LLM */}
                    <div>
                        <div
                            onClick={() => updateProvider('llm', 'provider', 'free')}
                            className="flex items-start gap-3 p-3 pb-1 rounded-t-lg cursor-pointer hover:bg-white/5 transition-colors"
                        >
                            <input type="radio" name="llm" checked={config.llm.provider === 'free'} readOnly className="mt-0.5 accent-atc-accent pointer-events-none" />
                            <div className="flex-1">
                                <div className="text-sm font-medium text-atc-text">Free — Groq (Llama 3.3 70B)</div>
                                <div className="text-xs text-atc-text-muted mt-0.5">14,400 free requests/day. Ultra-fast inference.</div>
                            </div>
                        </div>
                        {config.llm.provider === 'free' && (
                            <div className="px-3 pb-3 pl-9">
                                <ApiKeyInput provider="groq" label="Groq" hasKey={apiKeys.hasGroq} maskedKey={apiKeys.groq?.slice(-4)} onSave={saveApiKey} onClear={clearApiKey} validating={validating.groq} />
                            </div>
                        )}
                    </div>

                    {/* Paid LLM */}
                    <div>
                        <div
                            onClick={() => updateProvider('llm', 'provider', 'paid')}
                            className="flex items-start gap-3 p-3 pb-1 rounded-t-lg cursor-pointer hover:bg-white/5 transition-colors"
                        >
                            <input type="radio" name="llm" checked={config.llm.provider === 'paid'} readOnly className="mt-0.5 accent-atc-accent pointer-events-none" />
                            <div className="flex-1">
                                <div className="text-sm font-medium text-atc-text">Paid — OpenAI GPT-4o</div>
                                <div className="text-xs text-atc-text-muted mt-0.5">Premium quality. Auto-selects GPT-4o/mini by phase complexity.</div>
                            </div>
                        </div>
                        {config.llm.provider === 'paid' && (
                            <div className="px-3 pb-3 pl-9 space-y-2">
                                <ApiKeyInput provider="openai" label="OpenAI" hasKey={apiKeys.hasOpenai} maskedKey={apiKeys.openai?.slice(-4)} onSave={saveApiKey} onClear={clearApiKey} validating={validating.openai} />
                                <div className="mt-2" onClick={(e) => e.stopPropagation()}>
                                    <span className="text-[10px] text-atc-text-muted">Model mode:</span>
                                    <select
                                        value={config.llm.paidTier}
                                        onChange={(e) => updateProvider('llm', 'paidTier', e.target.value)}
                                        className="ml-2 bg-atc-bg border border-atc-border rounded px-2 py-0.5 text-xs text-atc-text"
                                    >
                                        <option value="auto">Auto (4o for complex, mini for simple)</option>
                                        <option value="gpt4o">GPT-4o only</option>
                                        <option value="gpt4o-mini">GPT-4o-mini only (cheapest)</option>
                                    </select>
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            </div>

            {/* ─── TTS ───────────────────────────────────── */}
            <div className="glass-panel-solid p-5 space-y-3">
                <div className="flex items-center gap-2">
                    <span className="text-lg">🔊</span>
                    <h3 className="font-semibold text-atc-text">Controller Voices (TTS)</h3>
                </div>

                <div className="space-y-2">
                    {/* Free TTS */}
                    <div
                        onClick={() => updateProvider('tts', 'provider', 'free')}
                        className="flex items-start gap-3 p-3 rounded-lg cursor-pointer hover:bg-white/5 transition-colors"
                    >
                        <input type="radio" name="tts" checked={config.tts.provider === 'free'} readOnly className="mt-0.5 accent-atc-accent pointer-events-none" />
                        <div className="flex-1">
                            <div className="text-sm font-medium text-atc-text">Free — Microsoft Edge TTS</div>
                            <div className="text-xs text-atc-text-muted mt-0.5">No API key needed. Good quality voices from Edge.</div>
                        </div>
                    </div>

                    {/* Paid TTS (OpenAI) */}
                    <div>
                        <div
                            onClick={() => { updateProvider('tts', 'provider', 'paid'); updateProvider('tts', 'elevenLabsEnabled', false); }}
                            className="flex items-start gap-3 p-3 pb-1 rounded-t-lg cursor-pointer hover:bg-white/5 transition-colors"
                        >
                            <input type="radio" name="tts" checked={config.tts.provider === 'paid' && !config.tts.elevenLabsEnabled} readOnly className="mt-0.5 accent-atc-accent pointer-events-none" />
                            <div className="flex-1">
                                <div className="text-sm font-medium text-atc-text">Paid — OpenAI TTS</div>
                                <div className="text-xs text-atc-text-muted mt-0.5">$15–30/1M chars. High quality, distinct voices per station.</div>
                            </div>
                        </div>
                        {config.tts.provider === 'paid' && !config.tts.elevenLabsEnabled && (
                            <div className="px-3 pb-3 pl-9 space-y-2">
                                <ApiKeyInput provider="openai" label="OpenAI" hasKey={apiKeys.hasOpenai} maskedKey={apiKeys.openai?.slice(-4)} onSave={saveApiKey} onClear={clearApiKey} validating={validating.openai} />
                                <div className="mt-2">
                                    <span className="text-[10px] text-atc-text-muted">Quality:</span>
                                    <select
                                        value={config.tts.paidQuality}
                                        onChange={(e) => updateProvider('tts', 'paidQuality', e.target.value)}
                                        className="ml-2 bg-atc-bg border border-atc-border rounded px-2 py-0.5 text-xs text-atc-text"
                                    >
                                        <option value="standard">Standard ($15/1M chars)</option>
                                        <option value="hd">HD ($30/1M chars)</option>
                                    </select>
                                </div>
                            </div>
                        )}
                    </div>

                    {/* Premium TTS (ElevenLabs) */}
                    <div>
                        <div
                            onClick={() => { updateProvider('tts', 'provider', 'paid'); updateProvider('tts', 'elevenLabsEnabled', true); }}
                            className="flex items-start gap-3 p-3 pb-1 rounded-t-lg cursor-pointer hover:bg-white/5 transition-colors"
                        >
                            <input type="radio" name="tts" checked={config.tts.provider === 'paid' && config.tts.elevenLabsEnabled} readOnly className="mt-0.5 accent-atc-accent pointer-events-none" />
                            <div className="flex-1">
                                <div className="text-sm font-medium text-atc-text">Premium — ElevenLabs</div>
                                <div className="text-xs text-atc-text-muted mt-0.5">Maximum realism. Custom voice IDs per ATC station.</div>
                            </div>
                        </div>
                        {config.tts.provider === 'paid' && config.tts.elevenLabsEnabled && (
                            <div className="px-3 pb-3 pl-9">
                                <ApiKeyInput provider="elevenLabs" label="ElevenLabs" hasKey={apiKeys.hasElevenLabs} maskedKey={apiKeys.elevenLabs?.slice(-4)} onSave={saveApiKey} onClear={clearApiKey} validating={validating.elevenLabs} />
                            </div>
                        )}
                    </div>
                </div>
            </div>

            {/* ─── Weather / SimBrief Keys ───────────────── */}
            <div className="glass-panel-solid p-5 space-y-3">
                <div className="flex items-center gap-2">
                    <span className="text-lg">🌤</span>
                    <h3 className="font-semibold text-atc-text">Weather & Flight Plan</h3>
                </div>

                <div className="space-y-3">
                    <div>
                        <div className="text-xs text-atc-text-dim mb-1">AVWX API Key (optional — for live METAR)</div>
                        <ApiKeyInput provider="avwx" label="AVWX" hasKey={apiKeys.hasAvwx} maskedKey={apiKeys.avwx?.slice(-4)} onSave={saveApiKey} onClear={clearApiKey} validating={validating.avwx} />
                    </div>
                </div>
            </div>
        </div>
    );
}
