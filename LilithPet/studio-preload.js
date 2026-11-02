const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('studio', {
  readAsset: (relPath) => ipcRenderer.invoke('read-asset', relPath),
  getLook: () => ipcRenderer.invoke('look-get'),
  applyLook: (look) => ipcRenderer.invoke('look-apply', look),
  getLang: () => ipcRenderer.invoke('i18n-get'),
  onLang: (callback) => {
    ipcRenderer.on('studio-event', (_event, payload) => callback(payload));
  },
});
