const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('lilithChat', {
  platform: process.platform,
  getState: () => ipcRenderer.invoke('custom-chat-state'),
  send: (text, attachments) => ipcRenderer.invoke('custom-chat-send', text, attachments),
  interject: (text, attachments) => ipcRenderer.invoke('custom-chat-interject', text, attachments),
  stop: () => ipcRenderer.invoke('custom-chat-stop'),
  newChat: () => ipcRenderer.invoke('custom-chat-new'),
  listConversations: (query) => ipcRenderer.invoke('custom-chat-list', query),
  switchConversation: (id) => ipcRenderer.invoke('custom-chat-switch', id),
  renameConversation: (id, title) => ipcRenderer.invoke('custom-chat-rename', id, title),
  suggestTitle: (id) => ipcRenderer.invoke('custom-chat-suggest-title', id),
  deleteConversation: (id) => ipcRenderer.invoke('custom-chat-delete', id),
  saveInputDraft: (id, text) => ipcRenderer.invoke('custom-chat-draft', id, text),
  attachFiles: () => ipcRenderer.invoke('custom-chat-attach'),
  removeAttachment: (id) => ipcRenderer.invoke('custom-chat-attach-remove', id),
  clearAttachments: () => ipcRenderer.invoke('custom-chat-attach-clear'),
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
