const { spawn } = require('child_process');
const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');
const customTools = require('./custom-tools');
const { extractAttachment, kindByExtension } = require('./attachments');

const QODER_HOME = path.join(os.homedir(), '.qoder-cn');
const DEFAULT_WORKSPACE = os.homedir();
const DEFAULT_MODEL = 'DeepSeek-Flash';
const DEFAULT_MODE = 'yolo';
const MAX_TITLE = 80;
const CHECKPOINT_MS = 1200;
const MAX_PROMPT = 20000;
const MAX_FILES = 10;
const MAX_FILE_CHARS = 300000;
const MAX_NOTE = 500;
const MAX_TOOL_TEXT = 4000;
const MAX_TOOL_ROUNDS = 100;
const MAX_TOOL_CALLS = 500;
const MAX_IMAGE_PROMPT = 750;
const IMAGE_MARK_RE = /```(?:image|img)\b\s*([\s\S]*?)```/i;
const IMAGE_GUIDE = [
  'App capability: the app can render generated images.',
  'When the user asks you to draw, design or generate a picture, output a fenced code block tagged image containing a detailed English image prompt, for example:',
  '```image',
  'a chibi girl in a snowy park, soft winter light',
  '```',
  'The app renders the picture below your reply. Do not output markdown images or image URLs.',
].join('\n');
const TITLE_TIMEOUT_MS = 30000;
const RUN_LIMIT_MS = 12 * 60 * 60 * 1000;
const MODELS_TTL_MS = 12 * 60 * 60 * 1000;

const FALLBACK_MODELS = [
  'Auto',
  'Fast',
  'Qwen3.8-Max',
  'Qwen3.8-Flash',
  'Qwen3.7-Max',
  'Qwen3.7-Plus',
  'Qwen3.7-Flash',
  'DeepSeek-V4-Pro',
  'DeepSeek-Flash',
  'GLM-5.3',
  'GLM-5.3-Flash',
  'GLM-5.2',
  'Kimi-K3',
  'Kimi-K2.8-Preview',
  'MiniMax-M2.7',
];

const MODES = [
  {
    key: 'yolo',
    label: { zh: 'YOLO · 全部放行', en: 'YOLO · allow all' },
    hint: { zh: '工具直接执行，不再确认', en: 'Tools run without confirmation' },
    danger: true,
  },
  {
    key: 'accept_edits',
    label: { zh: '自动接受编辑', en: 'Accept edits' },
    hint: { zh: '自动允许文件修改，其他工具可能被拒绝', en: 'Edits are allowed automatically; other tools may be denied' },
  },
  {
    key: 'dont_ask',
    label: { zh: '不询问', en: "Don't ask" },
    hint: { zh: '不会弹确认，未授权的工具直接拒绝', en: 'No prompts; unauthorized tools are denied' },
  },
  {
    key: 'default',
    label: { zh: '默认', en: 'Default' },
    hint: { zh: '只读工具可用，其余调用可能被拒绝', en: 'Read-only tools work; other calls may be denied' },
  },
];

function findQoder() {
  const candidates = [
    process.env.QODERCN_CLI,
    path.join(QODER_HOME, 'entry', 'qoder-cn'),
    path.join(QODER_HOME, 'entry', 'qodercn'),
    path.join(os.homedir(), '.local', 'bin', 'qoderclicn'),
  ].filter(Boolean);
  for (const candidate of candidates) {
    try {
      if (fs.statSync(candidate).isFile()) return candidate;
    } catch {}
  }
  return null;
}

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
    fs.writeFileSync(tmp, JSON.stringify(value, null, 2), { mode: 0o600 });
    fs.renameSync(tmp, file);
    return true;
  } catch (error) {
    console.error('[qoder-chat] Could not save', path.basename(file), error.message);
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

function normalizeImage(input) {
  if (!input || typeof input !== 'object') return null;
  const prompt = typeof input.prompt === 'string'
    ? input.prompt.replace(/\s+/g, ' ').trim().slice(0, MAX_IMAGE_PROMPT) : '';
  if (typeof input.file === 'string' && input.file && !/[\\/]/.test(input.file)) {
    return { prompt, file: input.file.slice(0, 160), state: 'ready' };
  }
  if (input.state === 'pending' || input.state === 'error') {
    // A pending image means the app exited before generation finished.
    return { prompt, state: 'error', error: String(input.error || 'interrupted').slice(0, 80) };
  }
  return null;
}

function fileNames(message) {
  return Array.isArray(message.files) ? message.files.map((file) => file.name).join(', ') : '';
}

function qoderPrompt(message) {
  const text = String(message.text || '').trim();
  const files = Array.isArray(message.files) ? message.files : [];
  let prompt = text;
  if (files.length) {
    const labels = files.map((file) => (typeof file.path === 'string' && file.path ? file.path : file.name));
    const note = files.length === 1
      ? `Attached file: ${labels[0]}`
      : `Attached files: ${labels.join(', ')}`;
    prompt = prompt ? `${prompt}\n\n${note}` : note;
  }
  return prompt ? `${prompt}\n\n${IMAGE_GUIDE}` : IMAGE_GUIDE;
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
      if (Number.isFinite(message.credits)) entry.credits = message.credits;
      if (Number.isFinite(message.durationMs)) entry.durationMs = message.durationMs;
      if (typeof message.model === 'string') entry.model = message.model;
      if (typeof message.reasoning === 'string' && message.reasoning.trim()) {
        entry.reasoning = message.reasoning;
      }
      const image = normalizeImage(message.image);
      if (image) entry.image = image;
      if (message.error === true) {
        entry.error = true;
        entry.errorText = String(message.errorText || '').slice(0, 4000);
      }
      if (message.interrupted === true) entry.interrupted = true;
    }
    out.push(entry);
  }
  return out;
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

function killProcessGroup(child) {
  if (!child || child.exitCode !== null || child.signalCode) return;
  try {
    process.kill(-child.pid, 'SIGTERM');
  } catch {
    try { child.kill('SIGTERM'); } catch {}
  }
  setTimeout(() => {
    if (child.exitCode !== null || child.signalCode) return;
    try {
      process.kill(-child.pid, 'SIGKILL');
    } catch {
      try { child.kill('SIGKILL'); } catch {}
    }
  }, 800);
}

function appendText(current, next) {
  if (!current) return next;
  if (!next) return current;
  return current.endsWith('\n\n') ? current + next : `${current}\n\n${next}`;
}

function toolSystemPrompt(workspace, mode) {
  return [
    'You are a helpful assistant with local tools for reading and editing files and running terminal commands.',
    `Workspace: ${workspace}`,
    `Permission mode: ${mode}.`,
    `Current time: ${new Date().toISOString()}`,
    'File paths are relative to the workspace; absolute paths inside the workspace are also accepted.',
    'Use run_command for terminal tasks instead of asking the user to run them. Keep tool use focused and tell the user briefly what you are doing.',
    'If a tool is denied by the permission mode, explain what mode the user needs to switch to.',
  ].join('\n');
}

function runText(run) {
  return appendText(run.finalText, run.block);
}

function isResumeFailure(text) {
  return /invalid session identifier|no conversation found|cannot resume|session .*not found|unable to resume/i.test(String(text || ''));
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

function requestQoderTitle(model, prompt, workspace) {
  return new Promise((resolve) => {
    const qoder = findQoder();
    if (!qoder) return resolve('');
    let child = null;
    let settled = false;
    const finish = (value) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (child) killProcessGroup(child);
      resolve(tidyTitle(value));
    };
    const timer = setTimeout(() => finish(''), TITLE_TIMEOUT_MS);
    try {
      child = spawn(qoder, [
        '-p', prompt,
        '--output-format', 'stream-json',
        '--model', model,
        '--no-session-persistence',
        '--thinking', 'disabled',
        '--max-output-tokens', '300',
        '--tools', '',
      ], {
        cwd: isDirectory(workspace) ? workspace : DEFAULT_WORKSPACE,
        env: { ...process.env, TERM: 'xterm-256color' },
        detached: true,
        stdio: ['ignore', 'pipe', 'pipe'],
      });
    } catch {
      finish('');
      return;
    }
    let buffer = '';
    let streamed = '';
    child.stdout.setEncoding('utf8');
    child.stdout.on('data', (chunk) => {
      buffer += chunk;
      let index;
      while ((index = buffer.indexOf('\n')) >= 0) {
        const line = buffer.slice(0, index).trim();
        buffer = buffer.slice(index + 1);
        if (!line) continue;
        let event;
        try { event = JSON.parse(line); } catch { continue; }
        if (event.type === 'result') {
          finish(typeof event.result === 'string' && event.result.trim() ? event.result : streamed);
          return;
        }
        if (event.type === 'assistant' && event.message && Array.isArray(event.message.content)) {
          for (const block of event.message.content) {
            if (block && block.type === 'text' && typeof block.text === 'string') streamed += block.text;
          }
        }
      }
    });
    child.stderr.on('data', () => {});
    child.on('error', () => finish(''));
    child.on('close', () => finish(streamed));
  });
}

function createConversation(options = {}) {
  const now = Date.now();
  return {
    id: crypto.randomUUID(),
    title: '',
    titleSource: 'default',
    sessionId: null,
    model: options.model || DEFAULT_MODEL,
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
  conversation.sessionId = typeof parsed.sessionId === 'string' && parsed.sessionId.length <= 80
    ? parsed.sessionId : null;
  conversation.model = typeof parsed.model === 'string' && parsed.model.trim()
    ? parsed.model.trim().slice(0, 120) : DEFAULT_MODEL;
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
      console.error('[qoder-chat] Invalid history was backed up:', error.message);
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

function loadModelCache(file) {
  try {
    const data = JSON.parse(fs.readFileSync(file, 'utf8'));
    if (Array.isArray(data.models) && data.models.length) {
      return {
        models: data.models.map(String).filter(Boolean),
        fetchedAt: Number(data.fetchedAt) || 0,
      };
    }
  } catch {}
  return { models: FALLBACK_MODELS.slice(), fetchedAt: 0 };
}

function createQoderChat({ stateFile, modelsFile, customStore, imagegen, onEvent }) {
  const history = loadHistory(stateFile);
  let state = history.conversations.find((entry) => entry.id === history.activeConversationId);
  const cache = loadModelCache(modelsFile);
  let models = cache.models;
  let modelsFetchedAt = cache.fetchedAt;
  let modelsRefreshing = null;
  let modelsChild = null;
  let activeRun = null;
  let shuttingDown = false;
  const titleJobs = new Map();
  const autoTitleTried = new Set();
  const staged = new Map();

  const emit = (event) => {
    if (shuttingDown) return;
    if (activeRun && !activeRun.finished && ['delta', 'tool', 'tool-result', 'thinking', 'credits'].includes(event.type)) {
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

  function isCustomModel(ref) {
    return typeof ref === 'string' && ref.startsWith('custom:');
  }

  function modelEntries() {
    const qoderEntries = models.map((name) => ({
      value: name,
      label: name,
      kind: 'qoder',
    }));
    const customEntries = customList().map((entry) => ({
      value: `custom:${entry.id}`,
      label: entry.name,
      kind: 'custom',
      type: entry.type,
      api: entry.api,
      effort: entry.effort,
      model: entry.model,
      tools: entry.tools === true,
    }));
    return [...qoderEntries, ...customEntries];
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
    if (message.image) copy.image = { ...message.image };
    return copy;
  }

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
    const selectedCustom = resolveCustom(state.model);
    if (isCustomModel(state.model) && !selectedCustom) {
      state.model = DEFAULT_MODEL;
    }
    return {
      conversationId: state.id,
      conversationTitle: state.title,
      conversations: listConversations(),
      inputDraft: state.inputDraft,
      sessionId: state.sessionId,
      model: state.model,
      modelKind: selectedCustom ? 'custom' : 'qoder',
      modelLabel: selectedCustom ? selectedCustom.name : state.model,
      mode: state.mode,
      workspace: state.workspace,
      messages: state.messages.map(publicMessage),
      models,
      modelEntries: modelEntries(),
      customModels: customList(),
      modes: MODES.map(({ key, label, hint, danger }) => ({ key, label, hint, danger: !!danger })),
      busy: !!activeRun && !activeRun.finished,
      draft: activeRun && !activeRun.finished ? {
        text: runText(activeRun),
        reasoning: activeRun.reasoning,
        thinking: activeRun.thinking,
        tools: activeRun.tools.map((tool) => ({ ...tool })),
        credits: activeRun.credits,
      } : null,
      updatedAt: state.updatedAt,
      attachments: stagedList(),
    };
  }

  function pendingReply(run) {
    return {
      id: run.messageId,
      role: 'assistant',
      text: runText(run).trim(),
      reasoning: run.reasoning,
      tools: run.tools.map((tool) => ({ ...tool })),
      at: run.startedAt,
      credits: run.credits,
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
      text: runText(run),
      reasoning: run.reasoning,
      thinking: run.thinking,
      credits: run.credits,
    });
  }

  function appendReasoning(run, chunk) {
    if (!chunk) return;
    run.reasoning += chunk;
  }

  function publicTool(tool) {
    return { ...tool };
  }

  function updateImage(messageId, image) {
    let found = false;
    for (const conversation of history.conversations) {
      const message = conversation.messages.find((entry) => entry.id === messageId);
      if (!message) continue;
      message.image = { ...image };
      found = true;
    }
    if (!found) return;
    save();
    if (state.messages.some((entry) => entry.id === messageId)) {
      emit({ type: 'image', messageId, image: { ...image } });
    }
  }

  function startImage(messageId, prompt) {
    imagegen.generate(prompt).then(
      (result) => updateImage(messageId, { prompt, state: 'ready', file: result.file }),
      (error) => updateImage(messageId, {
        prompt,
        state: 'error',
        error: String((error && error.message) || error).slice(0, 80),
      })
    );
  }

  function finishRun(run, outcome = {}) {
    if (run.finished) return;
    run.finished = true;
    clearTimeout(run.hardTimer);
    clearTimeout(run.checkpointTimer);
    if (run.child) killProcessGroup(run.child);
    if (activeRun === run) activeRun = null;

    let text = runText(run).trim();
    let image = null;
    if (imagegen) {
      const match = text.match(IMAGE_MARK_RE);
      if (match) {
        const prompt = match[1].replace(/\s+/g, ' ').trim().slice(0, MAX_IMAGE_PROMPT);
        text = `${text.slice(0, match.index)}${text.slice(match.index + match[0].length)}`.trim();
        if (prompt) image = { prompt, state: 'pending' };
      }
    }
    const errorText = outcome.error ? String(outcome.error).slice(0, 4000) : '';
    const stopped = outcome.stopped === true;
    const durationMs = Number.isFinite(run.durationMs)
      ? run.durationMs
      : Date.now() - run.startedAt;
    const message = {
      id: run.messageId,
      role: 'assistant',
      text,
      tools: run.tools.map((tool) => ({
        ...tool,
        state: 'done',
      })),
      at: Date.now(),
      credits: Number.isFinite(run.credits) ? Number(run.credits.toFixed(4)) : 0,
      durationMs,
      model: run.modelLabel || state.model,
    };
    if (run.reasoning && run.reasoning.trim()) message.reasoning = run.reasoning.trim();
    if (image) message.image = image;
    if (stopped) message.interrupted = true;
    if (errorText) {
      message.error = true;
      message.errorText = errorText;
    }
    state.messages.push(message);
    save();

    if (errorText) {
      emit({ type: 'error', message, error: errorText, state: getState() });
    } else if (stopped) {
      emit({ type: 'stopped', message, state: getState() });
    } else {
      emit({ type: 'done', message, state: getState() });
    }

    if (image && !errorText && !stopped) startImage(run.messageId, image.prompt);
    if (!errorText) maybeAutoTitle(state);
  }

  function handleEvent(event, run) {
    if (run.finished || activeRun !== run) return;
    switch (event.type) {
      case 'system': {
        if (event.subtype !== 'init') return;
        if (typeof event.session_id === 'string' && event.session_id) {
          state.sessionId = event.session_id;
          save();
        }
        run.thinking = false;
        emit({
          type: 'run-meta',
          sessionId: state.sessionId,
          model: event.model || state.model,
          mode: event.permissionMode || state.mode,
        });
        break;
      }
      case 'stream_event': {
        const inner = event.event;
        if (!inner) return;
        if (inner.type === 'content_block_start') {
          if (inner.content_block?.type === 'thinking') {
            run.thinking = true;
            emit({ type: 'thinking', value: true });
          } else if (inner.content_block?.type === 'text') {
            run.thinking = false;
          }
        } else if (inner.type === 'content_block_delta') {
          const delta = inner.delta;
          if (delta?.type === 'text_delta' && typeof delta.text === 'string') {
            run.block += delta.text;
            run.thinking = false;
            emitDelta(run);
          } else if (delta?.type === 'thinking_delta' && typeof delta.thinking === 'string') {
            if (!run.thinking) {
              run.thinking = true;
              emit({ type: 'thinking', value: true });
            }
            appendReasoning(run, delta.thinking);
            emitDelta(run);
          }
        } else if (inner.type === 'content_block_stop') {
          if (run.thinking) {
            run.thinking = false;
            emit({ type: 'thinking', value: false });
          }
        } else if (inner.type === 'message_delta') {
          const credits = Number(inner.usage?.credits);
          if (Number.isFinite(credits)) {
            run.credits += credits;
            emit({ type: 'credits', credits: run.credits });
          }
        } else if (inner.type === 'message_stop') {
          if (run.thinking) {
            run.thinking = false;
            emit({ type: 'thinking', value: false });
          }
        }
        break;
      }
      case 'assistant': {
        const blocks = Array.isArray(event.message?.content) ? event.message.content : [];
        const textParts = blocks
          .filter((block) => block?.type === 'text' && typeof block.text === 'string')
          .map((block) => block.text);
        if (textParts.length) {
          const blockText = textParts.join('\n');
          if (blockText.trim()) run.finalText = appendText(run.finalText, blockText.trim());
          run.block = '';
        }
        for (const block of blocks) {
          if (block?.type !== 'tool_use') continue;
          const tool = {
            id: String(block.id || crypto.randomUUID()),
            name: String(block.name || 'Tool').slice(0, 80),
            summary: toolSummary(block.name, block.input),
            inputText: clip(safeJson(block.input ?? {}), MAX_TOOL_TEXT),
            result: '',
            isError: false,
            state: 'running',
          };
          run.tools.push(tool);
          run.toolById.set(tool.id, tool);
          emit({ type: 'tool', tool: publicTool(tool) });
        }
        run.thinking = false;
        emit({
          type: 'delta',
          text: runText(run),
          reasoning: run.reasoning,
          thinking: false,
          credits: run.credits,
        });
        break;
      }
      case 'user': {
        const blocks = Array.isArray(event.message?.content) ? event.message.content : [];
        for (const block of blocks) {
          if (block?.type !== 'tool_result') continue;
          const tool = run.toolById.get(block.tool_use_id);
          if (!tool) continue;
          tool.result = clip(toolContentText(block.content), MAX_TOOL_TEXT);
          tool.isError = block.is_error === true;
          tool.state = 'done';
          emit({
            type: 'tool-result',
            id: tool.id,
            result: tool.result,
            isError: tool.isError,
          });
        }
        break;
      }
      case 'result': {
        run.durationMs = Number.isFinite(event.duration_ms) ? event.duration_ms : undefined;
        const failed = event.is_error === true || (event.subtype && event.subtype !== 'success');
        if (run.stopRequested) {
          finishRun(run, { stopped: true });
        } else if (failed) {
          const detail = typeof event.result === 'string' && event.result.trim()
            ? event.result.trim()
            : run.stderr.trim() || 'Qoder run failed';
          if (!run.retried && run.usedResume && isResumeFailure(detail)) {
            retryRun(run);
          } else {
            finishRun(run, { error: detail });
          }
        } else {
          if (!run.finalText && !run.block && typeof event.result === 'string') {
            run.finalText = event.result;
          }
          finishRun(run);
        }
        break;
      }
    }
  }

  function launchRun(prompt, { retried = false, attachments = [] } = {}) {
    const qoder = findQoder();
    if (!qoder) return { ok: false, error: 'qoder-not-found' };
    if (!isDirectory(state.workspace)) state.workspace = DEFAULT_WORKSPACE;

    const newSession = !state.sessionId;
    const sessionId = state.sessionId || crypto.randomUUID();
    const args = [
      '-p', prompt,
      '--output-format', 'stream-json',
      '--include-partial-messages',
      '--model', state.model,
      '--permission-mode', state.mode,
    ];
    for (const file of attachments) {
      if (file && typeof file.path === 'string' && file.path) args.push('--attachment', file.path);
    }
    if (newSession) args.push('--session-id', sessionId);
    else args.push('--resume', sessionId);

    const run = {
      messageId: crypto.randomUUID(),
      child: null,
      kind: 'qoder',
      modelLabel: state.model,
      sessionId,
      prompt,
      attachments,
      retried,
      usedResume: !newSession,
      finalText: '',
      block: '',
      reasoning: '',
      tools: [],
      toolById: new Map(),
      credits: 0,
      thinking: false,
      stderr: '',
      spawnError: null,
      stopRequested: false,
      finished: false,
      startedAt: Date.now(),
      durationMs: null,
      streamBuffer: '',
      hardTimer: null,
    };
    activeRun = run;
    save({ touch: false });
    emit({ type: 'snapshot', state: getState() });

    let child;
    try {
      child = spawn(qoder, args, {
        cwd: state.workspace,
        env: { ...process.env, TERM: 'xterm-256color' },
        detached: true,
        stdio: ['ignore', 'pipe', 'pipe'],
      });
    } catch (error) {
      run.spawnError = error;
      setTimeout(() => finishRun(run, { error: String(error.message || error) }), 0);
      return { ok: false, error: 'spawn-failed' };
    }
    run.child = child;
    run.hardTimer = setTimeout(() => {
      if (run.finished) return;
      run.spawnError = 'timeout';
      killProcessGroup(child);
      setTimeout(() => finishRun(run, { error: 'qoder-timeout' }), 2200);
    }, RUN_LIMIT_MS);

    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');
    child.stdout.on('data', (chunk) => {
      if (run.finished) return;
      run.streamBuffer += chunk;
      if (run.streamBuffer.length > 8 * 1024 * 1024) {
        run.streamBuffer = run.streamBuffer.slice(-2 * 1024 * 1024);
      }
      let index;
      while ((index = run.streamBuffer.indexOf('\n')) >= 0) {
        const line = run.streamBuffer.slice(0, index).trim();
        run.streamBuffer = run.streamBuffer.slice(index + 1);
        if (!line) continue;
        let parsed;
        try { parsed = JSON.parse(line); } catch { continue; }
        handleEvent(parsed, run);
      }
    });
    child.stderr.on('data', (chunk) => {
      run.stderr = (run.stderr + chunk).slice(-8000);
    });
    child.on('error', (error) => {
      run.spawnError = error;
    });
    child.on('close', (code, signal) => {
      if (run.finished) return;
      if (run.stopRequested) {
        finishRun(run, { stopped: true });
      } else if (run.spawnError) {
        const detail = typeof run.spawnError === 'string'
          ? run.spawnError
          : String(run.spawnError.message || run.spawnError);
        finishRun(run, { error: detail });
      } else if (!run.retried && run.usedResume && isResumeFailure(run.stderr)) {
        retryRun(run);
      } else {
        const detail = run.stderr.trim() || `Qoder exited (${signal || code || 'unknown'})`;
        finishRun(run, { error: detail.slice(-2000) });
      }
    });

    return { ok: true };
  }

  // Qoder sessions are scoped to the directory they were created in, so a moved workspace or a
  // pruned session can make --resume fail. Start one fresh session instead of failing every turn.
  function retryRun(run) {
    if (run.finished) return;
    run.finished = true;
    clearTimeout(run.hardTimer);
    clearTimeout(run.checkpointTimer);
    if (run.child) killProcessGroup(run.child);
    if (activeRun === run) activeRun = null;
    state.sessionId = null;
    save();
    emit({ type: 'notice', code: 'session-reset' });
    launchRun(run.prompt, { retried: true, attachments: run.attachments || [] });
  }

  function runCustomTools(run, entry, history) {
    const conversation = history.map((message) => ({ role: message.role, content: message.content }));
    conversation.unshift({ role: 'system', content: toolSystemPrompt(state.workspace, state.mode) });
    let callCount = 0;

    const fail = (error) => {
      if (run.finished) return;
      if (run.stopRequested) {
        finishRun(run, { stopped: true });
        return;
      }
      if (run.timedOut) {
        finishRun(run, { error: 'custom-timeout' });
        return;
      }
      if (error && error.name === 'AbortError') {
        finishRun(run, { error: 'Request aborted' });
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
        const turn = await customStore.toolTurn(entry.id, conversation, {
          signal: run.controller.signal,
          tools: customTools.toolSpecs(),
          onDelta: (chunk) => {
            if (run.finished || activeRun !== run) return;
            if (!textStarted) {
              textStarted = true;
              if (run.block) run.block += '\n\n';
            }
            run.block += chunk;
            run.thinking = false;
            emitDelta(run);
          },
          onReasoning: (chunk) => {
            if (run.finished || activeRun !== run) return;
            if (!run.reasoning && !run.block && !run.thinking) {
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
          run.toolById.set(tool.id, tool);
          emit({ type: 'tool', tool: publicTool(tool) });

          let result;
          if (call.parseError) {
            result = { content: `Tool arguments were not valid JSON: ${call.parseError}`, isError: true };
          } else {
            result = await customTools.executeTool(name, input, {
              workspace: state.workspace,
              mode: state.mode,
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

  function launchCustomRun(entry, prompt) {
    const run = {
      messageId: crypto.randomUUID(),
      child: null,
      kind: 'custom',
      controller: new AbortController(),
      entry,
      modelLabel: entry.name,
      prompt,
      finalText: '',
      block: '',
      reasoning: '',
      tools: [],
      toolById: new Map(),
      credits: 0,
      thinking: false,
      stderr: '',
      spawnError: null,
      stopRequested: false,
      finished: false,
      timedOut: false,
      startedAt: Date.now(),
      durationMs: null,
      hardTimer: null,
    };
    activeRun = run;
    save({ touch: false });
    emit({ type: 'snapshot', state: getState() });

    const history = customStore
      ? customStore.buildHistory(state.messages)
      : state.messages.map((message) => ({ role: message.role, content: message.text }));
    if (imagegen) history.unshift({ role: 'system', content: IMAGE_GUIDE });

    run.hardTimer = setTimeout(() => {
      if (run.finished) return;
      run.timedOut = true;
      try { run.controller.abort(); } catch {}
      setTimeout(() => {
        if (!run.finished) finishRun(run, { error: 'custom-timeout' });
      }, 900);
    }, RUN_LIMIT_MS);

    if (entry.tools === true) {
      runCustomTools(run, entry, history);
      return { ok: true };
    }

    customStore.stream(entry.id, history, {
      signal: run.controller.signal,
      onDelta: (chunk) => {
        if (run.finished || activeRun !== run) return;
        run.block += chunk;
        run.thinking = false;
        emitDelta(run);
      },
      onReasoning: (chunk) => {
        if (run.finished || activeRun !== run) return;
        if (!run.reasoning && !run.block && !run.thinking) {
          run.thinking = true;
          emit({ type: 'thinking', value: true });
        }
        appendReasoning(run, chunk);
        emitDelta(run);
      },
    }).then((reply) => {
      if (run.finished) return;
      if (!run.finalText && !run.block && typeof reply === 'string') run.finalText = reply;
      finishRun(run);
    }).catch((error) => {
      if (run.finished) return;
      if (run.stopRequested) {
        finishRun(run, { stopped: true });
        return;
      }
      if (run.timedOut) {
        finishRun(run, { error: 'custom-timeout' });
        return;
      }
      if (error && error.name === 'AbortError') {
        finishRun(run, { error: 'Request aborted' });
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

    const custom = resolveCustom(state.model);
    if (isCustomModel(state.model) && !custom) return { ok: false, error: 'invalid-model' };
    if (!custom && !findQoder()) return { ok: false, error: 'qoder-not-found' };

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
    if (!state.title) {
      state.title = cleanTitle(prompt || fileNames(message));
      state.titleSource = 'default';
    }
    state.inputDraft = '';
    for (const file of files) staged.delete(file.id);
    save();

    if (custom) return launchCustomRun(custom, message.text);
    return launchRun(qoderPrompt(message), { attachments: message.files });
  }

  async function interject(text, attachmentIds) {
    const prompt = String(text == null ? '' : text).trim();
    const resolved = resolveStaged(attachmentIds);
    if (resolved.error) return { ok: false, error: resolved.error };
    if (!prompt && !resolved.files.length) return { ok: false, error: 'empty' };
    if (prompt.length > MAX_PROMPT) return { ok: false, error: 'too-long' };
    const run = activeRun;
    if (!run || run.finished) return send(prompt, attachmentIds);
    const conversationId = state.id;
    const closed = run.child && run.child.exitCode === null && !run.child.signalCode
      ? new Promise((resolve) => {
        const timer = setTimeout(resolve, 2000);
        run.child.once('close', () => {
          clearTimeout(timer);
          resolve();
        });
      })
      : Promise.resolve();
    interruptActiveRun();
    await closed;
    if (state.id !== conversationId) return { ok: false, error: 'conversation-not-found' };
    return send(prompt, attachmentIds);
  }

  function stop() {
    const run = activeRun;
    if (!run || run.finished) return { ok: false, error: 'idle' };
    run.stopRequested = true;
    emit({ type: 'run-status', status: 'stopping' });
    if (run.controller) {
      try { run.controller.abort(); } catch {}
      setTimeout(() => {
        if (activeRun === run && !run.finished) finishRun(run, { stopped: true });
      }, 600);
      return { ok: true };
    }
    if (run.child) killProcessGroup(run.child);
    setTimeout(() => {
      if (activeRun === run && !run.finished) finishRun(run, { stopped: true });
    }, 3200);
    return { ok: true };
  }

  function interruptActiveRun() {
    const run = activeRun;
    if (!run || run.finished) return;
    run.stopRequested = true;
    if (run.controller) {
      try { run.controller.abort(); } catch {}
    }
    finishRun(run, { stopped: true });
  }

  function newChat() {
    interruptActiveRun();
    clearStaged();
    if (!state.messages.length && !state.inputDraft && !state.sessionId) {
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
    const user = conversation.messages
      .find((message) => message.role === 'user' && (message.text.trim() || (message.files || []).length));
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
    const prompt = titlePrompt(user.text.trim() || `Files: ${fileNames(user)}`, assistant ? assistant.text : '');
    const custom = resolveCustom(conversation.model);
    if (custom) {
      if (!customStore) return Promise.resolve('');
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), TITLE_TIMEOUT_MS);
      return customStore.stream(
        { ...custom, effort: '' },
        [{ role: 'user', content: prompt }],
        { signal: controller.signal, maxTokens: 1024 }
      ).then((reply) => tidyTitle(reply || '')).catch(() => '').finally(() => clearTimeout(timer));
    }
    if (isCustomModel(conversation.model)) return Promise.resolve('');
    return requestQoderTitle(conversation.model, prompt, conversation.workspace);
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
    if (!value) return { ok: false, error: 'invalid-model' };
    if (isCustomModel(value) && !resolveCustom(value)) {
      return { ok: false, error: 'invalid-model' };
    }
    state.model = value;
    save();
    emitSnapshot();
    return { ok: true, state: getState() };
  }

  function setMode(mode) {
    if (activeRun && !activeRun.finished) return { ok: false, error: 'busy' };
    if (!MODES.some((entry) => entry.key === mode)) return { ok: false, error: 'invalid-mode' };
    state.mode = mode;
    save();
    emitSnapshot();
    return { ok: true, state: getState() };
  }

  function setWorkspace(workspace) {
    if (activeRun && !activeRun.finished) return { ok: false, error: 'busy' };
    const dir = path.resolve(String(workspace || ''));
    if (!isDirectory(dir)) return { ok: false, error: 'invalid-workspace' };
    if (dir === state.workspace) return { ok: true, state: getState() };
    clearStaged();
    if (state.messages.length || state.inputDraft || state.sessionId) {
      state = createConversation({ ...state, workspace: dir });
      history.conversations.push(state);
    } else {
      state.workspace = dir;
    }
    save();
    emitSnapshot();
    return { ok: true, state: getState() };
  }

  function refreshModels() {
    if (modelsRefreshing) return modelsRefreshing;
    if (Date.now() - modelsFetchedAt < MODELS_TTL_MS) return Promise.resolve(models);
    modelsRefreshing = new Promise((resolve) => {
      const qoder = findQoder();
      if (!qoder) {
        modelsRefreshing = null;
        return resolve(models);
      }
      let child;
      try {
        child = spawn(qoder, ['--list-models'], {
          cwd: DEFAULT_WORKSPACE,
          env: { ...process.env, TERM: 'xterm-256color' },
          detached: true,
          stdio: ['ignore', 'pipe', 'pipe'],
        });
      } catch {
        modelsRefreshing = null;
        return resolve(models);
      }
      modelsChild = child;
      let output = '';
      let done = false;
      const finish = () => {
        if (done) return;
        done = true;
        clearTimeout(timer);
        modelsChild = null;
        modelsRefreshing = null;
        killProcessGroup(child);
        const lines = output.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
        const header = lines.findIndex((line) => /^MODEL$/i.test(line));
        const names = (header >= 0 ? lines.slice(header + 1) : [])
          .filter((line) => line.length <= 48 && /^[A-Za-z0-9][A-Za-z0-9 ._+\-]*$/.test(line))
          .filter((line) => !/^error/i.test(line));
        const unique = [...new Set(names)];
        if (unique.length) {
          models = unique;
          modelsFetchedAt = Date.now();
          writeJsonAtomic(modelsFile, { models, fetchedAt: modelsFetchedAt });
          emit({ type: 'models', models, modelEntries: modelEntries() });
        }
        resolve(models);
      };
      const timer = setTimeout(finish, 20000);
      child.stdout.setEncoding('utf8');
      child.stderr.setEncoding('utf8');
      child.stdout.on('data', (chunk) => { output += chunk; });
      child.stderr.on('data', (chunk) => { output += chunk; });
      child.on('error', finish);
      child.on('close', finish);
    });
    return modelsRefreshing;
  }

  function refreshCustomModels() {
    if (isCustomModel(state.model) && !resolveCustom(state.model)) {
      state.model = DEFAULT_MODEL;
      save();
    }
    emitSnapshot();
    return { ok: true, state: getState() };
  }

  function dispose() {
    shuttingDown = true;
    clearStaged();
    if (modelsChild) {
      killProcessGroup(modelsChild);
      modelsChild = null;
    }
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
    refreshModels,
    refreshCustomModels,
    dispose,
  };
}

module.exports = {
  createQoderChat,
  findQoder,
  MODES,
  FALLBACK_MODELS,
};
