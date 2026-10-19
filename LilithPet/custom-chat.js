'use strict';

const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');
const customTools = require('./custom-tools');

const MAX_MESSAGES = 140;
const MAX_PROMPT = 20000;
const MAX_REASONING = 30000;
const MAX_TOOL_TEXT = 4000;
const MAX_TOOL_ROUNDS = 12;
const MAX_TOOL_CALLS = 32;
const RUN_LIMIT_MS = 30 * 60 * 1000;
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

function writeJsonAtomic(file, value) {
  try {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    const tmp = `${file}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(value, null, 2));
    fs.renameSync(tmp, file);
  } catch {}
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

function loadState(file) {
  let parsed = null;
  try { parsed = JSON.parse(fs.readFileSync(file, 'utf8')); } catch {}
  return {
    model: typeof parsed?.model === 'string' ? parsed.model.slice(0, 120) : '',
    mode: MODES.some((mode) => mode.key === parsed?.mode) ? parsed.mode : DEFAULT_MODE,
    workspace: isDirectory(parsed?.workspace) ? path.resolve(parsed.workspace) : DEFAULT_WORKSPACE,
    messages: normalizeMessages(parsed?.messages),
    updatedAt: Number.isFinite(parsed?.updatedAt) ? parsed.updatedAt : 0,
  };
}

function createCustomChat({ stateFile, customStore, onEvent }) {
  const state = loadState(stateFile);
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
    if (resolveCustom(state.model)) return false;
    const entries = customList();
    state.model = entries.length ? `custom:${entries[0].id}` : '';
    return true;
  }

  function save() {
    state.updatedAt = Date.now();
    state.messages = state.messages.slice(-MAX_MESSAGES);
    writeJsonAtomic(stateFile, {
      version: 1,
      model: state.model,
      mode: state.mode,
      workspace: state.workspace,
      messages: state.messages,
      updatedAt: state.updatedAt,
    });
  }

  function getState() {
    if (ensureModel()) save();
    const selected = resolveCustom(state.model);
    return {
      model: state.model,
      modelKind: selected ? 'custom' : null,
      modelLabel: selected ? selected.name : '',
      modelEntries: modelEntries(),
      mode: state.mode,
      workspace: state.workspace,
      modes: MODES.map(({ key, label, hint }) => ({ key, label, hint })),
      tools: !!selected && selected.tools === true,
      messages: state.messages.map((message) => ({
        ...message,
        tools: (message.tools || []).map((tool) => ({ ...tool })),
      })),
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
    if (run.reasoning.length >= MAX_REASONING) return;
    run.reasoning += chunk;
    if (run.reasoning.length > MAX_REASONING) run.reasoning = run.reasoning.slice(0, MAX_REASONING);
  }

  function finishRun(run, outcome = {}) {
    if (run.finished) return;
    run.finished = true;
    clearTimeout(run.hardTimer);
    if (activeRun === run) activeRun = null;

    const text = run.text.trim();
    const errorText = outcome.error ? String(outcome.error).slice(0, 4000) : '';
    const stopped = outcome.stopped === true;
    const durationMs = Date.now() - run.startedAt;
    const message = {
      id: crypto.randomUUID(),
      role: 'assistant',
      text,
      tools: run.tools.map((tool) => ({ ...tool, state: 'done' })),
      at: Date.now(),
      durationMs,
      model: run.modelLabel,
    };
    if (run.reasoning && run.reasoning.trim()) {
      message.reasoning = run.reasoning.trim().slice(0, MAX_REASONING);
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
  }

  function runCustomTools(run, entry, history) {
    const conversation = history.map((message) => ({ role: message.role, content: message.content }));
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
        const turn = await customStore.toolTurn(entry.id, conversation, {
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
      text: '',
      reasoning: '',
      thinking: false,
      tools: [],
      stopRequested: false,
      finished: false,
      timedOut: false,
      startedAt: Date.now(),
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
        if (!run.finished) finishRun(run, { error: 'timeout' });
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

  function send(text) {
    if (activeRun && !activeRun.finished) return { ok: false, error: 'busy' };
    const prompt = String(text == null ? '' : text).trim();
    if (!prompt) return { ok: false, error: 'empty' };
    if (prompt.length > MAX_PROMPT) return { ok: false, error: 'too-long' };

    if (ensureModel()) save();
    const entry = resolveCustom(state.model);
    if (!entry) return { ok: false, error: 'no-model' };

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

    return launchRun(entry, message.text);
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

  function newChat() {
    const run = activeRun;
    if (run) {
      run.finished = true;
      clearTimeout(run.hardTimer);
      try { run.controller.abort(); } catch {}
      activeRun = null;
    }
    state.messages = [];
    save();
    emitSnapshot();
    return { ok: true, state: getState() };
  }

  function setModel(model) {
    if (activeRun && !activeRun.finished) return { ok: false, error: 'busy' };
    const value = String(model == null ? '' : model).trim().slice(0, 120);
    if (!value || (value.startsWith('custom:') && !resolveCustom(value))) {
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
    state.workspace = value;
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
    if (activeRun) {
      activeRun.finished = true;
      clearTimeout(activeRun.hardTimer);
      try { activeRun.controller.abort(); } catch {}
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
    refreshCustomModels,
    dispose,
  };
}

module.exports = { createCustomChat };
