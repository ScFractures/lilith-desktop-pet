const { spawn } = require('child_process');
const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');

const QODER_HOME = path.join(os.homedir(), '.qoder-cn');
const DEFAULT_WORKSPACE = os.homedir();
const DEFAULT_MODEL = 'DeepSeek-Flash';
const DEFAULT_MODE = 'yolo';
const MAX_MESSAGES = 140;
const MAX_PROMPT = 20000;
const MAX_TOOL_TEXT = 4000;
const MAX_REASONING = 30000;
const RUN_LIMIT_MS = 60 * 60 * 1000;
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
    fs.writeFileSync(tmp, JSON.stringify(value, null, 2));
    fs.renameSync(tmp, file);
  } catch {}
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
    if (message.role === 'assistant') {
      if (Number.isFinite(message.credits)) entry.credits = message.credits;
      if (Number.isFinite(message.durationMs)) entry.durationMs = message.durationMs;
      if (typeof message.model === 'string') entry.model = message.model;
      if (typeof message.reasoning === 'string' && message.reasoning.trim()) {
        entry.reasoning = message.reasoning.slice(0, MAX_REASONING);
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

function runText(run) {
  return appendText(run.finalText, run.block);
}

function isResumeFailure(text) {
  return /invalid session identifier|no conversation found|cannot resume|session .*not found|unable to resume/i.test(String(text || ''));
}

function loadState(file) {
  let parsed = null;
  try { parsed = JSON.parse(fs.readFileSync(file, 'utf8')); } catch {}
  const model = typeof parsed?.model === 'string' && parsed.model.trim()
    ? parsed.model.trim().slice(0, 80)
    : DEFAULT_MODEL;
  return {
    sessionId: typeof parsed?.sessionId === 'string' && parsed.sessionId.length <= 80 ? parsed.sessionId : null,
    model,
    mode: MODES.some((mode) => mode.key === parsed?.mode) ? parsed.mode : DEFAULT_MODE,
    workspace: isDirectory(parsed?.workspace) ? path.resolve(parsed.workspace) : DEFAULT_WORKSPACE,
    messages: normalizeMessages(parsed?.messages),
    updatedAt: Number.isFinite(parsed?.updatedAt) ? parsed.updatedAt : 0,
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

function createQoderChat({ stateFile, modelsFile, customStore, onEvent }) {
  const state = loadState(stateFile);
  const cache = loadModelCache(modelsFile);
  let models = cache.models;
  let modelsFetchedAt = cache.fetchedAt;
  let modelsRefreshing = null;
  let modelsChild = null;
  let activeRun = null;
  let shuttingDown = false;

  const emit = (event) => {
    if (shuttingDown) return;
    try { onEvent(event); } catch {}
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
    }));
    return [...qoderEntries, ...customEntries];
  }

  function getState() {
    const selectedCustom = resolveCustom(state.model);
    if (isCustomModel(state.model) && !selectedCustom) {
      state.model = DEFAULT_MODEL;
    }
    return {
      sessionId: state.sessionId,
      model: state.model,
      modelKind: selectedCustom ? 'custom' : 'qoder',
      modelLabel: selectedCustom ? selectedCustom.name : state.model,
      mode: state.mode,
      workspace: state.workspace,
      messages: state.messages.map((message) => ({
        ...message,
        tools: message.tools.map((tool) => ({ ...tool })),
      })),
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
    };
  }

  function save() {
    state.updatedAt = Date.now();
    state.messages = state.messages.slice(-MAX_MESSAGES);
    writeJsonAtomic(stateFile, {
      version: 1,
      sessionId: state.sessionId,
      model: state.model,
      mode: state.mode,
      workspace: state.workspace,
      messages: state.messages,
      updatedAt: state.updatedAt,
    });
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
    if (run.reasoning.length >= MAX_REASONING) return;
    run.reasoning += chunk;
    if (run.reasoning.length > MAX_REASONING) run.reasoning = run.reasoning.slice(0, MAX_REASONING);
  }

  function publicTool(tool) {
    return { ...tool };
  }

  function finishRun(run, outcome = {}) {
    if (run.finished) return;
    run.finished = true;
    clearTimeout(run.hardTimer);
    if (run.child) killProcessGroup(run.child);
    if (activeRun === run) activeRun = null;

    const text = runText(run).trim();
    const errorText = outcome.error ? String(outcome.error).slice(0, 4000) : '';
    const stopped = outcome.stopped === true;
    const durationMs = Number.isFinite(run.durationMs)
      ? run.durationMs
      : Date.now() - run.startedAt;
    const message = {
      id: crypto.randomUUID(),
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
    if (run.reasoning && run.reasoning.trim()) message.reasoning = run.reasoning.trim().slice(0, MAX_REASONING);
    if (stopped) message.interrupted = true;
    if (errorText) {
      message.error = true;
      message.errorText = errorText;
    }
    state.messages.push(message);
    state.messages = state.messages.slice(-MAX_MESSAGES);
    save();

    if (errorText) {
      emit({ type: 'error', message, error: errorText, state: getState() });
    } else if (stopped) {
      emit({ type: 'stopped', message, state: getState() });
    } else {
      emit({ type: 'done', message, state: getState() });
    }
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

  function launchRun(prompt, { retried = false } = {}) {
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
    if (newSession) args.push('--session-id', sessionId);
    else args.push('--resume', sessionId);

    const run = {
      child: null,
      kind: 'qoder',
      modelLabel: state.model,
      sessionId,
      prompt,
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
    if (run.child) killProcessGroup(run.child);
    if (activeRun === run) activeRun = null;
    state.sessionId = null;
    save();
    emit({ type: 'notice', code: 'session-reset' });
    launchRun(run.prompt, { retried: true });
  }

  function launchCustomRun(entry, prompt) {
    const run = {
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
    emit({ type: 'snapshot', state: getState() });

    const history = customStore
      ? customStore.buildHistory(state.messages)
      : state.messages.map((message) => ({ role: message.role, content: message.text }));

    run.hardTimer = setTimeout(() => {
      if (run.finished) return;
      run.timedOut = true;
      try { run.controller.abort(); } catch {}
      setTimeout(() => {
        if (!run.finished) finishRun(run, { error: 'custom-timeout' });
      }, 900);
    }, RUN_LIMIT_MS);

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

  function send(text) {
    if (activeRun && !activeRun.finished) return { ok: false, error: 'busy' };
    const prompt = String(text == null ? '' : text).trim();
    if (!prompt) return { ok: false, error: 'empty' };
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
    state.messages.push(message);
    state.messages = state.messages.slice(-MAX_MESSAGES);
    save();

    if (custom) return launchCustomRun(custom, message.text);
    return launchRun(message.text);
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

  function newChat() {
    const run = activeRun;
    if (run) {
      run.finished = true;
      clearTimeout(run.hardTimer);
      if (run.controller) {
        try { run.controller.abort(); } catch {}
      }
      if (run.child) killProcessGroup(run.child);
      activeRun = null;
    }
    state.sessionId = null;
    state.messages = [];
    save();
    emitSnapshot();
    return { ok: true, state: getState() };
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
    state.workspace = dir;
    state.sessionId = null;
    state.messages = [];
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
    if (modelsChild) {
      killProcessGroup(modelsChild);
      modelsChild = null;
    }
    if (activeRun) {
      activeRun.finished = true;
      clearTimeout(activeRun.hardTimer);
      if (activeRun.controller) {
        try { activeRun.controller.abort(); } catch {}
      }
      if (activeRun.child) killProcessGroup(activeRun.child);
      activeRun = null;
    }
  }

  return {
    getState,
    send,
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
