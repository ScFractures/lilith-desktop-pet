const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('qoder', {
  platform: process.platform,
  getState: () => ipcRenderer.invoke('qoder-chat-state'),
  send: (text) => ipcRenderer.invoke('qoder-chat-send', text),
  stop: () => ipcRenderer.invoke('qoder-chat-stop'),
  newChat: () => ipcRenderer.invoke('qoder-chat-new'),
  setModel: (model) => ipcRenderer.invoke('qoder-chat-set-model', model),
  setMode: (mode) => ipcRenderer.invoke('qoder-chat-set-mode', mode),
  chooseWorkspace: () => ipcRenderer.invoke('qoder-chat-choose-workspace'),
  openModels: () => ipcRenderer.invoke('open-models'),
  getLang: () => ipcRenderer.invoke('i18n-get'),
  close: () => ipcRenderer.invoke('qoder-chat-close'),
  minimize: () => ipcRenderer.invoke('qoder-chat-minimize'),
  onEvent: (callback) => {
    ipcRenderer.on('qoder-chat-event', (_event, payload) => callback(payload));
  },
});
