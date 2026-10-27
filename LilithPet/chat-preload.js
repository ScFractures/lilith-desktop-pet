const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('qoder', {
  platform: process.platform,
  getState: () => ipcRenderer.invoke('qoder-chat-state'),
  send: (text, attachments) => ipcRenderer.invoke('qoder-chat-send', text, attachments),
  interject: (text, attachments) => ipcRenderer.invoke('qoder-chat-interject', text, attachments),
  attachFiles: () => ipcRenderer.invoke('qoder-chat-attach'),
  removeAttachment: (id) => ipcRenderer.invoke('qoder-chat-attach-remove', id),
  clearAttachments: () => ipcRenderer.invoke('qoder-chat-attach-clear'),
  stop: () => ipcRenderer.invoke('qoder-chat-stop'),
  newChat: () => ipcRenderer.invoke('qoder-chat-new'),
  listConversations: (query) => ipcRenderer.invoke('qoder-chat-list', query),
  switchConversation: (id) => ipcRenderer.invoke('qoder-chat-switch', id),
  renameConversation: (id, title) => ipcRenderer.invoke('qoder-chat-rename', id, title),
  suggestTitle: (id) => ipcRenderer.invoke('qoder-chat-suggest-title', id),
  deleteConversation: (id) => ipcRenderer.invoke('qoder-chat-delete', id),
  saveInputDraft: (id, text) => ipcRenderer.invoke('qoder-chat-draft', id, text),
  setModel: (model) => ipcRenderer.invoke('qoder-chat-set-model', model),
  setMode: (mode) => ipcRenderer.invoke('qoder-chat-set-mode', mode),
  chooseWorkspace: () => ipcRenderer.invoke('qoder-chat-choose-workspace'),
  imageData: (file) => ipcRenderer.invoke('qoder-chat-image-data', file),
  saveImage: (file) => ipcRenderer.invoke('qoder-chat-image-save', file),
  openModels: () => ipcRenderer.invoke('open-models'),
  getLang: () => ipcRenderer.invoke('i18n-get'),
  close: () => ipcRenderer.invoke('qoder-chat-close'),
  minimize: () => ipcRenderer.invoke('qoder-chat-minimize'),
  onEvent: (callback) => {
    ipcRenderer.on('qoder-chat-event', (_event, payload) => callback(payload));
  },
});
