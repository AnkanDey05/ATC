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
    });

    simConnect.on('connectionStatus', (status) => {
        if (mainWindow && !mainWindow.isDestroyed()) {
            mainWindow.webContents.send('sim:connectionStatus', status);
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

    // Forward cost updates
    costTracker.on('update', (costs) => {
        if (mainWindow && !mainWindow.isDestroyed()) {
            mainWindow.webContents.send('cost:update', costs);
        }
    });

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
