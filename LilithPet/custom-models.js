'use strict';

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const TYPE_OPENAI = 'openai';
const TYPE_ANTHROPIC = 'anthropic';
const TYPE_REASONING = 'reasoning';
const TYPES = new Set([TYPE_OPENAI, TYPE_ANTHROPIC, TYPE_REASONING]);
const EFFORTS = new Set(['low', 'medium', 'high']);
const MAX_URL = 600;
const MAX_KEY = 500;
const MAX_NAME = 80;
const MAX_MODEL_ID = 160;
const TEST_TIMEOUT_MS = 30000;
const HISTORY_LIMIT = 40;
const HISTORY_CHARS = 60000;

function text(value, max) {
  return String(value == null ? '' : value).trim().slice(0, max);
}

function normalizeType(value) {
  return TYPES.has(value) ? value : TYPE_OPENAI;
}

function normalizeEffort(value, type) {
  if (type !== TYPE_REASONING) return '';
  return EFFORTS.has(value) ? value : 'medium';
}

function normalizeBaseUrl(value, type = TYPE_OPENAI) {
  let url = text(value, MAX_URL).replace(/\/+$/, '');
  if (type === TYPE_ANTHROPIC) {
    url = url.replace(/\/(?:v1\/)?messages$/i, '');
  } else if (type === TYPE_REASONING) {
    url = url.replace(/\/(?:v1\/)?responses$/i, '');
  } else {
    url = url.replace(/\/chat\/completions$/i, '');
  }
  return url;
}

function validBaseUrl(url) {
  return /^https?:\/\/[^\s]+$/i.test(url);
}

function endpointUrl(baseUrl, type) {
  const base = normalizeBaseUrl(baseUrl, type);
  if (type === TYPE_ANTHROPIC) {
    return base.toLowerCase().endsWith('/v1') ? `${base}/messages` : `${base}/v1/messages`;
  }
  if (type === TYPE_REASONING) {
    return base.toLowerCase().endsWith('/v1') ? `${base}/responses` : `${base}/v1/responses`;
  }
  return `${base}/chat/completions`;
}

function readJson(file) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return null;
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

function makeEntry(input, base = {}) {
  const source = input && typeof input === 'object' ? input : {};
  const type = normalizeType(source.type != null ? source.type : base.type);
  const modelId = text(source.model != null ? source.model : base.model, MAX_MODEL_ID);
  const baseUrl = normalizeBaseUrl(source.baseUrl != null ? source.baseUrl : base.baseUrl, type);
  const name = text(source.name != null ? source.name : base.name, MAX_NAME) || modelId;
  const effort = normalizeEffort(source.effort != null ? source.effort : base.effort, type);
  let apiKey = typeof source.apiKey === 'string'
    ? source.apiKey.trim().slice(0, MAX_KEY)
    : (typeof base.apiKey === 'string' ? base.apiKey : '');
  if (!validBaseUrl(baseUrl)) return { error: 'invalid-base-url' };
  if (!modelId) return { error: 'missing-model' };
  return {
    entry: {
      id: typeof base.id === 'string' && base.id ? base.id : crypto.randomUUID(),
      type,
      name,
      baseUrl,
      apiKey,
      model: modelId,
      effort,
      legacy: base.legacy === true,
      createdAt: Number.isFinite(base.createdAt) ? base.createdAt : Date.now(),
      updatedAt: Date.now(),
    },
  };
}

function readLegacyConfig(file) {
  const data = readJson(file);
  if (!data || typeof data !== 'object') return null;
  const baseUrl = normalizeBaseUrl(data.baseUrl);
  const model = text(data.model, MAX_MODEL_ID);
  if (!validBaseUrl(baseUrl) || !model) return null;
  return {
    type: TYPE_OPENAI,
    baseUrl,
    model,
    apiKey: text(data.apiKey, MAX_KEY),
    name: model,
    legacy: true,
  };
}

function listPublic(entry) {
  return {
    id: entry.id,
    type: entry.type,
    name: entry.name,
    baseUrl: entry.baseUrl,
    model: entry.model,
    effort: entry.effort,
    hasKey: !!entry.apiKey,
    legacy: entry.legacy === true,
    createdAt: entry.createdAt,
    updatedAt: entry.updatedAt,
  };
}

function extractContent(value) {
  if (typeof value === 'string') return value;
  if (Array.isArray(value)) {
    return value.map((part) => {
      if (typeof part === 'string') return part;
      if (part && typeof part === 'object') {
        if (typeof part.text === 'string') return part.text;
        if (typeof part.content === 'string') return part.content;
      }
      return '';
    }).join('');
  }
  return '';
}

function extractReasoning(value) {
  if (typeof value === 'string') return value;
  if (Array.isArray(value)) {
    return value.map((part) => {
      if (typeof part === 'string') return part;
      if (!part || typeof part !== 'object') return '';
      if (typeof part.text === 'string') return part.text;
      if (typeof part.summary === 'string') return part.summary;
      return '';
    }).join('');
  }
  return '';
}

function openAIReasoning(value) {
  if (!value || typeof value !== 'object') return '';
  let out = '';
  if (typeof value.reasoning_content === 'string') out += value.reasoning_content;
  if (typeof value.reasoning === 'string') out += value.reasoning;
  if (Array.isArray(value.reasoning_details)) {
    out += value.reasoning_details.map((detail) => {
      if (!detail || typeof detail !== 'object') return '';
      return extractReasoning(detail.text || detail.summary || '');
    }).join('');
  }
  return out;
}

function openAIMessage(data) {
  const choice = data && Array.isArray(data.choices) ? data.choices[0] : null;
  if (!choice) return { text: '', reasoning: '' };
  const source = choice.message || choice.delta || {};
  const content = source.content != null ? source.content : (choice.text != null ? choice.text : '');
  return {
    text: extractContent(content),
    reasoning: openAIReasoning(source),
  };
}

function anthropicPayload(messages) {
  const system = [];
  const conversation = [];
  for (const message of Array.isArray(messages) ? messages : []) {
    if (!message || typeof message.role !== 'string') continue;
    const content = extractContent(message.content);
    if (!content) continue;
    if (message.role === 'system') {
      system.push(content);
      continue;
    }
    if (message.role !== 'user' && message.role !== 'assistant') continue;
    const last = conversation[conversation.length - 1];
    if (last && last.role === message.role) last.content += `\n\n${content}`;
    else conversation.push({ role: message.role, content });
  }
  if (!conversation.length) conversation.push({ role: 'user', content: '(continue)' });
  return { system: system.join('\n\n'), messages: conversation };
}

function anthropicMessage(data) {
  let content = '';
  let reasoning = '';
  const blocks = data && Array.isArray(data.content) ? data.content : [];
  for (const block of blocks) {
    if (!block || typeof block !== 'object') continue;
    if (block.type === 'text' && typeof block.text === 'string') content += block.text;
    else if (block.type === 'thinking' && typeof block.thinking === 'string') reasoning += block.thinking;
  }
  return { text: content, reasoning };
}

function responsesMessage(data) {
  let content = typeof data?.output_text === 'string' ? data.output_text : '';
  let reasoning = '';
  const items = data && Array.isArray(data.output) ? data.output : [];
  for (const item of items) {
    if (!item || typeof item !== 'object') continue;
    if (item.type === 'reasoning') {
      reasoning += extractReasoning(item.summary || item.content || '');
    } else if (item.type === 'message' && !content) {
      const blocks = Array.isArray(item.content) ? item.content : [];
      for (const block of blocks) {
        if (block && (block.type === 'output_text' || block.type === 'text') && typeof block.text === 'string') {
          content += block.text;
        }
      }
    }
  }
  return { text: content, reasoning };
}

function responseBody(entry, messages, stream, maxTokens) {
  if (entry.type === TYPE_ANTHROPIC) {
    const payload = anthropicPayload(messages);
    const body = {
      model: entry.model,
      messages: payload.messages,
      max_tokens: Number.isFinite(maxTokens) && maxTokens > 0 ? maxTokens : 4096,
      stream: !!stream,
    };
    if (payload.system) body.system = payload.system;
    return body;
  }
  if (entry.type === TYPE_REASONING) {
    const body = {
      model: entry.model,
      input: (Array.isArray(messages) ? messages : [])
        .filter((message) => message && (message.role === 'user' || message.role === 'assistant'))
        .map((message) => ({ role: message.role, content: extractContent(message.content) })),
      stream: !!stream,
    };
    if (Number.isFinite(maxTokens) && maxTokens > 0) body.max_output_tokens = maxTokens;
    if (entry.effort) body.reasoning = { effort: entry.effort };
    return body;
  }
  const body = {
    model: entry.model,
    messages,
    stream: !!stream,
  };
  if (Number.isFinite(maxTokens) && maxTokens > 0) body.max_tokens = maxTokens;
  return body;
}

function requestHeaders(entry, stream) {
  const headers = {
    'Content-Type': 'application/json',
    Accept: stream ? 'text/event-stream' : 'application/json',
  };
  if (entry.type === TYPE_ANTHROPIC) {
    headers['anthropic-version'] = '2023-06-01';
    if (entry.apiKey) headers['x-api-key'] = entry.apiKey;
  } else if (entry.apiKey) {
    headers.Authorization = `Bearer ${entry.apiKey}`;
  }
  return headers;
}

function apiErrorText(data) {
  if (!data || typeof data !== 'object') return '';
  const error = data.error;
  if (error && typeof error === 'object') {
    return String(error.message || error.code || error.type || '').slice(0, 500);
  }
  if (typeof error === 'string') return error.slice(0, 500);
  if (data.type === 'error') return String(data.message || 'stream error').slice(0, 500);
  return '';
}

function abortError() {
  const error = new Error('Aborted');
  error.name = 'AbortError';
  return error;
}

async function requestCompletion(entry, messages, options = {}) {
  const { stream = false, maxTokens = null, timeoutMs = 0, onDelta, onReasoning } = options;
  const externalSignal = options.signal || null;
  const controller = new AbortController();
  let timedOut = false;
  let timer = null;

  const forwardAbort = () => controller.abort();
  if (externalSignal) {
    if (externalSignal.aborted) controller.abort();
    else externalSignal.addEventListener('abort', forwardAbort, { once: true });
  }
  if (timeoutMs > 0) {
    timer = setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, timeoutMs);
  }

  const cleanup = () => {
    if (timer) clearTimeout(timer);
    if (externalSignal) externalSignal.removeEventListener('abort', forwardAbort);
  };

  const wrapError = (error) => {
    if (timedOut) return new Error(`请求超时（${Math.round(timeoutMs / 1000)} 秒）`);
    if (externalSignal && externalSignal.aborted) return abortError();
    if (error && error.name === 'AbortError') return abortError();
    return error;
  };

  const type = normalizeType(entry.type);
  const body = responseBody(entry, messages, stream, maxTokens);

  let response;
  try {
    response = await fetch(endpointUrl(entry.baseUrl, type), {
      method: 'POST',
      headers: requestHeaders(entry, stream),
      body: JSON.stringify(body),
      signal: controller.signal,
    });
  } catch (error) {
    cleanup();
    throw wrapError(error);
  }

  if (!response.ok) {
    let detail = '';
    try { detail = await response.text(); } catch {}
    cleanup();
    let message = detail;
    try {
      const parsed = JSON.parse(detail);
      message = apiErrorText(parsed) || detail;
    } catch {}
    const snippet = String(message || '').replace(/\s+/g, ' ').slice(0, 320);
    throw new Error(`HTTP ${response.status}${snippet ? `: ${snippet}` : ''}`);
  }

  const contentType = String(response.headers.get('content-type') || '');
  if (!stream || !contentType.includes('text/event-stream') || !response.body) {
    let data;
    try {
      data = await response.json();
    } catch (error) {
      cleanup();
      throw wrapError(error);
    }
    cleanup();
    const errorText = apiErrorText(data);
    if (errorText) throw new Error(errorText);
    const result = type === TYPE_ANTHROPIC
      ? anthropicMessage(data)
      : (type === TYPE_REASONING ? responsesMessage(data) : openAIMessage(data));
    if (result.reasoning && onReasoning) onReasoning(result.reasoning);
    return result.text;
  }

  let full = '';
  let reasoning = '';
  let buffer = '';
  let finished = false;
  const decoder = new TextDecoder();
  const reader = response.body.getReader();

  const emitText = (chunk) => {
    if (!chunk) return;
    full += chunk;
    if (onDelta) onDelta(chunk);
  };
  const emitReasoning = (chunk) => {
    if (!chunk) return;
    reasoning += chunk;
    if (onReasoning) onReasoning(chunk);
  };

  const handlePayload = (payload) => {
    if (!payload || payload === '[DONE]' || finished) return;
    let event;
    try {
      event = JSON.parse(payload);
    } catch {
      return;
    }
    const errorText = apiErrorText(event);
    if (errorText) throw new Error(errorText);

    if (type === TYPE_ANTHROPIC) {
      if (event.type === 'content_block_start') {
        const block = event.content_block || {};
        if (block.type === 'text' && typeof block.text === 'string') emitText(block.text);
      } else if (event.type === 'content_block_delta') {
        const delta = event.delta || {};
        if (delta.type === 'text_delta' && typeof delta.text === 'string') emitText(delta.text);
        else if (delta.type === 'thinking_delta' && typeof delta.thinking === 'string') emitReasoning(delta.thinking);
      } else if (event.type === 'message_stop') {
        finished = true;
      }
      return;
    }

    if (type === TYPE_REASONING) {
      if (event.type === 'response.output_text.delta' && typeof event.delta === 'string') {
        emitText(event.delta);
      } else if (event.type === 'response.reasoning_summary_text.delta'
        || event.type === 'response.reasoning_text.delta') {
        if (typeof event.delta === 'string') emitReasoning(event.delta);
      } else if (event.type === 'response.completed' || event.type === 'response.incomplete') {
        finished = true;
      } else if (event.type === 'response.failed' || event.type === 'response.error') {
        throw new Error(apiErrorText(event.response) || 'response failed');
      }
      return;
    }

    const choice = Array.isArray(event.choices) ? event.choices[0] : null;
    if (!choice) return;
    const delta = choice.delta || {};
    emitReasoning(openAIReasoning(delta));
    if (delta.content != null) emitText(extractContent(delta.content));
    else if (choice.message && choice.message.content != null) emitText(extractContent(choice.message.content));
    if (choice.finish_reason) finished = true;
  };

  const handleLine = (rawLine) => {
    const line = rawLine.replace(/\r$/, '');
    if (!line || line.startsWith(':')) return;
    if (!line.startsWith('data:')) return;
    const payload = line.slice(5).trim();
    if (!payload) return;
    if (payload === '[DONE]') {
      finished = true;
      return;
    }
    handlePayload(payload);
  };

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      let newline;
      while ((newline = buffer.indexOf('\n')) >= 0) {
        const line = buffer.slice(0, newline);
        buffer = buffer.slice(newline + 1);
        handleLine(line);
      }
    }
    buffer += decoder.decode();
    if (buffer.trim()) handleLine(buffer);
  } catch (error) {
    try { await reader.cancel(); } catch {}
    cleanup();
    throw wrapError(error);
  }
  cleanup();
  return full;
}

function buildHistory(messages) {
  const source = Array.isArray(messages) ? messages : [];
  const picked = [];
  let chars = 0;
  for (let index = source.length - 1; index >= 0 && picked.length < HISTORY_LIMIT; index--) {
    const message = source[index];
    if (!message || (message.role !== 'user' && message.role !== 'assistant')) continue;
    if (message.error === true) continue;
    const content = typeof message.text === 'string' ? message.text.trim() : '';
    if (!content) continue;
    if (chars + content.length > HISTORY_CHARS) break;
    chars += content.length;
    picked.unshift({ role: message.role, content });
  }
  return picked;
}

function createCustomModelStore({ file, legacyFile, onChanged }) {
  let data = null;

  function persist() {
    writeJsonAtomic(file, { version: 1, models: data.models });
  }

  function changed() {
    persist();
    if (typeof onChanged === 'function') {
      try { onChanged(); } catch {}
    }
  }

  function load() {
    if (data) return data;
    if (fs.existsSync(file)) {
      const parsed = readJson(file);
      const models = [];
      const source = parsed && Array.isArray(parsed.models) ? parsed.models : [];
      for (const item of source) {
        if (!item || typeof item !== 'object') continue;
        const result = makeEntry(item, {
          id: typeof item.id === 'string' ? item.id : undefined,
          legacy: item.legacy === true,
          createdAt: Number(item.createdAt),
        });
        if (result.entry) {
          result.entry.apiKey = typeof item.apiKey === 'string' ? item.apiKey.slice(0, MAX_KEY) : '';
          result.entry.updatedAt = Number(item.updatedAt) || result.entry.updatedAt;
          models.push(result.entry);
        }
      }
      data = { version: 1, models };
      return data;
    }
    data = { version: 1, models: [] };
    const legacy = legacyFile ? readLegacyConfig(legacyFile) : null;
    if (legacy) {
      const result = makeEntry(legacy, { legacy: true });
      if (result.entry) data.models.push(result.entry);
    }
    persist();
    return data;
  }

  function list() {
    return load().models.map(listPublic);
  }

  function get(id) {
    const found = load().models.find((entry) => entry.id === id);
    return found ? { ...found } : null;
  }

  function find(ref) {
    if (typeof ref !== 'string' || !ref.startsWith('custom:')) return null;
    return get(ref.slice('custom:'.length));
  }

  function save(input) {
    const store = load();
    const source = input && typeof input === 'object' ? input : {};
    const existing = source.id ? store.models.find((entry) => entry.id === source.id) : null;
    const result = makeEntry(source, existing || {});
    if (result.error) return { ok: false, error: result.error };
    if (existing) Object.assign(existing, result.entry);
    else store.models.push(result.entry);
    changed();
    const entry = existing || result.entry;
    return { ok: true, model: listPublic(entry), models: list() };
  }

  function remove(id) {
    const store = load();
    const index = store.models.findIndex((entry) => entry.id === id);
    if (index < 0) return { ok: false, error: 'not-found' };
    store.models.splice(index, 1);
    changed();
    return { ok: true, models: list() };
  }

  async function test(input) {
    const store = load();
    const source = input && typeof input === 'object' ? input : {};
    const existing = source.id ? store.models.find((entry) => entry.id === source.id) : null;
    const result = makeEntry(source, existing || {});
    if (result.error) return { ok: false, error: result.error };
    const entry = result.entry.type === TYPE_REASONING
      ? { ...result.entry, effort: 'low' }
      : result.entry;
    const maxTokens = entry.type === TYPE_REASONING ? 2048 : (entry.type === TYPE_ANTHROPIC ? 64 : 16);
    const startedAt = Date.now();
    try {
      const reply = await requestCompletion(
        entry,
        [{ role: 'user', content: 'Reply with the single word OK.' }],
        { stream: false, maxTokens, timeoutMs: TEST_TIMEOUT_MS }
      );
      return {
        ok: true,
        reply: String(reply || '').trim().slice(0, 300),
        latencyMs: Date.now() - startedAt,
      };
    } catch (error) {
      return {
        ok: false,
        error: String((error && error.message) || error).slice(0, 600),
        latencyMs: Date.now() - startedAt,
      };
    }
  }

  async function stream(entry, messages, options = {}) {
    const target = typeof entry === 'string' ? get(entry) : entry;
    if (!target) throw new Error('model-not-found');
    return requestCompletion(target, messages, {
      stream: true,
      signal: options.signal,
      onDelta: options.onDelta,
      onReasoning: options.onReasoning,
    });
  }

  load();

  return {
    list,
    get,
    find,
    save,
    remove,
    test,
    stream,
    buildHistory,
  };
}

module.exports = {
  createCustomModelStore,
  buildHistory,
  normalizeBaseUrl,
  endpointUrl,
  TYPE_OPENAI,
  TYPE_ANTHROPIC,
  TYPE_REASONING,
};
