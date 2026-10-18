'use strict';

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const MAX_MESSAGES = 140;
const MAX_PROMPT = 20000;
const MAX_REASONING = 30000;
const RUN_LIMIT_MS = 30 * 60 * 1000;

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
      messages: state.messages.map((message) => ({ ...message })),
      busy: !!activeRun && !activeRun.finished,
      draft: activeRun && !activeRun.finished ? {
        text: activeRun.text,
        reasoning: activeRun.reasoning,
        thinking: activeRun.thinking,
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

  function launchRun(entry, prompt) {
    const run = {
      controller: new AbortController(),
      entry,
      modelLabel: entry.name,
      text: '',
      reasoning: '',
      thinking: false,
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
        if (!run.finished) finishRun(run, { error: '请求超时' });
      }, 900);
    }, RUN_LIMIT_MS);

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
        finishRun(run, { error: '请求超时' });
        return;
      }
      if (error && error.name === 'AbortError') {
        finishRun(run, { error: '请求已取消' });
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
    refreshCustomModels,
    dispose,
  };
}

module.exports = { createCustomChat };
