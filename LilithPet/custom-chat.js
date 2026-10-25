'use strict';

const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');
const customTools = require('./custom-tools');
const { extractAttachment, kindByExtension } = require('./attachments');

const MAX_MESSAGES = 140;
const MAX_PROMPT = 20000;
const MAX_FILES = 10;
const MAX_FILE_CHARS = 300000;
const MAX_NOTE = 500;
const MAX_TITLE = 80;
const CHECKPOINT_MS = 1200;
const MAX_TOOL_TEXT = 4000;
const MAX_TOOL_ROUNDS = 12;
const MAX_TOOL_CALLS = 32;
const TITLE_TIMEOUT_MS = 30000;
const RUN_LIMIT_MS = 12 * 60 * 60 * 1000;
const DEFAULT_WORKSPACE = os.homedir();
const DEFAULT_MODE = 'read';

const MODES = [
  {
    key: 'read',
    label: { zh: '只读', en: 'Read only' },
    hint: { zh: '可以查看文件和目录，不能修改或执行命令。', en: 'View files and folders; no edits or commands.' },
  },
  {
    key: 'edit',
    label: { zh: '读写', en: 'Read & write' },
    hint: { zh: '可以查看、创建和修改文件，不能执行命令。', en: 'View, create and edit files; commands are blocked.' },
  },
  {
    key: 'full',
    label: { zh: '完全访问', en: 'Full access' },
    hint: { zh: '可以读写文件并执行终端命令。', en: 'Read, write and run terminal commands.' },
  },
];

const PERMISSION_MODE = { read: 'default', edit: 'accept_edits', full: 'yolo' };

function clip(value, max) {
  const text = String(value == null ? '' : value);
  return text.length > max ? `${text.slice(0, max)}\n… (${text.length - max} chars truncated)` : text;
}

function safeJson(value) {
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

function isDirectory(dir) {
  try {
    return fs.statSync(dir).isDirectory();
  } catch {
    return false;
  }
}

function writeJsonAtomic(file, value) {
  try {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    const tmp = `${file}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(value, null, 2));
    fs.renameSync(tmp, file);
    return true;
  } catch {
    return false;
  }
}

function normalizeTool(tool) {
  if (!tool || typeof tool !== 'object') return null;
  return {
    id: String(tool.id || crypto.randomUUID()),
    name: String(tool.name || 'Tool').slice(0, 80),
    summary: String(tool.summary || '').slice(0, 300),
    inputText: clip(tool.inputText || '', MAX_TOOL_TEXT),
    result: clip(tool.result || '', MAX_TOOL_TEXT),
    isError: tool.isError === true,
    state: tool.state === 'running' ? 'running' : 'done',
  };
}

function toolSummary(name, input) {
  if (!input || typeof input !== 'object') return '';
  const candidates = [
    input.command,
    input.description,
    input.file_path,
    input.path,
    input.pattern,
    input.query,
    input.url,
    input.prompt,
  ];
  const value = candidates.find((item) => typeof item === 'string' && item.trim());
  return value ? String(value).replace(/\s+/g, ' ').slice(0, 220) : '';
}

function toolContentText(content) {
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) {
    return content.map((block) => {
      if (typeof block === 'string') return block;
      if (block && typeof block === 'object' && typeof block.text === 'string') return block.text;
      return safeJson(block);
    }).join('\n');
  }
  if (content && typeof content === 'object') return safeJson(content);
  return content == null ? '' : String(content);
}

function appendText(current, next) {
  if (!current) return next;
  if (!next) return current;
  return current.endsWith('\n\n') ? current + next : `${current}\n\n${next}`;
}

function toolSystemPrompt(workspace, mode) {
  const labels = { read: 'read-only', edit: 'read-write, commands blocked', full: 'full access' };
  return [
    'You are a helpful assistant with local tools for reading and editing files and running terminal commands.',
    `Workspace: ${workspace}`,
    `Permission mode: ${labels[mode] || labels.read}.`,
    `Current time: ${new Date().toISOString()}`,
    'File paths are relative to the workspace; absolute paths inside the workspace are also accepted.',
    'Use run_command for terminal tasks instead of asking the user to run them. Keep tool use focused and tell the user briefly what you are doing.',
    'If a tool is denied by the permission mode, explain what mode the user needs to switch to.',
  ].join('\n');
}

function cleanTitle(value) {
  return String(value || '').replace(/\s+/g, ' ').trim().slice(0, MAX_TITLE);
}

function titlePrompt(userText, assistantText) {
  const lines = [
    'Give this conversation a short title.',
    'Use the same language as the user message: at most 16 Chinese characters or 8 English words.',
    'Output only the title itself — no quotes, no trailing punctuation, no explanation.',
    '',
    `User: ${String(userText || '').slice(0, 2000)}`,
  ];
  const assistant = String(assistantText || '').slice(0, 3000);
  if (assistant) lines.push('', `Assistant: ${assistant}`);
  return lines.join('\n');
}

function tidyTitle(value) {
  const line = String(value || '').split(/\r?\n/).map((item) => item.trim()).find(Boolean) || '';
  return line
    .replace(/^(?:title|标题)\s*[:：]\s*/i, '')
    .replace(/^["'“”‘’「」『』【】]+|["'“”‘’「」『』【】]+$/g, '')
    .replace(/[。．.！!？?；;，,、\s]+$/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 40);
}

function cleanFileName(value) {
  const name = String(value || '').split(/[\\/]/).pop().replace(/[\u0000-\u001f]/g, ' ').replace(/\s+/g, ' ').trim();
  return name.slice(0, 120) || 'file';
}

function normalizeFile(file) {
  if (!file || typeof file !== 'object') return null;
  const content = typeof file.content === 'string' ? file.content.slice(0, MAX_FILE_CHARS) : '';
  const name = cleanFileName(file.name || file.path);
  const kind = typeof file.kind === 'string' && file.kind
    ? file.kind.slice(0, 24)
    : (content ? 'text' : kindByExtension(name));
  const entry = {
    name,
    size: Number.isFinite(file.size) && file.size >= 0 ? Math.round(file.size) : content.length,
    kind,
    content,
    chars: content.length,
    truncated: file.truncated === true,
  };
  if (typeof file.path === 'string' && file.path) entry.path = file.path.slice(0, 4096);
  if (typeof file.note === 'string' && file.note.trim()) entry.note = file.note.slice(0, MAX_NOTE);
  if (Number.isFinite(file.pages) && file.pages > 0) entry.pages = Math.round(file.pages);
  return entry;
}

function publicFile(file) {
  if (!file || typeof file !== 'object') return null;
  const out = {
    name: cleanFileName(file.name || file.path),
    size: Number.isFinite(file.size) && file.size >= 0 ? Math.round(file.size) : 0,
    kind: typeof file.kind === 'string' && file.kind ? file.kind.slice(0, 24) : 'binary',
  };
  if (Number.isFinite(file.chars) && file.chars > 0) out.chars = Math.round(file.chars);
  if (file.truncated === true) out.truncated = true;
  if (typeof file.note === 'string' && file.note.trim()) out.note = file.note.slice(0, MAX_NOTE);
  if (Number.isFinite(file.pages) && file.pages > 0) out.pages = Math.round(file.pages);
  return out;
}

function normalizeFiles(input) {
  if (!Array.isArray(input)) return [];
  return input.map(normalizeFile).filter(Boolean).slice(0, MAX_FILES);
}

function fileNames(message) {
  return Array.isArray(message.files) ? message.files.map((file) => file.name).join(', ') : '';
}

function normalizeMessages(input) {
  if (!Array.isArray(input)) return [];
  const out = [];
  for (const message of input) {
    if (!message || (message.role !== 'user' && message.role !== 'assistant')) continue;
    const entry = {
      id: String(message.id || crypto.randomUUID()),
      role: message.role,
      text: typeof message.text === 'string' ? message.text : '',
      at: Number.isFinite(message.at) ? message.at : Date.now(),
      tools: Array.isArray(message.tools) ? message.tools.map(normalizeTool).filter(Boolean) : [],
    };
    if (message.role === 'user') {
      const files = normalizeFiles(message.files);
      if (files.length) entry.files = files;
    }
    if (message.role === 'assistant') {
      if (Number.isFinite(message.durationMs)) entry.durationMs = message.durationMs;
      if (typeof message.model === 'string') entry.model = message.model;
      if (typeof message.reasoning === 'string' && message.reasoning.trim()) {
        entry.reasoning = message.reasoning;
      }
      if (message.error === true) {
        entry.error = true;
        entry.errorText = String(message.errorText || '').slice(0, 4000);
      }
      if (message.interrupted === true) entry.interrupted = true;
    }
    out.push(entry);
  }
  return out.slice(-MAX_MESSAGES);
}

function createConversation(options = {}) {
  const now = Date.now();
  return {
    id: crypto.randomUUID(),
    title: '',
    titleSource: 'default',
    model: options.model || '',
    mode: options.mode || DEFAULT_MODE,
    workspace: options.workspace || DEFAULT_WORKSPACE,
    messages: [],
    inputDraft: '',
    createdAt: now,
    updatedAt: now,
  };
}

function normalizeConversation(source) {
  const parsed = source && typeof source === 'object' ? source : {};
  const conversation = createConversation();
  conversation.id = typeof parsed.id === 'string' && parsed.id && parsed.id.length <= 80
    ? parsed.id : conversation.id;
  conversation.messages = normalizeMessages(parsed.messages);
  // A checkpoint is never treated as a completed answer after an unclean exit.
  if (parsed.pendingReply) {
    const recovered = normalizeMessages([{ ...parsed.pendingReply, role: 'assistant', interrupted: true }])[0];
    if (recovered && !conversation.messages.some((message) => message.id === recovered.id)) {
      recovered.tools.forEach((tool) => { tool.state = 'done'; });
      conversation.messages.push(recovered);
    }
  }
  const firstUser = conversation.messages.find((message) => message.role === 'user');
  const fallbackTitle = cleanTitle(firstUser?.text);
  conversation.title = cleanTitle(parsed.title) || fallbackTitle;
  if (parsed.titleSource === 'manual' || parsed.titleSource === 'ai') {
    conversation.titleSource = parsed.titleSource;
  } else if (conversation.title && fallbackTitle && conversation.title !== fallbackTitle) {
    conversation.titleSource = 'manual';
  }
  conversation.model = typeof parsed.model === 'string' && parsed.model.trim()
    ? parsed.model.trim().slice(0, 120) : '';
  conversation.mode = MODES.some((mode) => mode.key === parsed.mode) ? parsed.mode : DEFAULT_MODE;
  conversation.workspace = isDirectory(parsed.workspace) ? path.resolve(parsed.workspace) : DEFAULT_WORKSPACE;
  conversation.inputDraft = typeof parsed.inputDraft === 'string' ? parsed.inputDraft.slice(0, MAX_PROMPT) : '';
  conversation.createdAt = Number.isFinite(parsed.createdAt) ? parsed.createdAt
    : (conversation.messages[0]?.at || Date.now());
  conversation.updatedAt = Number.isFinite(parsed.updatedAt) && parsed.updatedAt > 0
    ? parsed.updatedAt : conversation.createdAt;
  return conversation;
}

function loadHistory(file) {
  let parsed;
  try {
    parsed = JSON.parse(fs.readFileSync(file, 'utf8'));
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('Invalid history');
    if (parsed.version != null && ![1, 2].includes(parsed.version)) throw new Error('Unknown history version');
    if (parsed.version === 2 && !Array.isArray(parsed.conversations)) throw new Error('Invalid conversations');
  } catch (error) {
    if (error.code !== 'ENOENT' && fs.existsSync(file)) {
      // Keep the original bytes for manual recovery rather than silently overwriting them.
      fs.copyFileSync(file, `${file}.corrupt-${Date.now()}.bak`, fs.constants.COPYFILE_EXCL);
      console.error('[custom-chat] Invalid history was backed up:', error.message);
    }
    parsed = null;
  }
  const sources = parsed?.version === 2 ? parsed.conversations : (parsed ? [parsed] : []);
  const seen = new Set();
  const conversations = sources.filter((entry) => entry && typeof entry === 'object').map((entry) => {
    const conversation = normalizeConversation(entry);
    if (seen.has(conversation.id)) conversation.id = crypto.randomUUID();
    seen.add(conversation.id);
    return conversation;
  });
  if (!conversations.length) conversations.push(createConversation());
  if (parsed && parsed.version !== 2) {
    const backup = `${file}.v1-backup`;
    if (!fs.existsSync(backup)) fs.copyFileSync(file, backup, fs.constants.COPYFILE_EXCL);
  }
  return {
    conversations,
    activeConversationId: conversations.some((entry) => entry.id === parsed?.activeConversationId)
      ? parsed.activeConversationId : conversations[0].id,
    needsSave: !!parsed && (parsed.version !== 2 || sources.some((entry) => entry?.pendingReply)),
  };
}

function createCustomChat({ stateFile, customStore, onEvent }) {
  const history = loadHistory(stateFile);
  let state = history.conversations.find((entry) => entry.id === history.activeConversationId);
  let activeRun = null;
  let shuttingDown = false;
  const titleJobs = new Map();
  const autoTitleTried = new Set();

  const emit = (event) => {
    if (shuttingDown) return;
    if (activeRun && !activeRun.finished && ['delta', 'tool', 'tool-result', 'thinking'].includes(event.type)) {
      checkpointSoon(activeRun);
    }
    try { onEvent({ conversationId: state.id, ...event }); } catch {}
  };

  function customList() {
    try {
      return customStore ? customStore.list() : [];
    } catch {
      return [];
    }
  }

  function resolveCustom(ref) {
    if (!customStore || typeof ref !== 'string' || !ref.startsWith('custom:')) return null;
    try {
      return customStore.get(ref.slice('custom:'.length));
    } catch {
      return null;
    }
  }

  function publicMessage(message) {
    const copy = {
      ...message,
      tools: message.tools.map((tool) => ({ ...tool })),
    };
    delete copy.files;
    if (Array.isArray(message.files) && message.files.length) {
      copy.files = message.files.map(publicFile).filter(Boolean);
    }
    return copy;
  }

  const staged = new Map();

  function stagedList() {
    return [...staged.values()].map((file) => ({ ...publicFile(file), id: file.id }));
  }

  let stagingQueue = Promise.resolve();

  async function doStageFiles(paths) {
    const list = Array.isArray(paths) ? paths.filter((value) => typeof value === 'string' && value) : [];
    if (!list.length) return { ok: false, error: 'empty' };
    const errors = [];
    for (const filePath of list) {
      if (staged.size >= MAX_FILES) {
        errors.push({ name: path.basename(filePath), code: 'too-many-files' });
        break;
      }
      const existing = [...staged.values()].find((file) => file.path === filePath);
      if (existing) continue;
      let extracted;
      try {
        extracted = await extractAttachment(filePath, { maxChars: MAX_FILE_CHARS });
      } catch (error) {
        errors.push({
          name: path.basename(filePath),
          code: error && error.message === 'not-a-file' ? 'not-a-file' : 'unreadable-file',
        });
        continue;
      }
      const file = { ...extracted, id: crypto.randomUUID() };
      staged.set(file.id, file);
    }
    return { ok: true, files: stagedList(), errors };
  }

  function stageFiles(paths) {
    const job = stagingQueue.then(() => doStageFiles(paths));
    stagingQueue = job.catch(() => {});
    return job;
  }

  function unstageFile(id) {
    if (typeof id === 'string' && id) staged.delete(id);
    return { ok: true, files: stagedList() };
  }

  function clearStaged() {
    staged.clear();
  }

  function resolveStaged(ids) {
    if (ids == null) return { files: [] };
    if (!Array.isArray(ids)) return { error: 'invalid-file' };
    if (ids.length > MAX_FILES) return { error: 'too-many-files' };
    const files = [];
    for (const id of ids) {
      const file = staged.get(String(id));
      if (!file) return { error: 'attachment-expired' };
      files.push(file);
    }
    return { files };
  }

  function modelEntries() {
    return customList().map((entry) => ({
      value: `custom:${entry.id}`,
      label: entry.name,
      kind: 'custom',
      type: entry.type,
      api: entry.api,
      effort: entry.effort,
      model: entry.model,
      tools: entry.tools === true,
    }));
  }

  function ensureModel() {
    if (state.model && resolveCustom(state.model)) return false;
    const entries = customList();
    state.model = entries.length ? `custom:${entries[0].id}` : '';
    return true;
  }

  function listConversations(query = '') {
    const search = String(query || '').trim().toLocaleLowerCase().slice(0, 200);
    return history.conversations
      .filter((conversation) => !search || [conversation.title, conversation.model, conversation.workspace]
        .some((value) => String(value || '').toLocaleLowerCase().includes(search))
        || conversation.messages.some((message) => message.text.toLocaleLowerCase().includes(search)
          || (message.files || []).some((file) => file.name.toLocaleLowerCase().includes(search))))
      .slice().sort((a, b) => b.updatedAt - a.updatedAt || b.createdAt - a.createdAt)
      .map((conversation) => {
        const custom = resolveCustom(conversation.model);
        const last = [...conversation.messages].reverse()
          .find((message) => message.text.trim() || message.errorText || (message.files || []).length);
        const fallback = last && !last.text.trim() ? fileNames(last) : '';
        return {
          id: conversation.id,
          title: conversation.title,
          preview: String(last?.text || last?.errorText || fallback || '').replace(/\s+/g, ' ').slice(0, 120),
          model: conversation.model,
          modelLabel: custom ? custom.name : conversation.model,
          workspace: conversation.workspace,
          messageCount: conversation.messages.length,
          createdAt: conversation.createdAt,
          updatedAt: conversation.updatedAt,
        };
      });
  }

  function getState() {
    if (ensureModel()) save({ touch: false });
    const selected = resolveCustom(state.model);
    return {
      conversationId: state.id,
      conversationTitle: state.title,
      conversations: listConversations(),
      inputDraft: state.inputDraft,
      model: state.model,
      modelKind: selected ? 'custom' : null,
      modelLabel: selected ? selected.name : '',
      modelEntries: modelEntries(),
      mode: state.mode,
      workspace: state.workspace,
      modes: MODES.map(({ key, label, hint }) => ({ key, label, hint })),
      tools: !!selected && selected.tools === true,
      attachments: stagedList(),
      messages: state.messages.map(publicMessage),
      busy: !!activeRun && !activeRun.finished,
      draft: activeRun && !activeRun.finished ? {
        text: activeRun.text,
        reasoning: activeRun.reasoning,
        thinking: activeRun.thinking,
        tools: activeRun.tools.map((tool) => ({ ...tool })),
      } : null,
      updatedAt: state.updatedAt,
    };
  }

  function pendingReply(run) {
    return {
      id: run.messageId,
      role: 'assistant',
      text: run.text.trim(),
      reasoning: run.reasoning,
      tools: run.tools.map((tool) => ({ ...tool })),
      at: run.startedAt,
      durationMs: Date.now() - run.startedAt,
      model: run.modelLabel,
    };
  }

  function checkpointSoon(run) {
    if (run.checkpointTimer || run.finished) return;
    run.checkpointTimer = setTimeout(() => {
      run.checkpointTimer = null;
      if (activeRun === run && !run.finished) save();
    }, CHECKPOINT_MS);
  }

  function save({ touch = true } = {}) {
    if (touch) state.updatedAt = Date.now();
    history.activeConversationId = state.id;
    if (activeRun && !activeRun.finished) state.pendingReply = pendingReply(activeRun);
    else delete state.pendingReply;
    const saved = writeJsonAtomic(stateFile, {
      version: 2,
      activeConversationId: state.id,
      conversations: history.conversations,
    });
    if (!saved) emit({ type: 'notice', code: 'history-save-failed' });
    return saved;
  }

  function emitSnapshot() {
    emit({ type: 'snapshot', state: getState() });
  }

  function emitDelta(run) {
    if (activeRun !== run || run.finished) return;
    emit({
      type: 'delta',
      text: run.text,
      reasoning: run.reasoning,
      thinking: run.thinking,
    });
  }

  function appendReasoning(run, chunk) {
    if (!chunk) return;
    run.reasoning += chunk;
  }

  function finishRun(run, outcome = {}) {
    if (run.finished) return;
    run.finished = true;
    clearTimeout(run.hardTimer);
    clearTimeout(run.checkpointTimer);
    if (activeRun === run) activeRun = null;

    const text = run.text.trim();
    const errorText = outcome.error ? String(outcome.error).slice(0, 4000) : '';
    const stopped = outcome.stopped === true;
    const durationMs = Date.now() - run.startedAt;
    const message = {
      id: run.messageId,
      role: 'assistant',
      text,
      tools: run.tools.map((tool) => ({ ...tool, state: 'done' })),
      at: Date.now(),
      durationMs,
      model: run.modelLabel,
    };
    if (run.reasoning && run.reasoning.trim()) {
      message.reasoning = run.reasoning.trim();
    }
    if (stopped) message.interrupted = true;
    if (errorText) {
      message.error = true;
      message.errorText = errorText;
    }
    state.messages.push(message);
    state.messages = state.messages.slice(-MAX_MESSAGES);
    save();

    if (errorText) emit({ type: 'error', message, error: errorText, state: getState() });
    else if (stopped) emit({ type: 'stopped', message, state: getState() });
    else emit({ type: 'done', message, state: getState() });

    if (!errorText) maybeAutoTitle(state);
  }

  function runCustomTools(run, entry, historyMessages) {
    const conversation = historyMessages.map((message) => ({ role: message.role, content: message.content }));
    conversation.unshift({ role: 'system', content: toolSystemPrompt(state.workspace, state.mode) });
    const permissionMode = PERMISSION_MODE[state.mode] || 'default';
    let callCount = 0;

    const fail = (error) => {
      if (run.finished) return;
      if (run.stopRequested) {
        finishRun(run, { stopped: true });
        return;
      }
      if (run.timedOut) {
        finishRun(run, { error: 'timeout' });
        return;
      }
      if (error && error.name === 'AbortError') {
        finishRun(run, { error: 'aborted' });
        return;
      }
      finishRun(run, { error: String((error && error.message) || error) });
    };

    const loop = async () => {
      for (let round = 0; ; round += 1) {
        if (run.finished) return;
        if (round >= MAX_TOOL_ROUNDS) {
          finishRun(run, { error: 'tool-round-limit' });
          return;
        }
        let textStarted = false;
        const turn = await customStore.toolTurn(entry, conversation, {
          signal: run.controller.signal,
          tools: customTools.toolSpecs(),
          onDelta: (chunk) => {
            if (run.finished || activeRun !== run) return;
            if (!textStarted) {
              textStarted = true;
              if (run.text) run.text = `${run.text.replace(/\s+$/, '')}\n\n`;
            }
            run.text += chunk;
            run.thinking = false;
            emitDelta(run);
          },
          onReasoning: (chunk) => {
            if (run.finished || activeRun !== run) return;
            if (!run.reasoning && !run.text && !run.thinking) {
              run.thinking = true;
              emit({ type: 'thinking', value: true });
            }
            appendReasoning(run, chunk);
            emitDelta(run);
          },
        });
        if (run.finished) return;
        if (!Array.isArray(turn.toolCalls) || !turn.toolCalls.length) {
          finishRun(run);
          return;
        }

        conversation.push({
          role: 'assistant',
          content: turn.text || '',
          toolCalls: turn.toolCalls,
          apiBlocks: turn.apiBlocks || null,
        });

        for (const call of turn.toolCalls) {
          if (run.finished) return;
          if (run.stopRequested) {
            finishRun(run, { stopped: true });
            return;
          }
          callCount += 1;
          if (callCount > MAX_TOOL_CALLS) {
            finishRun(run, { error: 'tool-call-limit' });
            return;
          }
          const name = String(call.name || 'tool').slice(0, 80);
          const input = call.input && typeof call.input === 'object' ? call.input : {};
          const tool = {
            id: String(call.id || crypto.randomUUID()),
            name,
            summary: toolSummary(name, input),
            inputText: clip(call.parseError && call.rawArguments ? call.rawArguments : safeJson(input), MAX_TOOL_TEXT),
            result: '',
            isError: false,
            state: 'running',
          };
          run.tools.push(tool);
          emit({ type: 'tool', tool: { ...tool } });

          let result;
          if (call.parseError) {
            result = { content: `Tool arguments were not valid JSON: ${call.parseError}`, isError: true };
          } else {
            result = await customTools.executeTool(name, input, {
              workspace: state.workspace,
              mode: permissionMode,
              signal: run.controller.signal,
            });
          }
          if (run.finished) return;
          if (run.stopRequested) {
            finishRun(run, { stopped: true });
            return;
          }
          tool.result = clip(toolContentText(result && result.content), MAX_TOOL_TEXT);
          tool.isError = !!(result && result.isError);
          tool.state = 'done';
          emit({ type: 'tool-result', id: tool.id, result: tool.result, isError: tool.isError });
          conversation.push({
            role: 'tool',
            toolCallId: tool.id,
            name,
            content: String((result && result.content) || ''),
            isError: tool.isError,
          });
        }
      }
    };

    loop().catch(fail);
  }

  function launchRun(entry, prompt) {
    const run = {
      controller: new AbortController(),
      entry,
      modelLabel: entry.name,
      messageId: crypto.randomUUID(),
      text: '',
      reasoning: '',
      thinking: false,
      tools: [],
      stopRequested: false,
      finished: false,
      timedOut: false,
      startedAt: Date.now(),
      hardTimer: null,
      checkpointTimer: null,
    };
    activeRun = run;
    emit({ type: 'snapshot', state: getState() });

    const historyMessages = customStore
      ? customStore.buildHistory(state.messages)
      : state.messages.map((message) => ({ role: message.role, content: message.text }));

    run.hardTimer = setTimeout(() => {
      if (run.finished) return;
      run.timedOut = true;
      try { run.controller.abort(); } catch {}
      setTimeout(() => {
        if (!run.finished) finishRun(run, { error: 'timeout' });
      }, 900);
    }, RUN_LIMIT_MS);

    if (entry.tools === true) {
      runCustomTools(run, entry, historyMessages);
      return { ok: true };
    }

    customStore.stream(entry, historyMessages, {
      signal: run.controller.signal,
      onDelta: (chunk) => {
        if (run.finished || activeRun !== run) return;
        run.text += chunk;
        run.thinking = false;
        emitDelta(run);
      },
      onReasoning: (chunk) => {
        if (run.finished || activeRun !== run) return;
        if (!run.reasoning && !run.text && !run.thinking) {
          run.thinking = true;
          emit({ type: 'thinking', value: true });
        }
        appendReasoning(run, chunk);
        emitDelta(run);
      },
    }).then((reply) => {
      if (run.finished) return;
      if (!run.text && typeof reply === 'string') run.text = reply;
      finishRun(run);
    }).catch((error) => {
      if (run.finished) return;
      if (run.stopRequested) {
        finishRun(run, { stopped: true });
        return;
      }
      if (run.timedOut) {
        finishRun(run, { error: 'timeout' });
        return;
      }
      if (error && error.name === 'AbortError') {
        finishRun(run, { error: 'aborted' });
        return;
      }
      finishRun(run, { error: String((error && error.message) || error) });
    });

    return { ok: true };
  }

  function send(text, attachmentIds) {
    if (activeRun && !activeRun.finished) return { ok: false, error: 'busy' };
    const prompt = String(text == null ? '' : text).trim();
    const resolved = resolveStaged(attachmentIds);
    if (resolved.error) return { ok: false, error: resolved.error };
    const files = resolved.files;
    if (!prompt && !files.length) return { ok: false, error: 'empty' };
    if (prompt.length > MAX_PROMPT) return { ok: false, error: 'too-long' };

    ensureModel();
    const entry = resolveCustom(state.model);
    if (!entry) return { ok: false, error: 'no-model' };

    const message = {
      id: crypto.randomUUID(),
      role: 'user',
      text: prompt.slice(0, MAX_PROMPT),
      at: Date.now(),
      tools: [],
    };
    const stored = normalizeFiles(files);
    if (stored.length) message.files = stored;
    state.messages.push(message);
    state.messages = state.messages.slice(-MAX_MESSAGES);
    if (!state.title) {
      state.title = cleanTitle(prompt || fileNames(message));
      state.titleSource = 'default';
    }
    state.inputDraft = '';
    for (const file of files) staged.delete(file.id);
    save();

    return launchRun(entry, message.text);
  }

  function interject(text, attachmentIds) {
    const prompt = String(text == null ? '' : text).trim();
    const resolved = resolveStaged(attachmentIds);
    if (resolved.error) return { ok: false, error: resolved.error };
    if (!prompt && !resolved.files.length) return { ok: false, error: 'empty' };
    if (prompt.length > MAX_PROMPT) return { ok: false, error: 'too-long' };
    const run = activeRun;
    if (!run || run.finished) return send(prompt, attachmentIds);
    const conversationId = state.id;
    run.stopRequested = true;
    emit({ type: 'run-status', status: 'stopping' });
    try { run.controller.abort(); } catch {}
    return new Promise((resolve) => {
      const startedAt = Date.now();
      const timer = setInterval(() => {
        if (!run.finished && Date.now() - startedAt < 1000) return;
        clearInterval(timer);
        if (!run.finished) finishRun(run, { stopped: true });
        if (state.id !== conversationId) {
          resolve({ ok: false, error: 'conversation-not-found' });
          return;
        }
        resolve(send(prompt, attachmentIds));
      }, 40);
    });
  }

  function stop() {
    const run = activeRun;
    if (!run || run.finished) return { ok: false, error: 'idle' };
    run.stopRequested = true;
    emit({ type: 'run-status', status: 'stopping' });
    try { run.controller.abort(); } catch {}
    setTimeout(() => {
      if (activeRun === run && !run.finished) finishRun(run, { stopped: true });
    }, 800);
    return { ok: true };
  }

  function interruptActiveRun() {
    const run = activeRun;
    if (!run || run.finished) return;
    run.stopRequested = true;
    try { run.controller.abort(); } catch {}
    finishRun(run, { stopped: true });
  }

  function newChat() {
    interruptActiveRun();
    clearStaged();
    if (!state.messages.length && !state.inputDraft) {
      emitSnapshot();
      return { ok: true, state: getState() };
    }
    state = createConversation(state);
    history.conversations.push(state);
    save({ touch: false });
    emitSnapshot();
    return { ok: true, state: getState() };
  }

  function switchConversation(id) {
    const target = history.conversations.find((entry) => entry.id === id);
    if (!target) return { ok: false, error: 'conversation-not-found' };
    if (target !== state) {
      interruptActiveRun();
      clearStaged();
      state = target;
      save({ touch: false });
    }
    emitSnapshot();
    return { ok: true, state: getState() };
  }

  function renameConversation(id, title) {
    const target = history.conversations.find((entry) => entry.id === id);
    if (!target) return { ok: false, error: 'conversation-not-found' };
    const value = typeof title === 'string' ? cleanTitle(title) : '';
    if (!value) return { ok: false, error: 'invalid-title' };
    target.title = value;
    target.titleSource = 'manual';
    save({ touch: false });
    emitSnapshot();
    return { ok: true, state: getState() };
  }

  function titleContext(conversation) {
    const user = conversation.messages.find((message) => message.role === 'user' && message.text.trim());
    const assistant = conversation.messages
      .find((message) => message.role === 'assistant' && !message.error && message.text.trim());
    return { user, assistant };
  }

  function applyTitle(conversation, value, source) {
    const title = tidyTitle(value);
    if (!title) return '';
    conversation.title = title.slice(0, MAX_TITLE);
    conversation.titleSource = source;
    save({ touch: false });
    emitSnapshot();
    return conversation.title;
  }

  function generateTitle(conversation) {
    const { user, assistant } = titleContext(conversation);
    if (!user) return Promise.resolve('');
    const prompt = titlePrompt(user.text, assistant ? assistant.text : '');
    const custom = resolveCustom(conversation.model);
    if (!custom || !customStore) return Promise.resolve('');
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TITLE_TIMEOUT_MS);
    return customStore.stream(
      { ...custom, effort: '' },
      [{ role: 'user', content: prompt }],
      { signal: controller.signal, maxTokens: 1024 }
    ).then((reply) => tidyTitle(reply || '')).catch(() => '').finally(() => clearTimeout(timer));
  }

  function maybeAutoTitle(conversation) {
    if (shuttingDown || !conversation || conversation.titleSource !== 'default') return;
    if (!history.conversations.includes(conversation)) return;
    if (autoTitleTried.has(conversation.id) || titleJobs.has(conversation.id)) return;
    const { user, assistant } = titleContext(conversation);
    if (!user || !assistant) return;
    autoTitleTried.add(conversation.id);
    const job = generateTitle(conversation);
    titleJobs.set(conversation.id, job);
    job.then((value) => {
      if (!value || conversation.titleSource !== 'default') return;
      if (!history.conversations.includes(conversation)) return;
      applyTitle(conversation, value, 'ai');
    }).catch(() => {}).finally(() => titleJobs.delete(conversation.id));
  }

  async function suggestTitle(id) {
    const conversation = history.conversations.find((entry) => entry.id === id);
    if (!conversation) return { ok: false, error: 'conversation-not-found' };
    if (!titleContext(conversation).user) return { ok: false, error: 'no-messages' };
    if (titleJobs.has(id)) return { ok: false, error: 'title-busy' };
    const previous = conversation.title;
    const job = generateTitle(conversation);
    titleJobs.set(id, job);
    try {
      const value = await job;
      if (!value) return { ok: false, error: 'title-failed' };
      if (!history.conversations.includes(conversation)) return { ok: false, error: 'conversation-not-found' };
      if (conversation.title !== previous) return { ok: false, error: 'title-failed' };
      const title = applyTitle(conversation, value, 'ai');
      return title ? { ok: true, title, state: getState() } : { ok: false, error: 'title-failed' };
    } finally {
      titleJobs.delete(id);
    }
  }

  function deleteConversation(id) {
    const target = history.conversations.find((entry) => entry.id === id);
    if (!target) return { ok: false, error: 'conversation-not-found' };
    if (target === state) {
      interruptActiveRun();
      clearStaged();
    }
    history.conversations = history.conversations.filter((entry) => entry !== target);
    if (target === state) {
      state = history.conversations.slice().sort((a, b) => b.updatedAt - a.updatedAt)[0]
        || createConversation(target);
      if (!history.conversations.length) history.conversations.push(state);
    }
    save({ touch: false });
    emitSnapshot();
    return { ok: true, state: getState() };
  }

  function saveInputDraft(id, text) {
    const target = history.conversations.find((entry) => entry.id === id);
    if (!target) return { ok: false, error: 'conversation-not-found' };
    if (typeof text !== 'string') return { ok: false, error: 'invalid-draft' };
    const value = text.slice(0, MAX_PROMPT);
    if (target.inputDraft === value) return { ok: true };
    target.inputDraft = value;
    return save({ touch: false }) ? { ok: true } : { ok: false, error: 'history-save-failed' };
  }

  function setModel(model) {
    if (activeRun && !activeRun.finished) return { ok: false, error: 'busy' };
    const value = String(model == null ? '' : model).trim().slice(0, 120);
    if (!value || !resolveCustom(value)) {
      return { ok: false, error: 'invalid-model' };
    }
    state.model = value;
    save();
    emitSnapshot();
    return { ok: true, state: getState() };
  }

  function setMode(mode) {
    if (activeRun && !activeRun.finished) return { ok: false, error: 'busy' };
    const value = String(mode == null ? '' : mode).trim();
    if (!MODES.some((item) => item.key === value)) return { ok: false, error: 'invalid-mode' };
    state.mode = value;
    save();
    emitSnapshot();
    return { ok: true, state: getState() };
  }

  function setWorkspace(workspace) {
    if (activeRun && !activeRun.finished) return { ok: false, error: 'busy' };
    const value = path.resolve(String(workspace == null ? '' : workspace));
    if (!isDirectory(value)) return { ok: false, error: 'invalid-workspace' };
    if (value === state.workspace) return { ok: true, state: getState() };
    clearStaged();
    if (state.messages.length || state.inputDraft) {
      state = createConversation({ ...state, workspace: value });
      history.conversations.push(state);
    } else {
      state.workspace = value;
    }
    save();
    emitSnapshot();
    return { ok: true, state: getState() };
  }

  function refreshCustomModels() {
    if (ensureModel()) save();
    emitSnapshot();
    return { ok: true, state: getState() };
  }

  function dispose() {
    shuttingDown = true;
    clearStaged();
    interruptActiveRun();
  }

  if (history.needsSave) save({ touch: false });

  return {
    getState,
    listConversations,
    switchConversation,
    renameConversation,
    suggestTitle,
    deleteConversation,
    saveInputDraft,
    stageFiles,
    unstageFile,
    clearStaged,
    send,
    interject,
    stop,
    newChat,
    setModel,
    setMode,
    setWorkspace,
    refreshCustomModels,
    dispose,
  };
}

module.exports = { createCustomChat };
