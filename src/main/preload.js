const { contextBridge, ipcRenderer } = require('electron');

// Expose a safe API to the renderer process
contextBridge.exposeInMainWorld('electronAPI', {
    // Settings
    getSettings: () => ipcRenderer.invoke('settings:get'),
    setSettings: (key, value) => ipcRenderer.invoke('settings:set', key, value),
    getProviderConfig: () => ipcRenderer.invoke('providers:getConfig'),
    setProviderConfig: (config) => ipcRenderer.invoke('providers:setConfig', config),

    // API Keys
    getApiKeys: () => ipcRenderer.invoke('apikeys:get'),
    setApiKey: (provider, key) => ipcRenderer.invoke('apikeys:set', provider, key),
    validateApiKey: (provider, key) => ipcRenderer.invoke('apikeys:validate', provider, key),

    // Voice Pipeline
    pttStart: () => ipcRenderer.invoke('ptt:start'),
    pttStop: () => ipcRenderer.invoke('ptt:stop'),
    sendAudio: (audioBuffer) => ipcRenderer.invoke('atc:processAudio', audioBuffer),
    sendTranscript: (text) => ipcRenderer.invoke('atc:sendTranscript', text),

    // Flight Plan
    fetchSimBrief: (username) => ipcRenderer.invoke('simbrief:fetch', username),
    setFlightPlan: (plan) => ipcRenderer.invoke('flightplan:set', plan),
    getFlightPlan: () => ipcRenderer.invoke('flightplan:get'),

    // Weather
    fetchWeather: (icao) => ipcRenderer.invoke('weather:fetch', icao),

    // ATC State
    getAtcState: () => ipcRenderer.invoke('atc:getState'),
    acknowledgeAtis: () => ipcRenderer.invoke('atc:acknowledgeAtis'),
    forcePhase: (phase) => ipcRenderer.invoke('atc:forcePhase', phase),
    tuneFrequency: (freq) => ipcRenderer.invoke('atc:tuneFrequency', freq),

    // Cost Tracker
    getCosts: () => ipcRenderer.invoke('cost:get'),
    resetCosts: () => ipcRenderer.invoke('cost:reset'),

    // Window controls
    minimizeWindow: () => ipcRenderer.invoke('window:minimize'),
    maximizeWindow: () => ipcRenderer.invoke('window:maximize'),
    closeWindow: () => ipcRenderer.invoke('window:close'),
    setAlwaysOnTop: (value) => ipcRenderer.invoke('window:alwaysOnTop', value),

    // Event listeners
    onSimState: (callback) => {
        const sub = (_event, state) => callback(state);
        ipcRenderer.on('sim:state', sub);
        return () => ipcRenderer.removeListener('sim:state', sub);
    },
    onSimConnection: (callback) => {
        const sub = (_event, status) => callback(status);
        ipcRenderer.on('sim:connectionStatus', sub);
        return () => ipcRenderer.removeListener('sim:connectionStatus', sub);
    },
    onAtcPhase: (callback) => {
        const sub = (_event, phase) => callback(phase);
        ipcRenderer.on('atc:phase', sub);
        return () => ipcRenderer.removeListener('atc:phase', sub);
    },
    onAtcResponse: (callback) => {
        const sub = (_event, response) => callback(response);
        ipcRenderer.on('atc:response', sub);
        return () => ipcRenderer.removeListener('atc:response', sub);
    },
    onCostUpdate: (callback) => {
        const sub = (_event, costs) => callback(costs);
        ipcRenderer.on('cost:update', sub);
        return () => ipcRenderer.removeListener('cost:update', sub);
    },
    onTtsAudio: (callback) => {
        const sub = (_event, audioData) => callback(audioData);
        ipcRenderer.on('tts:audio', sub);
        return () => ipcRenderer.removeListener('tts:audio', sub);
    },
    onPttStatus: (callback) => {
        const sub = (_event, status) => callback(status);
        ipcRenderer.on('ptt:status', sub);
        return () => ipcRenderer.removeListener('ptt:status', sub);
    },
});
