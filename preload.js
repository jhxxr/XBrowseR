const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('xbrowser', {
    bootstrap: () => ipcRenderer.invoke('app:bootstrap'),
    generateFingerprint: (payload) => ipcRenderer.invoke('fingerprint:generate', payload),
    saveProfile: (payload) => ipcRenderer.invoke('profile:save', payload),
    deleteProfile: (id) => ipcRenderer.invoke('profile:delete', id),
    launchProfile: (id, requestId = '') => ipcRenderer.invoke('profile:launch', { id, requestId }),
    stopProfile: (id) => ipcRenderer.invoke('profile:stop', id),
    addManualProxy: (payload) => ipcRenderer.invoke('proxy:add-manual', payload),
    deleteProxy: (id) => ipcRenderer.invoke('proxy:delete', id),
    testProxy: (id) => ipcRenderer.invoke('proxy:test', id),
    importSubscription: (payload) => ipcRenderer.invoke('subscription:import', payload),
    refreshSubscription: (id) => ipcRenderer.invoke('subscription:refresh', id),
    deleteSubscription: (id) => ipcRenderer.invoke('subscription:delete', id),
    importProxyFile: () => ipcRenderer.invoke('proxy:import-file'),
    saveSettings: (payload) => ipcRenderer.invoke('settings:save', payload),
    openDataDir: () => ipcRenderer.invoke('app:open-data-dir'),
    onStateUpdated: (callback) => ipcRenderer.on('state-updated', (event, state) => callback(state)),
    onLaunchProgress: (callback) => ipcRenderer.on('launch-progress', (event, payload) => callback(payload))
});
