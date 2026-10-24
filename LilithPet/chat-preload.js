const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('lilithChat', {
  platform: process.platform,
  getState: () => ipcRenderer.invoke('custom-chat-state'),
  send: (text) => ipcRenderer.invoke('custom-chat-send', text),
  interject: (text) => ipcRenderer.invoke('custom-chat-interject', text),
  stop: () => ipcRenderer.invoke('custom-chat-stop'),
  newChat: () => ipcRenderer.invoke('custom-chat-new'),
  setModel: (model) => ipcRenderer.invoke('custom-chat-set-model', model),
  setMode: (mode) => ipcRenderer.invoke('custom-chat-set-mode', mode),
  chooseWorkspace: () => ipcRenderer.invoke('custom-chat-choose-workspace'),
  openModels: () => ipcRenderer.invoke('open-models'),
  getLang: () => ipcRenderer.invoke('i18n-get'),
  close: () => ipcRenderer.invoke('custom-chat-close'),
  minimize: () => ipcRenderer.invoke('custom-chat-minimize'),
  onEvent: (callback) => {
    ipcRenderer.on('custom-chat-event', (_event, payload) => callback(payload));
  },
});
