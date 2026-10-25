const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { createCustomChat } = require('../custom-chat');
const { buildHistory } = require('../custom-models');
const { extractAttachment } = require('../attachments');

function fixture(t, initial, customStore) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lilith-custom-history-test-'));
  const stateFile = path.join(dir, 'custom-chat.json');
  if (initial !== undefined) fs.writeFileSync(stateFile, JSON.stringify(initial));
  const events = [];
  let chat;
  const load = () => {
    chat = createCustomChat({ stateFile, customStore, onEvent: (event) => events.push(event) });
    return chat;
  };
  load();
  t.after(() => { chat.dispose(); fs.rmSync(dir, { recursive: true, force: true }); });
  return { dir, stateFile, events, get chat() { return chat; }, restart() { chat.dispose(); return load(); } };
}

const message = (text, role = 'user', extra = {}) => ({ id: `id-${text}`, role, text, at: Date.now(), tools: [], ...extra });
const legacy = (messages = [message('原有对话'), message('原有回答', 'assistant')]) => ({
  version: 1, model: 'custom:mock', mode: 'read',
  workspace: os.homedir(), messages, updatedAt: 1000,
});

function mockStore({ slowCalls = 0 } = {}) {
  const entry = { id: 'mock', name: 'Mock DeepSeek', model: 'deepseek-chat', type: 'openai' };
  const requests = [];
  const titleRequests = [];
  const isTitleRequest = (history) => Array.isArray(history) && history.length === 1
    && typeof history[0]?.content === 'string'
    && history[0].content.startsWith('Give this conversation a short title.');
  return {
    requests,
    titleRequests,
    list: () => [entry],
    get: (id) => id === 'mock' ? entry : null,
    buildHistory,
    stream: (_target, history, { onDelta, onReasoning, signal, maxTokens } = {}) => {
      if (isTitleRequest(history)) {
        titleRequests.push({ history, maxTokens });
        return Promise.resolve('自动生成的标题');
      }
      requests.push(history);
      const slow = requests.length <= slowCalls;
      if (onReasoning) onReasoning('mock reasoning');
      if (onDelta) onDelta(slow ? 'partial reply' : 'complete reply');
      if (!slow) return Promise.resolve('complete reply');
      return new Promise((_resolve, reject) => signal.addEventListener('abort', () => {
        const error = new Error('Aborted');
        error.name = 'AbortError';
        reject(error);
      }, { once: true }));
    },
    toolTurn: async (_target, history, { onDelta }) => {
      requests.push(JSON.parse(JSON.stringify(history)));
      if (history.at(-1).role === 'tool') {
        onDelta('tool completed');
        return { text: 'tool completed', toolCalls: [] };
      }
      onDelta('reading workspace');
      return { text: 'reading workspace', toolCalls: [{ id: 'call-test', name: 'list_files', input: { path: '.', depth: 1 } }] };
    },
  };
}

async function waitIdle(chat) {
  for (let i = 0; i < 100; i++) {
    if (!chat.getState().busy) return;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  assert.fail('Chat did not become idle');
}

test('migrates v1 conversations without losing messages or reasoning', (t) => {
  const longReasoning = 'R'.repeat(40000);
  const source = legacy();
  source.messages[1] = message('回答', 'assistant', { reasoning: longReasoning });
  const f = fixture(t, source);
  const state = f.chat.getState();
  assert.equal(state.messages.length, 2);
  assert.equal(state.conversations.length, 1);
  assert.equal(state.conversationTitle, '原有对话');
  assert.equal(state.messages[1].reasoning.length, longReasoning.length);
  assert.deepEqual(JSON.parse(fs.readFileSync(`${f.stateFile}.v1-backup`)), source);
  assert.equal(JSON.parse(fs.readFileSync(f.stateFile)).version, 2);
  const restored = f.restart().getState();
  assert.equal(restored.conversationId, state.conversationId);
  assert.equal(restored.messages.length, 2);
  assert.equal(restored.messages[1].reasoning.length, longReasoning.length);
});

test('interject stops the running reply and sends the new message in the same conversation', async (t) => {
  const store = mockStore({ slowCalls: 1 });
  const f = fixture(t, undefined, store);
  const id = f.chat.getState().conversationId;
  assert.equal(f.chat.setModel('custom:mock').ok, true);
  assert.equal(f.chat.send('first topic').ok, true);
  const result = await f.chat.interject('actually do this instead');
  assert.equal(result.ok, true);
  await waitIdle(f.chat);

  const state = f.chat.getState();
  assert.equal(state.conversationId, id);
  assert.deepEqual(state.messages.map((entry) => [entry.role, entry.text]), [
    ['user', 'first topic'],
    ['assistant', 'partial reply'],
    ['user', 'actually do this instead'],
    ['assistant', 'complete reply'],
  ]);
  assert.equal(state.messages[1].interrupted, true);
  assert.equal(state.messages[1].reasoning, 'mock reasoning');
  assert.equal(store.requests.length, 2);
});

test('suggestTitle generates a title and auto titling leaves manual renames alone', async (t) => {
  const store = mockStore();
  const f = fixture(t, legacy(), store);
  const id = f.chat.getState().conversationId;
  assert.equal(f.chat.renameConversation(id, '手动标题').ok, true);
  const result = await f.chat.suggestTitle(id);
  assert.equal(result.ok, true);
  assert.equal(f.chat.getState().conversationTitle, '自动生成的标题');
  assert.equal(store.titleRequests.length, 1);
  assert.equal(store.titleRequests[0].maxTokens, 1024);
  assert.match(store.titleRequests[0].history[0].content, /^Give this conversation a short title\./);

  const fresh = f.chat.newChat().state.conversationId;
  f.chat.send('另一个话题');
  await waitIdle(f.chat);
  assert.equal(store.titleRequests.length, 2);
  assert.equal(f.chat.getState().conversationTitle, '自动生成的标题');

  f.chat.renameConversation(fresh, '我的名字');
  f.chat.send('继续');
  await waitIdle(f.chat);
  assert.equal(store.titleRequests.length, 2);
  assert.equal(f.chat.getState().conversationTitle, '我的名字');
});

test('new, switch and restart keep separate models, modes, messages and input drafts', async (t) => {
  const store = mockStore();
  const f = fixture(t, legacy(), store);
  const original = f.chat.getState();
  assert.equal(f.chat.saveInputDraft(original.conversationId, '未发送的草稿').ok, true);
  const fresh = f.chat.newChat().state;
  assert.notEqual(fresh.conversationId, original.conversationId);
  assert.equal(fresh.messages.length, 0);
  assert.equal(fresh.conversations.length, 2);
  assert.equal(f.chat.setMode('edit').ok, true);
  assert.equal(f.chat.send('第二个独立话题').ok, true);
  await waitIdle(f.chat);
  assert.deepEqual(store.requests[0].map((m) => m.content), ['第二个独立话题']);
  assert.equal(store.titleRequests.length, 1);
  assert.equal(f.chat.getState().conversationTitle, '自动生成的标题');
  f.chat.switchConversation(original.conversationId);
  assert.deepEqual(f.chat.getState().messages, original.messages);
  assert.equal(f.chat.getState().inputDraft, '未发送的草稿');
  assert.equal(f.chat.getState().mode, 'read');
  f.restart();
  assert.equal(f.chat.getState().conversationId, original.conversationId);
  assert.equal(f.chat.getState().inputDraft, '未发送的草稿');
  f.chat.switchConversation(fresh.conversationId);
  assert.equal(f.chat.getState().model, 'custom:mock');
  assert.equal(f.chat.getState().mode, 'edit');
  assert.equal(f.chat.getState().messages.length, 2);
  f.chat.send('继续第二个话题');
  await waitIdle(f.chat);
  assert.deepEqual(store.requests[1].map((m) => m.content), ['第二个独立话题', 'complete reply', '继续第二个话题']);
});

test('search finds full message text, renaming persists, deletion never clears other conversations', (t) => {
  const f = fixture(t, legacy());
  const first = f.chat.getState().conversationId;
  f.chat.saveInputDraft(first, 'draft');
  const second = f.chat.newChat().state.conversationId;
  assert.equal(f.chat.renameConversation(first, '  工作  计划\n记录 ').ok, true);
  assert.equal(f.chat.listConversations('工作 计划')[0].id, first);
  assert.equal(f.chat.listConversations('原有回答')[0].id, first);
  assert.equal(f.chat.listConversations('no matching phrase').length, 0);
  assert.equal(f.chat.renameConversation(first, ' ').error, 'invalid-title');
  assert.equal(f.chat.switchConversation('invalid').error, 'conversation-not-found');
  assert.equal(f.chat.deleteConversation('invalid').error, 'conversation-not-found');
  assert.equal(f.chat.renameConversation('invalid', 'title').error, 'conversation-not-found');
  f.restart();
  assert.equal(f.chat.listConversations().find((c) => c.id === first).title, '工作 计划 记录');
  assert.equal(f.chat.deleteConversation(second).state.conversationId, first);
  assert.equal(f.chat.getState().messages.length, 2);
  const only = f.chat.deleteConversation(first).state;
  assert.equal(only.conversations.length, 1);
  assert.equal(only.messages.length, 0);
  assert.notEqual(only.conversationId, first);
});

test('switching while busy aborts and saves partial reply to the correct conversation', async (t) => {
  const f = fixture(t, legacy(), mockStore({ slowCalls: 99 }));
  const first = f.chat.getState().conversationId;
  const second = f.chat.newChat().state.conversationId;
  f.chat.setModel('custom:mock');
  f.chat.send('长任务');
  assert.equal(f.chat.getState().busy, true);
  assert.equal(f.chat.send('并发任务').error, 'busy');
  f.chat.switchConversation(first);
  await new Promise((resolve) => setTimeout(resolve, 20));
  assert.equal(f.chat.getState().messages.length, 2);
  f.chat.switchConversation(second);
  const answer = f.chat.getState().messages.at(-1);
  assert.equal(answer.text, 'partial reply');
  assert.equal(answer.reasoning, 'mock reasoning');
  assert.equal(answer.interrupted, true);
  assert.equal(f.chat.getState().busy, false);
  const stopped = f.events.find((event) => event.type === 'stopped');
  assert.equal(stopped.conversationId, second);
  f.restart();
  assert.equal(f.chat.getState().messages.at(-1).interrupted, true);
});

function makeZip(files) {
  const local = [];
  const central = [];
  let offset = 0;
  for (const [name, content] of Object.entries(files)) {
    const nameBuf = Buffer.from(name);
    const data = Buffer.from(content);
    const header = Buffer.alloc(30);
    header.writeUInt32LE(0x04034b50, 0);
    header.writeUInt16LE(20, 4);
    header.writeUInt16LE(nameBuf.length, 26);
    local.push(header, nameBuf, data);

    const entry = Buffer.alloc(46);
    entry.writeUInt32LE(0x02014b50, 0);
    entry.writeUInt16LE(20, 4);
    entry.writeUInt16LE(20, 6);
    entry.writeUInt32LE(data.length, 20);
    entry.writeUInt32LE(data.length, 24);
    entry.writeUInt16LE(nameBuf.length, 28);
    entry.writeUInt32LE(offset, 42);
    central.push(entry, nameBuf);
    offset += 30 + nameBuf.length + data.length;
  }
  const directory = Buffer.concat(central);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(Object.keys(files).length, 8);
  eocd.writeUInt16LE(Object.keys(files).length, 10);
  eocd.writeUInt32LE(directory.length, 12);
  eocd.writeUInt32LE(offset, 16);
  return Buffer.concat([...local, directory, eocd]);
}

const PDF_BASE64 = 'JVBERi0xLjcKJcK1wrYKCjEgMCBvYmoKPDwvVHlwZS9DYXRhbG9nL1BhZ2VzIDIgMCBSPj4KZW5kb2JqCgoyIDAgb2JqCjw8L1R5cGUvUGFnZXMvQ291bnQgMS9LaWRzWzQgMCBSXT4+CmVuZG9iagoKMyAwIG9iago8PC9Gb250PDwvaGVsdiA1IDAgUj4+Pj4KZW5kb2JqCgo0IDAgb2JqCjw8L1R5cGUvUGFnZS9NZWRpYUJveFswIDAgNTk1IDg0Ml0vUm90YXRlIDAvUmVzb3VyY2VzIDMgMCBSL1BhcmVudCAyIDAgUi9Db250ZW50c1s2IDAgUl0+PgplbmRvYmoKCjUgMCBvYmoKPDwvVHlwZS9Gb250L1N1YnR5cGUvVHlwZTEvQmFzZUZvbnQvSGVsdmV0aWNhL0VuY29kaW5nL1dpbkFuc2lFbmNvZGluZz4+CmVuZG9iagoKNiAwIG9iago8PC9MZW5ndGggODcvRmlsdGVyL0ZsYXRlRGVjb2RlPj4Kc3RyZWFtCnicDcghDoAwDAVQ31P0BrSj658gCBIMjqSO4BhBgMBwfpbnHr00BSlLo4zEgHA81F31/liV4+RtyGJmnsQVBnP13osfnr3CkrTJKLBxj4XmoJV+JQgS3QplbmRzdHJlYW0KZW5kb2JqCgp4cmVmCjAgNwowMDAwMDAwMDAwIDY1NTM1IGYgCjAwMDAwMDAwMTYgMDAwMDAgbiAKMDAwMDAwMDA2MiAwMDAwMCBuIAowMDAwMDAwMTE0IDAwMDAwIG4gCjAwMDAwMDAxNTUgMDAwMDAgbiAKMDAwMDAwMDI2MiAwMDAwMCBuIAowMDAwMDAwMzUxIDAwMDAwIG4gCgp0cmFpbGVyCjw8L1NpemUgNy9Sb290IDEgMCBSL0lEWzxDM0JCQzM4OUMzOUY0MjJEQzI4QkMyOEU2RkMzQTdDMz48NTBDQUREMDZFRjkyOEU3RUE3RTYwRkU1QTAyMjkwM0Y+XT4+CnN0YXJ0eHJlZgo1MDYKJSVFT0YK';

test('extracts text, docx and PDF attachments without a 50k text limit', async (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lilith-extract-test-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));

  const textPath = path.join(dir, 'notes.md');
  fs.writeFileSync(textPath, '# hello\nworld');
  const text = await extractAttachment(textPath);
  assert.equal(text.kind, 'text');
  assert.equal(text.content, '# hello\nworld');
  assert.equal(text.chars, 13);

  const longPath = path.join(dir, 'long.txt');
  fs.writeFileSync(longPath, 'x'.repeat(120000));
  const long = await extractAttachment(longPath);
  assert.equal(long.chars, 120000);
  assert.equal(long.truncated, false);

  const docxPath = path.join(dir, 'report.docx');
  const documentXml = '<?xml version="1.0"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">'
    + '<w:body><w:p><w:r><w:t>Hello</w:t></w:r></w:p><w:p><w:r><w:t>World</w:t></w:r></w:p></w:body></w:document>';
  fs.writeFileSync(docxPath, makeZip({ 'word/document.xml': documentXml }));
  const docx = await extractAttachment(docxPath);
  assert.equal(docx.kind, 'docx');
  assert.equal(docx.content, 'Hello\nWorld');

  const pdfPath = path.join(dir, 'sample.pdf');
  fs.writeFileSync(pdfPath, Buffer.from(PDF_BASE64, 'base64'));
  const pdf = await extractAttachment(pdfPath);
  assert.equal(pdf.kind, 'pdf');
  assert.equal(pdf.pages, 1);
  assert.match(pdf.content, /PDF attachment text/);

  const imagePath = path.join(dir, 'photo.png');
  fs.writeFileSync(imagePath, Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0]));
  const image = await extractAttachment(imagePath);
  assert.equal(image.kind, 'image');
  assert.equal(image.content, '');
  assert.match(image.note, /Image/);
});

test('staged attachments are sent by id, kept in history and cleared after sending', async (t) => {
  const store = mockStore();
  const f = fixture(t, undefined, store);
  assert.equal(f.chat.setModel('custom:mock').ok, true);

  assert.equal(f.chat.send('', []).error, 'empty');
  assert.equal(f.chat.send('hi', ['missing-id']).error, 'attachment-expired');

  const notesPath = path.join(f.dir, 'notes.md');
  const notes = '# hello\nworld';
  fs.writeFileSync(notesPath, notes);
  const staged = await f.chat.stageFiles([notesPath]);
  assert.equal(staged.ok, true);
  assert.equal(staged.errors.length, 0);
  assert.equal(staged.files.length, 1);
  const [attached] = staged.files;
  assert.equal(attached.name, 'notes.md');
  assert.equal(attached.kind, 'text');
  assert.equal(attached.chars, notes.length);
  assert.equal(attached.size, notes.length);
  assert.ok(attached.id);

  const missing = await f.chat.stageFiles([path.join(f.dir, 'nope.bin')]);
  assert.equal(missing.errors[0].code, 'unreadable-file');
  const directory = await f.chat.stageFiles([f.dir]);
  assert.equal(directory.errors[0].code, 'not-a-file');

  assert.equal(f.chat.send('看看这个', [attached.id]).ok, true);
  await waitIdle(f.chat);

  assert.deepEqual(store.requests[0], [{
    role: 'user',
    content: [
      '看看这个',
      '',
      'Attached files:',
      '',
      '--- file 1: notes.md (text, 13 B) ---',
      `Path: ${notesPath}`,
      '',
      notes,
      '--- end file: notes.md ---',
    ].join('\n'),
  }]);
  const state = f.chat.getState();
  assert.deepEqual(state.messages[0].files, [{ name: 'notes.md', size: 13, kind: 'text', chars: 13 }]);
  assert.equal(state.messages[0].text, '看看这个');
  assert.deepEqual(state.attachments, []);
  assert.equal(f.chat.listConversations('notes.md').length, 1);

  const extras = Array.from({ length: 10 }, (_, index) => {
    const file = path.join(f.dir, `extra-${index}.txt`);
    fs.writeFileSync(file, `file ${index}`);
    return file;
  });
  const full = await f.chat.stageFiles(extras);
  assert.equal(full.files.length, 10);
  const overflow = await f.chat.stageFiles([path.join(f.dir, 'extra-11.txt')]);
  assert.equal(overflow.errors[0].code, 'too-many-files');

  const second = f.chat.newChat().state.conversationId;
  assert.deepEqual(f.chat.getState().attachments, []);

  const csvPath = path.join(f.dir, 'data.csv');
  fs.writeFileSync(csvPath, 'a,b\n1,2');
  const csv = await f.chat.stageFiles([csvPath]);
  const removed = f.chat.unstageFile(csv.files[0].id);
  assert.deepEqual(removed.files, []);
  const csvAgain = await f.chat.stageFiles([csvPath]);
  assert.equal(f.chat.send('', [csvAgain.files[0].id]).ok, true);
  await waitIdle(f.chat);
  const attachmentsOnly = f.chat.getState();
  assert.equal(attachmentsOnly.conversationId, second);
  assert.equal(attachmentsOnly.messages[0].text, '');
  assert.deepEqual(attachmentsOnly.messages[0].files, [{ name: 'data.csv', size: 7, kind: 'text', chars: 7 }]);
  assert.equal(f.chat.listConversations('data.csv').length, 1);

  f.restart();
  assert.deepEqual(f.chat.getState().messages[0].files, [{ name: 'data.csv', size: 7, kind: 'text', chars: 7 }]);
});
