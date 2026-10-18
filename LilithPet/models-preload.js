const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('models', {
  platform: process.platform,
  list: () => ipcRenderer.invoke('custom-models-list'),
  save: (model) => ipcRenderer.invoke('custom-models-save', model),
  remove: (id) => ipcRenderer.invoke('custom-models-delete', id),
  test: (model) => ipcRenderer.invoke('custom-models-test', model),
  fetchModels: (model) => ipcRenderer.invoke('custom-models-fetch', model),
  getLang: () => ipcRenderer.invoke('i18n-get'),
  close: () => ipcRenderer.invoke('models-close'),
  onEvent: (callback) => {
    ipcRenderer.on('models-event', (_event, payload) => callback(payload));
  },
});
