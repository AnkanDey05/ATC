const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const Store = require('electron-store');

// Provider managers
const { SttProvider } = require('./providers/sttProvider');
const { LlmProvider } = require('./providers/llmProvider');
const { TtsProvider } = require('./providers/ttsProvider');
const { SimConnectManager } = require('./simconnect');
const { AtcStateMachine } = require('./atcStateMachine');
const { CostTracker } = require('./costTracker');
const { WeatherManager } = require('./weather');
const { SimBriefManager } = require('./simbrief');
const { Copilot } = require('./copilot');
const { registerIpcHandlers } = require('./ipcHandlers');

// Encrypted store for settings and API keys
const store = new Store({
    name: 'msfs-atc-config',
    encryptionKey: 'msfs-atc-v1-encryption-key',
    defaults: {
        providerConfig: {
            stt: { provider: 'free', whisperModel: 'base.en' },
            llm: { provider: 'free', paidTier: 'auto' },
            tts: { provider: 'free', paidQuality: 'standard', elevenLabsEnabled: false },
        },
        apiKeys: {
            openai: '',
            groq: '',
            elevenLabs: '',
            avwx: '',
        },
        simbrief: {
            username: '',
        },
        audio: {
            radioEffect: true,
            inputDevice: 'default',
            outputDevice: 'default',
            volume: 0.8,
        },
        keybinds: {
            ptt: 'Space',
        },
        flightPlan: null,
    },
});

let mainWindow = null;

// Core services
const costTracker = new CostTracker(store);
const sttProvider = new SttProvider(store, costTracker);
const llmProvider = new LlmProvider(store, costTracker);
const ttsProvider = new TtsProvider(store, costTracker);
const simConnect = new SimConnectManager();
const weather = new WeatherManager(store);
const simbrief = new SimBriefManager(store);
const atcStateMachine = new AtcStateMachine(store, simConnect, llmProvider, ttsProvider, weather, costTracker);
const copilot = new Copilot(atcStateMachine, llmProvider);

// Wire flight plan to STT provider for callsign correction
const origSetFlightPlan = atcStateMachine.setFlightPlan.bind(atcStateMachine);
atcStateMachine.setFlightPlan = function (plan) {
    origSetFlightPlan(plan);
    sttProvider.setFlightPlan(plan);
};

function createWindow() {
    mainWindow = new BrowserWindow({
        width: 1280,
        height: 800,
        minWidth: 900,
        minHeight: 600,
        frame: false,
        titleBarStyle: 'hidden',
        backgroundColor: '#0a0e17',
        webPreferences: {
            preload: path.join(__dirname, 'preload.js'),
            contextIsolation: true,
            nodeIntegration: false,
        },
        icon: path.join(__dirname, '../../public/icon.ico'),
    });

    // Load Vite dev server in development, built files in production
    const isDev = !app.isPackaged;
    if (isDev) {
        mainWindow.loadURL('http://localhost:5173');
        mainWindow.webContents.openDevTools({ mode: 'detach' });
    } else {
        mainWindow.loadFile(path.join(__dirname, '../../dist/index.html'));
    }

    mainWindow.on('closed', () => {
        mainWindow = null;
    });
}

app.whenReady().then(() => {
    createWindow();

    // Register all IPC handlers
    registerIpcHandlers(ipcMain, store, {
        sttProvider,
        llmProvider,
        ttsProvider,
        simConnect,
        atcStateMachine,
        costTracker,
        weather,
        simbrief,
        copilot,
        mainWindow: () => mainWindow,
    });

    // Start SimConnect connection loop
    simConnect.startConnectionLoop();

    // Forward SimConnect state to renderer
    simConnect.on('stateUpdate', (state) => {
        if (mainWindow && !mainWindow.isDestroyed()) {
            mainWindow.webContents.send('sim:state', state);
        }
        atcStateMachine.processSimState(state);
        // Feed latest traffic snapshot to ATC state machine
        atcStateMachine.setTrafficData(simConnect.getNearbyAircraft());
    });

    simConnect.on('connectionStatus', (status) => {
        if (mainWindow && !mainWindow.isDestroyed()) {
            mainWindow.webContents.send('sim:connectionStatus', status);
        }
    });

    // Forward AI traffic data to renderer
    simConnect.on('trafficUpdate', (aircraft) => {
        if (mainWindow && !mainWindow.isDestroyed()) {
            mainWindow.webContents.send('sim:traffic', aircraft);
        }
    });

    // Forward ATC events to renderer
    atcStateMachine.on('phaseChange', (phase) => {
        if (mainWindow && !mainWindow.isDestroyed()) {
            mainWindow.webContents.send('atc:phase', phase);
        }
    });

    atcStateMachine.on('atcResponse', (response) => {
        if (mainWindow && !mainWindow.isDestroyed()) {
            mainWindow.webContents.send('atc:response', response);
        }
    });

    // A4: Auto-tuned notification
    atcStateMachine.on('autoTuned', (data) => {
        if (mainWindow && !mainWindow.isDestroyed()) {
            mainWindow.webContents.send('atc:autoTuned', data);
        }
    });

    // A5: TOD alert
    atcStateMachine.on('todApproaching', (data) => {
        if (mainWindow && !mainWindow.isDestroyed()) {
            mainWindow.webContents.send('atc:todAlert', data);
        }
    });

    // A5: ATC-initiated messages (e.g., TOD announcement)
    atcStateMachine.on('atcInitiated', async (data) => {
        if (mainWindow && !mainWindow.isDestroyed() && data?.text) {
            const controller = atcStateMachine.getCurrentController();
            const voiceId = controller ? controller.voice : null;
            try {
                const audioData = await ttsProvider.synthesize(data.text, voiceId);
                mainWindow.webContents.send('tts:audio', {
                    audio: audioData ? Array.from(audioData) : null,
                    text: data.text,
                    controller: controller,
                });
            } catch (err) {
                console.error('[ATC] Initiated message TTS error:', err.message);
            }
        }
    });

    // C2: Waypoint passed events
    atcStateMachine.on('waypointPassed', (data) => {
        if (mainWindow && !mainWindow.isDestroyed()) {
            mainWindow.webContents.send('atc:waypointPassed', data);
        }
    });

    // A6: ARTCC center handoff events
    atcStateMachine.on('centerHandoff', (data) => {
        if (mainWindow && !mainWindow.isDestroyed()) {
            mainWindow.webContents.send('atc:centerHandoff', data);
        }
    });

    // B1: ATIS auto-broadcast when engines start
    atcStateMachine.on('broadcastAtis', async () => {
        try {
            const atisResult = await atcStateMachine.processMessage('ATIS broadcast');
            const controller = atcStateMachine.getCurrentController();
            const voiceId = controller ? controller.voice : null;
            const audioData = await ttsProvider.synthesize(atisResult.text, voiceId);
            if (mainWindow && !mainWindow.isDestroyed()) {
                mainWindow.webContents.send('tts:audio', {
                    audio: audioData ? Array.from(audioData) : null,
                    text: `📡 ATIS AUTO-BROADCAST: ${atisResult.text}`,
                    controller: controller,
                });
            }
        } catch (err) {
            console.error('[ATC] ATIS auto-broadcast error:', err.message);
        }
    });

    // Forward cost updates
    costTracker.on('update', (costs) => {
        if (mainWindow && !mainWindow.isDestroyed()) {
            mainWindow.webContents.send('cost:update', costs);
        }
    });

    // ── B3: WebSocket server for MSFS in-sim panel ──────────
    try {
        const { WebSocketServer } = require('ws');
        const wss = new WebSocketServer({ port: 8766 });
        const broadcast = (data) => {
            const msg = JSON.stringify(data);
            wss.clients.forEach(c => { if (c.readyState === 1) c.send(msg); });
        };

        atcStateMachine.on('phaseChange', (phase) => {
            const ctrl = atcStateMachine.getCurrentController();
            broadcast({ type: 'phase', phase: phase.to, frequency: ctrl?.frequency });
        });

        // Forward ATC responses to panel
        const origTtsHandler = mainWindow;
        atcStateMachine.on('atcResponse', (r) => broadcast({ type: 'atc', text: r.text, controller: r.controller }));
        atcStateMachine.on('atcInitiated', (d) => broadcast({ type: 'atc', text: d.text }));

        console.log('[WS] Panel server listening on ws://localhost:8766');
    } catch (err) {
        console.warn('[WS] Could not start panel server:', err.message);
    }

    app.on('activate', () => {
        if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
});

app.on('window-all-closed', () => {
    simConnect.disconnect();
    sttProvider.shutdown();
    if (process.platform !== 'darwin') app.quit();
});

app.on('before-quit', () => {
    simConnect.disconnect();
    sttProvider.shutdown();
});
