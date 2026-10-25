/* Standalone Electron smoke test. Uses a temporary profile and no real API or Qoder CLI. */
const { app, BrowserWindow, ipcMain } = require('electron');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { createQoderChat } = require('../qoder-chat');

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lilith-history-ui-'));
app.setPath('userData', path.join(dir, 'profile'));
const project = path.resolve(__dirname, '..');
let chat;
let win;
let errors = [];
const requests = [];
let modelEntry = { id: 'mock', name: 'DeepSeek Test', model: 'deepseek-chat', type: 'openai', tools: false };
const store = {
  list: () => [modelEntry],
  get: (id) => id === 'mock' ? modelEntry : null,
  buildHistory: (messages) => messages.filter((message) => message.text).map((message) => ({ role: message.role, content: message.text })),
  stream: async (_id, history, { onReasoning, onDelta, signal }) => {
    requests.push(history);
    onReasoning('正在检查测试记录…');
    onDelta('测试回答：');
    if (history.at(-1).content.includes('慢任务')) {
      onDelta('已生成的半条回答');
      return new Promise((_resolve, reject) => signal.addEventListener('abort', () => {
        const error = new Error('Abort'); error.name = 'AbortError'; reject(error);
      }, { once: true }));
    }
    await new Promise((resolve) => setTimeout(resolve, 40));
    if (!signal.aborted) onDelta(history.at(-1).content);
    return '测试回答';
  },
};
const stateFile = path.join(dir, 'qoder-chat.json');
const modelsFile = path.join(dir, 'models.json');
fs.writeFileSync(stateFile, JSON.stringify({
  version: 1, sessionId: 'original-qoder-session', model: 'custom:mock', mode: 'yolo', workspace: dir,
  messages: [
    { id: 'user-original', role: 'user', text: '原有对话：学习计划', tools: [], at: Date.now() - 5000 },
    { id: 'assistant-original', role: 'assistant', text: '原有回答包含唯一全文检索词：星河', reasoning: '保留下来的思考', tools: [
      { id: 'tool-original', name: 'read_file', inputText: '{"path":"README.md"}', result: '历史工具输出', state: 'done' },
    ], at: Date.now() - 4000 },
  ], updatedAt: Date.now() - 3000,
}));

const js = (source) => win.webContents.executeJavaScript(source, true);
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
async function until(source, description, timeout = 4000) {
  const end = Date.now() + timeout;
  while (Date.now() < end) {
    if (await js(source)) return;
    await sleep(25);
  }
  throw new Error(`Timed out: ${description}`);
}
async function click(selector) {
  await js(`document.querySelector(${JSON.stringify(selector)}).click()`);
}
async function type(selector, value) {
  await js(`(() => { const el = document.querySelector(${JSON.stringify(selector)}); el.value = ${JSON.stringify(value)}; el.dispatchEvent(new Event('input', { bubbles: true })); })()`);
}
function bind() {
  ipcMain.handle('qoder-chat-state', () => chat.getState());
  ipcMain.handle('qoder-chat-list', (_e, query) => chat.listConversations(query));
  ipcMain.handle('qoder-chat-new', () => chat.newChat());
  ipcMain.handle('qoder-chat-switch', (_e, id) => chat.switchConversation(id));
  ipcMain.handle('qoder-chat-rename', (_e, id, title) => chat.renameConversation(id, title));
  ipcMain.handle('qoder-chat-delete', (_e, id) => chat.deleteConversation(id));
  ipcMain.handle('qoder-chat-draft', (_e, id, text) => chat.saveInputDraft(id, text));
  ipcMain.handle('qoder-chat-send', (_e, text) => chat.send(text));
  ipcMain.handle('qoder-chat-stop', () => chat.stop());
  ipcMain.handle('qoder-chat-set-model', (_e, model) => chat.setModel(model));
  ipcMain.handle('qoder-chat-set-mode', (_e, mode) => chat.setMode(mode));
  ipcMain.handle('qoder-chat-choose-workspace', () => ({ ok: false, error: 'canceled' }));
  ipcMain.handle('i18n-get', () => ({ lang: 'zh' }));
  ipcMain.handle('open-models', () => ({ ok: true }));
}
const options = {
  stateFile, modelsFile, customStore: store,
  onEvent: (event) => { if (win && !win.isDestroyed()) win.webContents.send('qoder-chat-event', event); },
};

app.whenReady().then(async () => {
  if (process.platform === 'darwin') app.dock.hide();
  chat = createQoderChat(options);
  bind();
  win = new BrowserWindow({
    width: 860, height: 740, show: false,
    webPreferences: { preload: path.join(project, 'chat-preload.js'), contextIsolation: true, nodeIntegration: false, backgroundThrottling: false },
  });
  win.webContents.on('console-message', (_e, level, text) => { if (level >= 3) errors.push(text); });
  await win.loadFile(path.join(project, 'renderer', 'chat.html'));
  await until('document.querySelectorAll(".history-item").length === 1', 'initial migrated conversation');
  const original = chat.getState().conversationId;
  assert.equal(await js('document.querySelectorAll("#messages > .msg").length'), 2);
  assert.equal(await js('document.getElementById("history-toggle").getAttribute("aria-expanded")'), 'true');
  assert.equal(await js('document.querySelector(".tool-body pre:last-child").textContent'), '历史工具输出');
  console.log('[history-ui] migrated messages, reasoning and tool output rendered');

  await type('#input', '保留在第一个对话里的草稿');
  await click('#newchat');
  await until('document.querySelectorAll(".history-item").length === 2', 'create second conversation');
  const second = chat.getState().conversationId;
  assert.notEqual(second, original);
  assert.equal(await js('document.getElementById("input").value'), '');
  await type('#input', '第二个话题');
  await click('#send');
  await until('!document.getElementById("stop").hidden === false && document.querySelectorAll("#messages > .msg").length === 2', 'reply finished');
  assert.equal(chat.getState().messages[0].text, '第二个话题');
  assert.deepEqual(requests[0].map((message) => message.content), ['第二个话题']);
  assert.equal(chat.getState().conversationTitle, '第二个话题');
  assert.equal(await js('document.getElementById("input").value'), '');
  console.log('[history-ui] new chat and isolated custom-model history passed');

  await click(`[data-conversation-id="${original}"] .history-select`);
  await until(`document.querySelector('.history-item.active').dataset.conversationId === ${JSON.stringify(original)}`, 'switch original');
  assert.equal(await js('document.getElementById("input").value'), '保留在第一个对话里的草稿');
  assert.equal(await js('document.querySelectorAll("#messages > .msg").length'), 2);
  await click(`[data-conversation-id="${second}"] .history-select`);
  await until(`document.querySelector('.history-item.active').dataset.conversationId === ${JSON.stringify(second)}`, 'switch second');
  assert.equal(await js('document.getElementById("input").value'), '');
  await type('#history-search', '星河');
  await until('document.querySelectorAll(".history-item").length === 1', 'full text search');
  assert.equal(await js('document.querySelector(".history-item").dataset.conversationId'), original);
  await type('#history-search', 'not found 9876');
  await until('document.getElementById("history-empty").hidden === false', 'empty search state');
  await type('#history-search', '');
  await until('document.querySelectorAll(".history-item").length === 2', 'clear search');
  console.log('[history-ui] switching, independent input drafts and full-text search passed');

  await click(`[data-conversation-id="${second}"] .history-action`);
  assert.equal(await js('document.getElementById("rename-dialog").open'), true);
  await type('#rename-input', '<img src=x onerror=alert(1)> 测试标题');
  await js('document.getElementById("rename-form").requestSubmit()');
  await until('!document.getElementById("rename-dialog").open', 'rename saved');
  assert.equal(chat.getState().conversationTitle, '<img src=x onerror=alert(1)> 测试标题');
  assert.equal(await js('document.querySelectorAll("#history-list img, #conversation-title img").length'), 0);
  assert.equal(await js('document.getElementById("conversation-title").textContent'), '<img src=x onerror=alert(1)> 测试标题');
  console.log('[history-ui] HTML rename dialog and safe text rendering passed');

  await type('#input', '新草稿重启后还在');
  await sleep(500);
  await win.webContents.reload();
  await until('document.querySelectorAll(".history-item").length === 2', 'window reload');
  assert.equal(await js('document.getElementById("input").value'), '新草稿重启后还在');
  chat.dispose();
  chat = createQoderChat(options);
  await win.webContents.reload();
  await until('document.querySelectorAll(".history-item").length === 2', 'store restart');
  assert.equal(await js('document.getElementById("input").value'), '新草稿重启后还在');
  assert.equal(chat.getState().conversationId, second);
  assert.equal(chat.getState().messages.length, 2);
  console.log('[history-ui] window reload and application-store restart passed');

  await js('window.confirm = () => false; void 0');
  await click(`[data-conversation-id="${original}"] .history-action:last-child`);
  await sleep(100);
  assert.equal(chat.getState().conversations.length, 2);
  await js('window.confirm = () => true; void 0');
  await click(`[data-conversation-id="${original}"] .history-action:last-child`);
  await until('document.querySelectorAll(".history-item").length === 1', 'delete other conversation');
  assert.equal(chat.getState().conversationId, second);
  console.log('[history-ui] confirmed/canceled deletion passed');

  await type('#input', '慢任务');
  await click('#send');
  await until('document.getElementById("stop").hidden === false', 'slow run started');
  await js('window.confirm = () => false; void 0');
  await click('#newchat');
  assert.equal(chat.getState().busy, true);
  await js('window.confirm = () => true; void 0');
  await click('#newchat');
  await until('document.querySelectorAll(".history-item").length === 2 && document.getElementById("stop").hidden', 'new chat interrupts slow reply');
  await click(`[data-conversation-id="${second}"] .history-select`);
  await until(`document.querySelector('.history-item.active').dataset.conversationId === ${JSON.stringify(second)}`, 'return interrupted');
  assert.equal(chat.getState().messages.at(-1).interrupted, true);
  assert.match(chat.getState().messages.at(-1).text, /已生成的半条回答/);
  assert.equal(await js('document.querySelectorAll(".interrupted-note").length'), 1);
  console.log('[history-ui] canceled/confirmed busy navigation and saved partial answer passed');

  win.setSize(420, 640);
  await sleep(200);
  await click('#history-toggle');
  await click('#history-toggle');
  assert.equal(await js('getComputedStyle(document.getElementById("history-panel")).position'), 'absolute');
  assert.equal(await js('getComputedStyle(document.getElementById("history-scrim")).display'), 'block');
  assert.equal(await js('document.documentElement.scrollWidth <= window.innerWidth'), true);
  assert.equal(await js('document.getElementById("newchat").getBoundingClientRect().right <= window.innerWidth'), true);
  await click('#history-scrim');
  assert.equal(await js('document.getElementById("history-panel").inert'), true);
  assert.equal(await js('document.getElementById("send").getBoundingClientRect().bottom < window.innerHeight'), true);
  win.webContents.send('qoder-chat-event', { type: 'lang', lang: 'en' });
  await until('document.getElementById("history-toggle").textContent === "History"', 'English localization');
  assert.equal(await js('document.getElementById("newchat").getBoundingClientRect().right <= window.innerWidth'), true);
  console.log('[history-ui] 420px narrow drawer, layout bounds and English localization passed');

  win.setSize(860, 740);
  await sleep(100);
  await click('#history-toggle');
  await sleep(100);
  fs.writeFileSync(path.join(dir, 'history-ui.png'), (await win.webContents.capturePage()).toPNG());
  assert.deepEqual(errors, []);
  console.log(`[history-ui] PASS; temporary screenshot: ${path.join(dir, 'history-ui.png')}`);
  chat.dispose();
  win.destroy();
  app.exit(0);
}).catch((error) => {
  console.error('[history-ui] FAIL:', error);
  console.error('[history-ui] Renderer errors:', errors);
  if (chat) chat.dispose();
  app.exit(1);
});
