const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('pet', {
  setIgnoreMouse: (v) => ipcRenderer.send('set-ignore-mouse', v),
  dragStart: (offset) => ipcRenderer.send('drag-start', offset),
  dragEnd: () => ipcRenderer.send('drag-end'),
  walkTo: (targetX, speed) => ipcRenderer.send('walk-to', targetX, speed),
  walkStop: () => ipcRenderer.send('walk-stop'),
  showMenu: (at) => ipcRenderer.send('context-menu', at),
  getInfo: () => ipcRenderer.invoke('get-info'),
  readAsset: (relPath) => ipcRenderer.invoke('read-asset', relPath),
  setFocusable: (v) => ipcRenderer.send('set-focusable', v),
  aiChat: (messages) => ipcRenderer.invoke('ai-chat', messages),
  aiGetConfig: () => ipcRenderer.invoke('ai-get-config'),
  aiSaveConfig: (cfg) => ipcRenderer.invoke('ai-save-config', cfg),
  aiTest: (cfg) => ipcRenderer.invoke('ai-test', cfg),
  openAiSettings: () => ipcRenderer.send('open-ai-settings'),
  setSleeping: (v) => ipcRenderer.send('pet-sleep', !!v),
  i18nGet: () => ipcRenderer.invoke('i18n-get'),
  on: (channel, cb) => {
    ipcRenderer.on(channel, (_e, ...args) => cb(...args));
  },
});
