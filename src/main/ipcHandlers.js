/**
 * IPC Handlers — bridge between Electron main process and React renderer
 */

function registerIpcHandlers(ipcMain, store, services) {
    const {
        sttProvider, llmProvider, ttsProvider,
        simConnect, atcStateMachine, costTracker,
        weather, simbrief, mainWindow,
    } = services;

    // ─── Settings ───────────────────────────────────────────────────────
    ipcMain.handle('settings:get', () => {
        return {
            providerConfig: store.get('providerConfig'),
            audio: store.get('audio'),
            keybinds: store.get('keybinds'),
            simbrief: store.get('simbrief'),
        };
    });

    ipcMain.handle('settings:set', (_event, key, value) => {
        store.set(key, value);
        return true;
    });

    // ─── Provider Config ────────────────────────────────────────────────
    ipcMain.handle('providers:getConfig', () => {
        return store.get('providerConfig');
    });

    ipcMain.handle('providers:setConfig', (_event, config) => {
        store.set('providerConfig', config);
        // Immediately update provider routing — no restart needed
        sttProvider.updateConfig(config.stt);
        llmProvider.updateConfig(config.llm);
        ttsProvider.updateConfig(config.tts);
        return true;
    });

    // ─── API Keys ───────────────────────────────────────────────────────
    ipcMain.handle('apikeys:get', () => {
        const keys = store.get('apiKeys');
        // Return masked keys for UI display
        return {
            openai: keys.openai ? '••••••••' + keys.openai.slice(-4) : '',
            groq: keys.groq ? '••••••••' + keys.groq.slice(-4) : '',
            elevenLabs: keys.elevenLabs ? '••••••••' + keys.elevenLabs.slice(-4) : '',
            avwx: keys.avwx ? '••••••••' + keys.avwx.slice(-4) : '',
            hasOpenai: !!keys.openai,
            hasGroq: !!keys.groq,
            hasElevenLabs: !!keys.elevenLabs,
            hasAvwx: !!keys.avwx,
        };
    });

    ipcMain.handle('apikeys:set', (_event, provider, key) => {
        const keys = store.get('apiKeys');
        keys[provider] = key;
        store.set('apiKeys', keys);

        // Update providers with new keys
        sttProvider.updateApiKey('openai', keys.openai);
        llmProvider.updateApiKeys(keys);
        ttsProvider.updateApiKeys(keys);

        return true;
    });

    ipcMain.handle('apikeys:validate', async (_event, provider, key) => {
        try {
            switch (provider) {
                case 'openai': {
                    const OpenAI = require('openai');
                    const client = new OpenAI({ apiKey: key });
                    await client.models.list();
                    return { valid: true };
                }
                case 'groq': {
                    const Groq = require('groq-sdk');
                    const groq = new Groq({ apiKey: key });
                    await groq.chat.completions.create({
                        model: 'llama-3.3-70b-versatile',
                        messages: [{ role: 'user', content: 'Hello' }],
                        max_tokens: 5,
                    });
                    return { valid: true };
                }
                case 'elevenLabs': {
                    const resp = await fetch('https://api.elevenlabs.io/v1/user', {
                        headers: { 'xi-api-key': key },
                    });
                    return { valid: resp.ok };
                }
                case 'avwx': {
                    const resp = await fetch(`https://avwx.rest/api/metar/KJFK?token=${key}`);
                    return { valid: resp.ok };
                }
                default:
                    return { valid: false, error: 'Unknown provider' };
            }
        } catch (err) {
            return { valid: false, error: err.message };
        }
    });

    // ─── Voice Pipeline (PTT) ──────────────────────────────────────────
    ipcMain.handle('ptt:start', () => {
        // Signal renderer to start mic capture via Web Audio API
        const win = mainWindow();
        if (win) win.webContents.send('ptt:status', { recording: true });
        return true;
    });

    ipcMain.handle('ptt:stop', () => {
        const win = mainWindow();
        if (win) win.webContents.send('ptt:status', { recording: false });
        return true;
    });

    // Process recorded audio from renderer
    ipcMain.handle('atc:processAudio', async (_event, audioBuffer) => {
        try {
            // 1. STT: audio → text
            const transcript = await sttProvider.transcribe(Buffer.from(audioBuffer));

            // Filter out handoff messages at code level
            if (isHandoffMessage(transcript)) {
                return { transcript, response: null, silent: true };
            }

            // 2. LLM: text → ATC response
            const atcResult = await atcStateMachine.processMessage(transcript);

            // 3. TTS: ATC text → audio
            const controller = atcStateMachine.getCurrentController();
            const voiceId = controller ? controller.voice : null;
            const audioData = await ttsProvider.synthesize(atcResult.text, voiceId);

            // Send audio to renderer for playback
            const win = mainWindow();
            if (win) {
                win.webContents.send('tts:audio', {
                    audio: audioData ? Array.from(audioData) : null,
                    text: atcResult.text,
                    controller: controller,
                });
            }

            return {
                transcript,
                response: atcResult.text,
                phase: atcResult.phase,
                controller: controller,
            };
        } catch (err) {
            console.error('[ATC] Pipeline error:', err.message);
            return { error: err.message };
        }
    });

    // ── Handoff / non-radio-call filter ──────────────────────────────
    // Detects frequency changes, goodbyes, and initial contact calls on new freq.
    // Real ATC on the OLD frequency does NOT respond to these.
    const HANDOFF_PATTERNS = [
        /\b(switching|going|tuning|changing|moving)\s+(to|over|frequency)/i,
        /\bcontact\s+\w+\s+on\b/i,
        /\bgood\s+(day|evening|night|morning)\b/i,
        /\bsee\s+you\b/i,
        /\bso\s+long\b/i,
        /^\s*\d{3}\.\d{1,3}\s*$/,                     // Just a frequency number "129.76"
        /\b(tower|ground|approach|departure|center|clearance|atis)\s+on\s+\d{3}\.\d/i,  // "Tower on 129.76..."
        /\bon\s+\d{3}\.\d/i,                           // "...on 129.76"
        /\b\d{3}\.\d{1,3}\b.*\bcallsign\b/i,          // freq + callsign mention
    ];

    function isHandoffMessage(text) {
        if (!text || text.trim().length < 3) return true;
        return HANDOFF_PATTERNS.some(p => p.test(text));
    }

    ipcMain.handle('atc:sendTranscript', async (_event, text) => {
        try {
            // Silently ignore handoff/frequency-change messages
            if (isHandoffMessage(text)) {
                return { response: null, phase: atcStateMachine.getPhaseInfo().phase, silent: true };
            }

            const atcResult = await atcStateMachine.processMessage(text);
            const controller = atcStateMachine.getCurrentController();
            const voiceId = controller ? controller.voice : null;
            const audioData = await ttsProvider.synthesize(atcResult.text, voiceId);

            const win = mainWindow();
            if (win) {
                win.webContents.send('tts:audio', {
                    audio: audioData ? Array.from(audioData) : null,
                    text: atcResult.text,
                    controller: controller,
                });
            }

            return {
                response: atcResult.text,
                phase: atcResult.phase,
                controller: controller,
            };
        } catch (err) {
            return { error: err.message };
        }
    });

    // ─── Flight Plan ────────────────────────────────────────────────────
    ipcMain.handle('simbrief:fetch', async (_event, username) => {
        try {
            const plan = await simbrief.fetch(username);
            atcStateMachine.setFlightPlan(plan);
            store.set('flightPlan', plan);
            return plan;
        } catch (err) {
            return { error: err.message };
        }
    });

    ipcMain.handle('flightplan:set', (_event, plan) => {
        atcStateMachine.setFlightPlan(plan);
        store.set('flightPlan', plan);
        return true;
    });

    ipcMain.handle('flightplan:get', () => {
        return store.get('flightPlan') || null;
    });

    // ─── Weather ────────────────────────────────────────────────────────
    ipcMain.handle('weather:fetch', async (_event, icao) => {
        try {
            const data = await weather.fetch(icao);
            atcStateMachine.setWeatherData(data);
            return data;
        } catch (err) {
            return { error: err.message };
        }
    });

    // ─── ATC State ──────────────────────────────────────────────────────
    ipcMain.handle('atc:getState', () => {
        return atcStateMachine.getPhaseInfo();
    });

    ipcMain.handle('atc:acknowledgeAtis', () => {
        atcStateMachine.forceTransition('CLEARANCE');
        return true;
    });

    ipcMain.handle('atc:forcePhase', (_event, phase) => {
        atcStateMachine.forceTransition(phase);
        return true;
    });

    ipcMain.handle('atc:tuneFrequency', async (_event, freq) => {
        const matched = atcStateMachine.tuneToFrequency(freq);
        const phaseInfo = atcStateMachine.getPhaseInfo();

        // Auto-broadcast ATIS when tuning to ATIS frequency
        if (matched === 'ATIS') {
            try {
                const atisResult = await atcStateMachine.processMessage('ATIS request');
                const controller = atcStateMachine.getCurrentController();
                const voiceId = controller ? controller.voice : null;
                const audioData = await ttsProvider.synthesize(atisResult.text, voiceId);

                const win = mainWindow();
                if (win) {
                    win.webContents.send('tts:audio', {
                        audio: audioData ? Array.from(audioData) : null,
                        text: atisResult.text,
                        controller: controller,
                    });
                }
            } catch (err) {
                console.error('[ATC] Auto-ATIS error:', err.message);
            }
        }

        return { matched, phase: phaseInfo };
    });

    // ─── Cost Tracker ───────────────────────────────────────────────────
    ipcMain.handle('cost:get', () => {
        return costTracker.getSummary();
    });

    ipcMain.handle('cost:reset', () => {
        costTracker.reset();
        return true;
    });

    // ─── Window Controls ───────────────────────────────────────────────
    ipcMain.handle('window:minimize', () => {
        const win = mainWindow();
        if (win) win.minimize();
    });

    ipcMain.handle('window:maximize', () => {
        const win = mainWindow();
        if (win) {
            if (win.isMaximized()) win.unmaximize();
            else win.maximize();
        }
    });

    ipcMain.handle('window:close', () => {
        const win = mainWindow();
        if (win) win.close();
    });

    ipcMain.handle('window:alwaysOnTop', (_event, value) => {
        const win = mainWindow();
        if (win) win.setAlwaysOnTop(value);
    });

    // ─── SimConnect Mock Controls ──────────────────────────────────────
    ipcMain.handle('sim:updateMock', (_event, updates) => {
        simConnect.updateMockState(updates);
        return true;
    });
}

module.exports = { registerIpcHandlers };
