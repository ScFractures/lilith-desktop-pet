'use strict';

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const TYPE_OPENAI = 'openai';
const TYPE_ANTHROPIC = 'anthropic';
const LEGACY_TYPE_REASONING = 'reasoning';
const API_CHAT = 'chat';
const API_RESPONSES = 'responses';
const APIS = new Set([API_CHAT, API_RESPONSES]);
const EFFORT_ORDER = ['none', 'minimal', 'low', 'medium', 'high', 'xhigh', 'max'];
const EFFORTS = new Set(EFFORT_ORDER);
const EFFORT_BUDGETS = { minimal: 512, low: 1024, medium: 2048, high: 4096, xhigh: 8192, max: 16384 };
const OPENAI_FALLBACK_EFFORTS = ['low', 'medium', 'high'];
const ANTHROPIC_BUDGET_EFFORTS = ['low', 'medium', 'high', 'xhigh', 'max'];
const ANTHROPIC_ADAPTIVE_EFFORTS = ['none', 'low', 'medium', 'high', 'xhigh', 'max'];
const THINKING_MODES = new Set(['effort', 'budget', 'none']);
const MAX_URL = 600;
const MAX_KEY = 500;
const MAX_NAME = 80;
const MAX_MODEL_ID = 160;
const TEST_TIMEOUT_MS = 30000;
const MODELS_TIMEOUT_MS = 20000;
const HISTORY_LIMIT = 40;
const HISTORY_CHARS = 60000;

function text(value, max) {
  return String(value == null ? '' : value).trim().slice(0, max);
}

function normalizeType(value) {
  return value === TYPE_ANTHROPIC ? TYPE_ANTHROPIC : TYPE_OPENAI;
}

function normalizeApi(value, type) {
  if (type !== TYPE_OPENAI) return '';
  return APIS.has(value) ? value : API_CHAT;
}

function normalizeEffort(value, legacyFallback) {
  if (EFFORTS.has(value)) return value;
  if (value === 'off' || value === '') return '';
  return legacyFallback ? 'medium' : '';
}

function effortEnabled(value) {
  return !!value && value !== 'none';
}

function testEffort(entry) {
  const allowed = Array.isArray(entry && entry.efforts) ? entry.efforts : [];
  for (const effort of ['low', 'medium', 'high', 'minimal', 'xhigh', 'max']) {
    if (!allowed.length || allowed.includes(effort)) return effort;
  }
  return 'low';
}

function sanitizeEfforts(value) {
  if (!Array.isArray(value)) return null;
  const found = new Set(value.filter((effort) => EFFORTS.has(effort)));
  return EFFORT_ORDER.filter((effort) => found.has(effort));
}

function normalizeThinking(value) {
  return THINKING_MODES.has(value) ? value : '';
}

function modelTail(id) {
  const value = text(id, MAX_MODEL_ID).toLowerCase();
  const slash = value.lastIndexOf('/');
  return slash >= 0 ? value.slice(slash + 1) : value;
}

function inferOpenAIEfforts(id) {
  const name = modelTail(id);
  if (!name) return null;
  if (/^o1-(?:mini|preview)(?:-|$)/.test(name)) return [];
  if (/^gpt-5(?:\.\d+)?-pro(?:-|$)/.test(name)) return ['high'];
  if (/codex-max/.test(name)) return ['none', 'low', 'medium', 'high', 'xhigh'];
  if (/^gpt-5\.1(?:-|$)/.test(name)) return ['none', 'minimal', 'low', 'medium', 'high'];
  if (/^gpt-5-codex(?:-|$)/.test(name)) return OPENAI_FALLBACK_EFFORTS;
  if (/^gpt-5(?:\.\d+)?(?:-|$)/.test(name)) return ['minimal', 'low', 'medium', 'high'];
  if (/^o[134](?:-|$)/.test(name)) return OPENAI_FALLBACK_EFFORTS;
  if (/(?:^|-)o[34](?:-|$)|o4-mini/.test(name)) return OPENAI_FALLBACK_EFFORTS;
  if (/^gpt-oss/.test(name)) return OPENAI_FALLBACK_EFFORTS;
  return null;
}

function inferAnthropicThinking(id) {
  const name = modelTail(id);
  if (!name) return { efforts: null, thinking: '' };
  const modern = /(?:^|-)claude-(?:opus-)?[5-9](?:[.-]|$)/.test(name)
    || /(?:^|-)claude-opus-4[.-][7-9](?:[.-]|$)/.test(name)
    || /(?:^|-)fable(?:[.-]|$)/.test(name)
    || /(?:^|-)mythos(?:[.-]|$)/.test(name);
  if (modern) return { efforts: ANTHROPIC_ADAPTIVE_EFFORTS, thinking: 'effort' };
  if (/claude-3[.-]7|claude-sonnet-4|claude-opus-4|claude-haiku-4/.test(name)) {
    return { efforts: ANTHROPIC_BUDGET_EFFORTS, thinking: 'budget' };
  }
  if (/claude-3(?:[.-]|$)|claude-3[.-]5|claude-instant|claude-2/.test(name)) {
    return { efforts: [], thinking: 'none' };
  }
  return { efforts: null, thinking: '' };
}

function thinkingCapability(raw) {
  if (!raw || typeof raw !== 'object') return null;
  for (const source of [raw.capabilities, raw.capability, raw.features]) {
    if (source && typeof source === 'object' && source.thinking != null) return source.thinking;
  }
  return raw.thinking && typeof raw.thinking === 'object' ? raw.thinking : null;
}

function readCapabilityThinking(raw) {
  const thinking = thinkingCapability(raw);
  if (thinking == null) return null;
  const tokens = new Set();
  const visit = (node) => {
    if (node == null) return;
    if (typeof node === 'string') {
      const token = node.trim().toLowerCase();
      if (EFFORTS.has(token)) tokens.add(token);
      return;
    }
    if (Array.isArray(node)) {
      for (const entry of node) visit(entry);
      return;
    }
    if (typeof node !== 'object') return;
    for (const [key, value] of Object.entries(node)) {
      const token = key.toLowerCase();
      if (EFFORTS.has(token)) tokens.add(token);
      visit(value);
    }
  };
  visit(thinking);
  let serialized = '';
  try { serialized = JSON.stringify(thinking).toLowerCase(); } catch {}
  const mode = /adaptive/.test(serialized)
    ? 'effort'
    : (/budget|enabled/.test(serialized) ? 'budget' : (/disabled/.test(serialized) ? 'none' : ''));
  return {
    mode,
    disabled: /disabled/.test(serialized),
    efforts: EFFORT_ORDER.filter((effort) => tokens.has(effort)),
  };
}

function describeModel(type, item) {
  const id = text(item && item.id, MAX_MODEL_ID);
  if (type === TYPE_ANTHROPIC) {
    const inferred = inferAnthropicThinking(id);
    const capabilities = readCapabilityThinking(item && item.raw);
    let thinking = (capabilities && capabilities.mode) || inferred.thinking;
    let efforts = inferred.efforts;
    if (capabilities && capabilities.efforts.length) efforts = capabilities.efforts;
    else if (thinking === 'effort' && efforts == null) efforts = ANTHROPIC_ADAPTIVE_EFFORTS;
    else if (thinking === 'budget' && efforts == null) efforts = ANTHROPIC_BUDGET_EFFORTS;
    if (thinking === 'effort' && Array.isArray(efforts)) {
      const supportsOff = capabilities ? capabilities.disabled : true;
      const levels = new Set(efforts);
      if (supportsOff) levels.add('none');
      else levels.delete('none');
      efforts = sanitizeEfforts([...levels]);
    }
    if (thinking === 'none') efforts = [];
    return {
      efforts,
      thinking,
      source: capabilities ? 'api' : (efforts === null ? 'unknown' : 'inferred'),
    };
  }
  const efforts = inferOpenAIEfforts(id);
  return {
    efforts,
    thinking: efforts === null ? '' : (efforts.length ? 'effort' : 'none'),
    source: efforts === null ? 'unknown' : 'inferred',
  };
}

function anthropicThinkingMode(entry) {
  const mode = normalizeThinking(entry && entry.thinking);
  if (mode) return mode;
  return inferAnthropicThinking(entry && entry.model).thinking || 'budget';
}

function isResponses(entry) {
  if (!entry) return false;
  if (entry.type === LEGACY_TYPE_REASONING) return true;
  return entry.type !== TYPE_ANTHROPIC && entry.api === API_RESPONSES;
}

function normalizeBaseUrl(value, type = TYPE_OPENAI, api = API_CHAT) {
  let url = text(value, MAX_URL).replace(/\/+$/, '');
  if (type === TYPE_ANTHROPIC) {
    url = url.replace(/\/(?:v1\/)?messages$/i, '');
  } else if (api === API_RESPONSES) {
    url = url.replace(/\/(?:v1\/)?responses$/i, '');
  } else {
    url = url.replace(/\/chat\/completions$/i, '');
  }
  return url;
}

function validBaseUrl(url) {
  return /^https?:\/\/[^\s]+$/i.test(url);
}

function endpointUrl(baseUrl, type, api = API_CHAT) {
  const base = normalizeBaseUrl(baseUrl, type, api);
  if (type === TYPE_ANTHROPIC) {
    return base.toLowerCase().endsWith('/v1') ? `${base}/messages` : `${base}/v1/messages`;
  }
  if (api === API_RESPONSES) {
    return base.toLowerCase().endsWith('/v1') ? `${base}/responses` : `${base}/v1/responses`;
  }
  return `${base}/chat/completions`;
}

function modelsUrl(baseUrl, type) {
  const base = normalizeBaseUrl(baseUrl, type, API_CHAT);
  if (type === TYPE_ANTHROPIC) {
    const root = base.toLowerCase().endsWith('/v1') ? base : `${base}/v1`;
    return `${root}/models?limit=1000`;
  }
  return `${base}/models`;
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

function makeEntry(input, base = {}, options = {}) {
  const source = input && typeof input === 'object' ? input : {};
  const typeSource = source.type != null ? source.type : base.type;
  const legacyReasoning = typeSource === LEGACY_TYPE_REASONING;
  const type = normalizeType(typeSource);
  const api = type === TYPE_OPENAI
    ? normalizeApi(source.api != null ? source.api : (legacyReasoning ? API_RESPONSES : base.api), type)
    : '';
  const modelId = text(source.model != null ? source.model : base.model, MAX_MODEL_ID);
  const baseUrl = normalizeBaseUrl(source.baseUrl != null ? source.baseUrl : base.baseUrl, type, api);
  const name = text(source.name != null ? source.name : base.name, MAX_NAME) || modelId;
  const effortSource = source.effort != null ? source.effort : base.effort;
  const effort = normalizeEffort(effortSource, legacyReasoning && effortSource == null);
  const sameModel = !!modelId && base.model === modelId;
  const inferred = describeModel(type, { id: modelId });
  const sourceEfforts = source.efforts !== undefined
    ? sanitizeEfforts(source.efforts)
    : (sameModel ? sanitizeEfforts(base.efforts) : null);
  const efforts = sourceEfforts !== null ? sourceEfforts : inferred.efforts;
  const thinking = normalizeThinking(source.thinking)
    || (sameModel ? normalizeThinking(base.thinking) : '')
    || inferred.thinking;
  const tools = source.tools !== undefined ? source.tools === true : base.tools === true;
  const typedKey = typeof source.apiKey === 'string' ? source.apiKey.trim().slice(0, MAX_KEY) : '';
  const apiKey = typedKey || (typeof base.apiKey === 'string' ? base.apiKey : '');
  if (!validBaseUrl(baseUrl)) return { error: 'invalid-base-url' };
  if (options.requireModel !== false && !modelId) return { error: 'missing-model' };
  return {
    entry: {
      id: typeof base.id === 'string' && base.id ? base.id : crypto.randomUUID(),
      type,
      api,
      name,
      baseUrl,
      apiKey,
      model: modelId,
      effort,
      efforts,
      thinking,
      tools,
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
    api: entry.api,
    name: entry.name,
    baseUrl: entry.baseUrl,
    model: entry.model,
    effort: entry.effort,
    efforts: Array.isArray(entry.efforts) ? entry.efforts.slice() : null,
    thinking: entry.thinking || '',
    tools: entry.tools === true,
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

function rawJson(value) {
  try { return JSON.stringify(value); } catch { return '{}'; }
}

function parseToolArguments(raw) {
  if (raw == null || raw === '') return { input: {}, rawArguments: '' };
  if (typeof raw === 'object') return { input: raw, rawArguments: rawJson(raw) };
  const source = String(raw);
  try {
    const parsed = JSON.parse(source);
    return { input: parsed && typeof parsed === 'object' ? parsed : {}, rawArguments: source };
  } catch (error) {
    return { input: {}, rawArguments: source, parseError: String((error && error.message) || error) };
  }
}

function toolDefinitions(type, api, tools) {
  const list = (Array.isArray(tools) ? tools : [])
    .filter((tool) => tool && typeof tool.name === 'string' && tool.name);
  if (!list.length) return [];
  const parameters = (tool) => (tool.parameters && typeof tool.parameters === 'object'
    ? tool.parameters
    : { type: 'object', properties: {} });
  if (type === TYPE_ANTHROPIC) {
    return list.map((tool) => ({
      name: tool.name,
      description: tool.description || '',
      input_schema: parameters(tool),
    }));
  }
  if (api === API_RESPONSES) {
    return list.map((tool) => ({
      type: 'function',
      name: tool.name,
      description: tool.description || '',
      parameters: parameters(tool),
    }));
  }
  return list.map((tool) => ({
    type: 'function',
    function: {
      name: tool.name,
      description: tool.description || '',
      parameters: parameters(tool),
    },
  }));
}

function openAIToolMessages(conversation) {
  const out = [];
  for (const message of Array.isArray(conversation) ? conversation : []) {
    if (!message || typeof message.role !== 'string') continue;
    if (message.role === 'system' || message.role === 'user') {
      out.push({ role: message.role, content: String(message.content == null ? '' : message.content) });
      continue;
    }
    if (message.role === 'assistant') {
      const entry = { role: 'assistant', content: String(message.content == null ? '' : message.content) };
      if (Array.isArray(message.toolCalls) && message.toolCalls.length) {
        entry.tool_calls = message.toolCalls.map((call) => ({
          id: call.id,
          type: 'function',
          function: {
            name: call.name,
            arguments: call.rawArguments && !call.parseError ? call.rawArguments : rawJson(call.input || {}),
          },
        }));
      }
      out.push(entry);
      continue;
    }
    if (message.role === 'tool') {
      out.push({
        role: 'tool',
        tool_call_id: message.toolCallId,
        content: String(message.content == null ? '' : message.content),
      });
    }
  }
  return out;
}

function responsesToolInput(conversation) {
  const out = [];
  for (const message of Array.isArray(conversation) ? conversation : []) {
    if (!message || typeof message.role !== 'string') continue;
    if (message.role === 'system' || message.role === 'user') {
      out.push({ role: message.role, content: String(message.content == null ? '' : message.content) });
      continue;
    }
    if (message.role === 'assistant') {
      const text = String(message.content == null ? '' : message.content);
      if (text) out.push({ role: 'assistant', content: text });
      for (const call of Array.isArray(message.toolCalls) ? message.toolCalls : []) {
        out.push({
          type: 'function_call',
          call_id: call.id,
          name: call.name,
          arguments: call.rawArguments && !call.parseError ? call.rawArguments : rawJson(call.input || {}),
        });
      }
      continue;
    }
    if (message.role === 'tool') {
      out.push({
        type: 'function_call_output',
        call_id: message.toolCallId,
        output: String(message.content == null ? '' : message.content),
      });
    }
  }
  return out;
}

function anthropicToolPayload(conversation) {
  const system = [];
  const messages = [];
  const add = (role, blocks) => {
    if (!blocks.length) return;
    const last = messages[messages.length - 1];
    if (last && last.role === role) last.content.push(...blocks);
    else messages.push({ role, content: blocks });
  };
  for (const message of Array.isArray(conversation) ? conversation : []) {
    if (!message || typeof message.role !== 'string') continue;
    if (message.role === 'system') {
      const text = String(message.content == null ? '' : message.content);
      if (text) system.push(text);
      continue;
    }
    if (message.role === 'user') {
      const text = String(message.content == null ? '' : message.content);
      if (text) add('user', [{ type: 'text', text }]);
      continue;
    }
    if (message.role === 'assistant') {
      if (Array.isArray(message.apiBlocks) && message.apiBlocks.length) {
        add('assistant', message.apiBlocks.filter((block) => block && typeof block === 'object'));
        continue;
      }
      const blocks = [];
      const text = String(message.content == null ? '' : message.content);
      if (text) blocks.push({ type: 'text', text });
      for (const call of Array.isArray(message.toolCalls) ? message.toolCalls : []) {
        blocks.push({ type: 'tool_use', id: call.id, name: call.name, input: call.input || {} });
      }
      add('assistant', blocks);
      continue;
    }
    if (message.role === 'tool') {
      const block = {
        type: 'tool_result',
        tool_use_id: message.toolCallId,
        content: String(message.content == null ? '' : message.content),
      };
      if (message.isError) block.is_error = true;
      add('user', [block]);
    }
  }
  if (!messages.length) messages.push({ role: 'user', content: [{ type: 'text', text: '(continue)' }] });
  return { system: system.join('\n\n'), messages };
}

function toolResponseBody(entry, conversation, tools, stream, maxTokens) {
  const type = normalizeType(entry.type);
  const api = type === TYPE_OPENAI ? normalizeApi(entry.api, type) : '';
  const effort = normalizeEffort(entry.effort, false);
  const definitions = toolDefinitions(type, api, tools);

  if (type === TYPE_ANTHROPIC) {
    const payload = anthropicToolPayload(conversation);
    const mode = anthropicThinkingMode(entry);
    const active = effortEnabled(effort) && mode !== 'none';
    const thinkingEffort = mode === 'effort' && effort === 'minimal' ? 'low' : effort;
    const budget = active && thinkingEffort ? (EFFORT_BUDGETS[thinkingEffort] || EFFORT_BUDGETS.medium) : 0;
    let maxOut = Number.isFinite(maxTokens) && maxTokens > 0 ? maxTokens : budget + 4096;
    if (budget) maxOut = Math.max(maxOut, budget + 512);
    const body = {
      model: entry.model,
      messages: payload.messages,
      max_tokens: maxOut,
      stream: !!stream,
    };
    if (payload.system) body.system = payload.system;
    if (definitions.length) {
      body.tools = definitions;
      body.tool_choice = { type: 'auto' };
    }
    if (mode === 'effort') {
      if (effort === 'none') body.thinking = { type: 'disabled' };
      else if (active) {
        body.thinking = { type: 'adaptive' };
        body.output_config = { effort: thinkingEffort };
      }
    } else if (budget) {
      body.thinking = { type: 'enabled', budget_tokens: budget };
    }
    return body;
  }

  if (api === API_RESPONSES) {
    const body = {
      model: entry.model,
      input: responsesToolInput(conversation),
      stream: !!stream,
    };
    if (Number.isFinite(maxTokens) && maxTokens > 0) body.max_output_tokens = maxTokens;
    if (effort) body.reasoning = { effort, summary: 'auto' };
    if (definitions.length) {
      body.tools = definitions;
      body.tool_choice = 'auto';
    }
    return body;
  }

  const body = {
    model: entry.model,
    messages: openAIToolMessages(conversation),
    stream: !!stream,
  };
  if (Number.isFinite(maxTokens) && maxTokens > 0) body.max_tokens = maxTokens;
  if (effort) body.reasoning_effort = effort;
  if (definitions.length) {
    body.tools = definitions;
    body.tool_choice = 'auto';
  }
  return body;
}

function normalizeOpenAIToolCall(call) {
  const fn = call && call.function && typeof call.function === 'object' ? call.function : {};
  const args = parseToolArguments(fn.arguments);
  return {
    id: String((call && call.id) || crypto.randomUUID()),
    name: String(fn.name || 'tool').slice(0, 80),
    ...args,
  };
}

function openAIToolResult(data) {
  const choice = data && Array.isArray(data.choices) ? data.choices[0] : null;
  const source = (choice && (choice.message || choice.delta)) || {};
  const content = source.content != null ? source.content : (choice && choice.text != null ? choice.text : '');
  const toolCalls = Array.isArray(source.tool_calls)
    ? source.tool_calls.map(normalizeOpenAIToolCall)
    : [];
  return {
    text: extractContent(content),
    reasoning: openAIReasoning(source),
    toolCalls,
    apiBlocks: null,
  };
}

function anthropicToolResult(data) {
  const blocks = data && Array.isArray(data.content) ? data.content : [];
  let text = '';
  let reasoning = '';
  const toolCalls = [];
  const apiBlocks = [];
  for (const block of blocks) {
    if (!block || typeof block !== 'object') continue;
    if (block.type === 'text') {
      if (typeof block.text === 'string') text += block.text;
      apiBlocks.push(block);
    } else if (block.type === 'thinking') {
      if (typeof block.thinking === 'string') reasoning += block.thinking;
      apiBlocks.push(block);
    } else if (block.type === 'redacted_thinking') {
      apiBlocks.push(block);
    } else if (block.type === 'tool_use') {
      const args = parseToolArguments(block.input);
      toolCalls.push({
        id: String(block.id || crypto.randomUUID()),
        name: String(block.name || 'tool').slice(0, 80),
        ...args,
      });
      apiBlocks.push(block);
    }
  }
  return { text, reasoning, toolCalls, apiBlocks };
}

function responsesToolResult(data) {
  const base = responsesMessage(data);
  const toolCalls = [];
  const items = data && Array.isArray(data.output) ? data.output : [];
  for (const item of items) {
    if (!item || item.type !== 'function_call') continue;
    const args = parseToolArguments(item.arguments);
    toolCalls.push({
      id: String(item.call_id || item.id || crypto.randomUUID()),
      name: String(item.name || 'tool').slice(0, 80),
      ...args,
    });
  }
  return { ...base, toolCalls, apiBlocks: null };
}

function responseBody(entry, messages, stream, maxTokens) {
  const type = normalizeType(entry.type);
  const api = type === TYPE_OPENAI ? normalizeApi(entry.api, type) : '';
  const effort = normalizeEffort(entry.effort, false);

  if (type === TYPE_ANTHROPIC) {
    const payload = anthropicPayload(messages);
    const mode = anthropicThinkingMode(entry);
    const active = effortEnabled(effort) && mode !== 'none';
    const thinkingEffort = mode === 'effort' && effort === 'minimal' ? 'low' : effort;
    const budget = active && thinkingEffort ? (EFFORT_BUDGETS[thinkingEffort] || EFFORT_BUDGETS.medium) : 0;
    let maxOut = Number.isFinite(maxTokens) && maxTokens > 0 ? maxTokens : budget + 4096;
    if (budget) maxOut = Math.max(maxOut, budget + 512);
    const body = {
      model: entry.model,
      messages: payload.messages,
      max_tokens: maxOut,
      stream: !!stream,
    };
    if (payload.system) body.system = payload.system;
    if (mode === 'effort') {
      if (effort === 'none') body.thinking = { type: 'disabled' };
      else if (active) {
        body.thinking = { type: 'adaptive' };
        body.output_config = { effort: thinkingEffort };
      }
    } else if (budget) {
      body.thinking = { type: 'enabled', budget_tokens: budget };
    }
    return body;
  }

  if (api === API_RESPONSES) {
    const body = {
      model: entry.model,
      input: (Array.isArray(messages) ? messages : [])
        .filter((message) => message && (message.role === 'user' || message.role === 'assistant'))
        .map((message) => ({ role: message.role, content: extractContent(message.content) })),
      stream: !!stream,
    };
    if (Number.isFinite(maxTokens) && maxTokens > 0) body.max_output_tokens = maxTokens;
    if (effort) body.reasoning = { effort, summary: 'auto' };
    return body;
  }

  const body = {
    model: entry.model,
    messages,
    stream: !!stream,
  };
  if (Number.isFinite(maxTokens) && maxTokens > 0) body.max_tokens = maxTokens;
  if (effort) body.reasoning_effort = effort;
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

function collectModels(data, type = TYPE_OPENAI) {
  const provider = normalizeType(type);
  const source = Array.isArray(data)
    ? data
    : (Array.isArray(data && data.data) ? data.data : (Array.isArray(data && data.models) ? data.models : []));
  const seen = new Map();
  for (const item of source) {
    let id = '';
    let name = '';
    if (typeof item === 'string') {
      id = text(item, MAX_MODEL_ID);
    } else if (item && typeof item === 'object') {
      id = text(item.id || item.model || item.name, MAX_MODEL_ID);
      name = text(item.display_name || item.displayName || item.name, MAX_NAME);
      if (name === id) name = '';
    }
    if (id && !seen.has(id)) {
      seen.set(id, { id, name, raw: item && typeof item === 'object' ? item : null });
    }
  }
  return [...seen.values()]
    .map(({ id, name, raw }) => {
      const info = describeModel(provider, { id, raw });
      return {
        id,
        name,
        efforts: info.efforts,
        thinking: info.thinking,
        source: info.source,
      };
    })
    .sort((a, b) => a.id.localeCompare(b.id));
}

async function fetchModelCatalog(entry) {
  const type = normalizeType(entry.type);
  const headers = { Accept: 'application/json' };
  if (type === TYPE_ANTHROPIC) {
    headers['anthropic-version'] = '2023-06-01';
    if (entry.apiKey) headers['x-api-key'] = entry.apiKey;
  } else if (entry.apiKey) {
    headers.Authorization = `Bearer ${entry.apiKey}`;
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), MODELS_TIMEOUT_MS);
  let response;
  try {
    response = await fetch(modelsUrl(entry.baseUrl, type), { headers, signal: controller.signal });
  } catch (error) {
    if (error && error.name === 'AbortError') {
      throw new Error('timeout');
    }
    throw error;
  } finally {
    clearTimeout(timer);
  }
  if (!response.ok) {
    let detail = '';
    try { detail = await response.text(); } catch {}
    let message = detail;
    try {
      const parsed = JSON.parse(detail);
      message = apiErrorText(parsed) || detail;
    } catch {}
    const snippet = String(message || '').replace(/\s+/g, ' ').slice(0, 320);
    throw new Error(`HTTP ${response.status}${snippet ? `: ${snippet}` : ''}`);
  }
  return collectModels(await response.json(), type);
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
    if (timedOut) return new Error('timeout');
    if (externalSignal && externalSignal.aborted) return abortError();
    if (error && error.name === 'AbortError') return abortError();
    return error;
  };

  const type = normalizeType(entry.type);
  const api = type === TYPE_OPENAI ? normalizeApi(entry.api, type) : '';
  const responses = isResponses(entry);
  const body = responseBody(entry, messages, stream, maxTokens);

  let response;
  try {
    response = await fetch(endpointUrl(entry.baseUrl, type, api), {
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
      : (responses ? responsesMessage(data) : openAIMessage(data));
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

    if (responses) {
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

async function requestToolTurn(entry, conversation, options = {}) {
  const { stream = true, maxTokens = null, timeoutMs = 0, tools = [], onDelta, onReasoning } = options;
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
    if (timedOut) return new Error('timeout');
    if (externalSignal && externalSignal.aborted) return abortError();
    if (error && error.name === 'AbortError') return abortError();
    return error;
  };

  const type = normalizeType(entry.type);
  const api = type === TYPE_OPENAI ? normalizeApi(entry.api, type) : '';
  const responses = isResponses(entry);
  const body = toolResponseBody(entry, conversation, tools, stream, maxTokens);

  let response;
  try {
    response = await fetch(endpointUrl(entry.baseUrl, type, api), {
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
      ? anthropicToolResult(data)
      : (responses ? responsesToolResult(data) : openAIToolResult(data));
    if (result.reasoning && onReasoning) onReasoning(result.reasoning);
    if (result.text && onDelta) onDelta(result.text);
    return result;
  }

  let full = '';
  let reasoning = '';
  let buffer = '';
  let finished = false;
  let wholeCalls = null;
  const decoder = new TextDecoder();
  const reader = response.body.getReader();
  const openAICalls = new Map();
  const anthropicStates = new Map();
  const anthropicBlocks = [];
  const anthropicCalls = [];
  const responsesCalls = new Map();
  let responsesNextIndex = 0;

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

  const mergeOpenAICall = (part) => {
    if (!part || typeof part !== 'object') return;
    const index = Number.isInteger(part.index) ? part.index : 0;
    let call = openAICalls.get(index);
    if (!call) {
      call = { id: '', name: '', arguments: '' };
      openAICalls.set(index, call);
    }
    if (part.id) call.id = part.id;
    const fn = part.function || {};
    if (typeof fn.name === 'string') call.name += fn.name;
    if (typeof fn.arguments === 'string') call.arguments += fn.arguments;
  };

  const responseCallFor = (event) => {
    let index = Number.isInteger(event.output_index) ? event.output_index : null;
    if (index == null && event.item_id) {
      for (const [key, call] of responsesCalls) {
        if (call.itemId === event.item_id) {
          index = key;
          break;
        }
      }
    }
    if (index == null) {
      index = responsesNextIndex++;
      responsesCalls.set(index, { itemId: '', id: '', name: '', arguments: '' });
    }
    let call = responsesCalls.get(index);
    if (!call) {
      call = { itemId: '', id: '', name: '', arguments: '' };
      responsesCalls.set(index, call);
    }
    return call;
  };

  const finishAnthropicBlock = (state) => {
    if (!state) return;
    if (state.type === 'text') {
      if (state.text) anthropicBlocks.push({ type: 'text', text: state.text });
    } else if (state.type === 'thinking') {
      if (state.thinking || state.signature) {
        anthropicBlocks.push({
          type: 'thinking',
          thinking: state.thinking,
          ...(state.signature ? { signature: state.signature } : {}),
        });
      }
    } else if (state.type === 'redacted_thinking') {
      anthropicBlocks.push({ type: 'redacted_thinking', data: state.data });
    } else if (state.type === 'tool_use') {
      const args = parseToolArguments(state.json || state.input || {});
      const call = {
        id: String(state.id || crypto.randomUUID()),
        name: String(state.name || 'tool').slice(0, 80),
        ...args,
      };
      anthropicCalls.push(call);
      anthropicBlocks.push({ type: 'tool_use', id: call.id, name: call.name, input: call.input });
    }
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
      const index = Number.isInteger(event.index) ? event.index : 0;
      if (event.type === 'content_block_start') {
        const block = event.content_block || {};
        if (block.type === 'text') {
          const state = { type: 'text', text: typeof block.text === 'string' ? block.text : '' };
          anthropicStates.set(index, state);
          emitText(state.text);
        } else if (block.type === 'thinking') {
          const state = {
            type: 'thinking',
            thinking: typeof block.thinking === 'string' ? block.thinking : '',
            signature: typeof block.signature === 'string' ? block.signature : '',
          };
          anthropicStates.set(index, state);
          emitReasoning(state.thinking);
        } else if (block.type === 'redacted_thinking') {
          anthropicStates.set(index, { type: 'redacted_thinking', data: block.data || '' });
        } else if (block.type === 'tool_use') {
          anthropicStates.set(index, {
            type: 'tool_use',
            id: block.id,
            name: block.name,
            input: block.input,
            json: '',
          });
        }
      } else if (event.type === 'content_block_delta') {
        const state = anthropicStates.get(index);
        if (!state) return;
        const delta = event.delta || {};
        if (delta.type === 'text_delta' && typeof delta.text === 'string') {
          state.text += delta.text;
          emitText(delta.text);
        } else if (delta.type === 'thinking_delta' && typeof delta.thinking === 'string') {
          state.thinking += delta.thinking;
          emitReasoning(delta.thinking);
        } else if (delta.type === 'signature_delta' && typeof delta.signature === 'string') {
          state.signature += delta.signature;
        } else if (delta.type === 'input_json_delta' && typeof delta.partial_json === 'string') {
          state.json += delta.partial_json;
        }
      } else if (event.type === 'content_block_stop') {
        finishAnthropicBlock(anthropicStates.get(index));
        anthropicStates.delete(index);
      } else if (event.type === 'message_stop') {
        finished = true;
      }
      return;
    }

    if (responses) {
      if (event.type === 'response.output_text.delta' && typeof event.delta === 'string') {
        emitText(event.delta);
      } else if (event.type === 'response.reasoning_summary_text.delta'
        || event.type === 'response.reasoning_text.delta') {
        if (typeof event.delta === 'string') emitReasoning(event.delta);
      } else if (event.type === 'response.output_item.added') {
        const item = event.item || {};
        if (item.type === 'function_call') {
          const index = Number.isInteger(event.output_index) ? event.output_index : responsesNextIndex++;
          responsesCalls.set(index, {
            itemId: item.id || '',
            id: item.call_id || item.id || '',
            name: item.name || '',
            arguments: item.arguments || '',
          });
          responsesNextIndex = Math.max(responsesNextIndex, index + 1);
        }
      } else if (event.type === 'response.function_call_arguments.delta') {
        if (typeof event.delta === 'string') responseCallFor(event).arguments += event.delta;
      } else if (event.type === 'response.function_call_arguments.done') {
        if (typeof event.arguments === 'string') responseCallFor(event).arguments = event.arguments;
      } else if (event.type === 'response.output_item.done') {
        const item = event.item || {};
        if (item.type === 'function_call') {
          const call = responseCallFor(event);
          call.itemId = item.id || call.itemId;
          call.id = item.call_id || item.id || call.id;
          call.name = item.name || call.name;
          if (typeof item.arguments === 'string') call.arguments = item.arguments;
        }
      } else if (event.type === 'response.completed' || event.type === 'response.incomplete') {
        finished = true;
        const output = event.response && Array.isArray(event.response.output) ? event.response.output : null;
        if (output) {
          responsesCalls.clear();
          let index = 0;
          for (const item of output) {
            if (!item || item.type !== 'function_call') continue;
            responsesCalls.set(index++, {
              itemId: item.id || '',
              id: item.call_id || item.id || '',
              name: item.name || '',
              arguments: item.arguments || '',
            });
          }
          responsesNextIndex = index;
        }
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
    if (Array.isArray(delta.tool_calls)) {
      for (const part of delta.tool_calls) mergeOpenAICall(part);
    }
    if (choice.message && Array.isArray(choice.message.tool_calls) && choice.message.tool_calls.length) {
      wholeCalls = choice.message.tool_calls.map(normalizeOpenAIToolCall);
    }
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

  if (type === TYPE_ANTHROPIC) {
    for (const [index, state] of anthropicStates) {
      finishAnthropicBlock(state);
      anthropicStates.delete(index);
    }
    return { text: full, reasoning, toolCalls: anthropicCalls, apiBlocks: anthropicBlocks };
  }
  if (responses) {
    const toolCalls = [...responsesCalls.entries()]
      .sort((a, b) => a[0] - b[0])
      .map(([, call]) => {
        const args = parseToolArguments(call.arguments);
        return {
          id: call.id || crypto.randomUUID(),
          name: call.name || 'tool',
          ...args,
        };
      });
    return { text: full, reasoning, toolCalls, apiBlocks: null };
  }
  const toolCalls = wholeCalls || [...openAICalls.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([, call]) => {
      const args = parseToolArguments(call.arguments);
      return {
        id: call.id || crypto.randomUUID(),
        name: call.name || 'tool',
        ...args,
      };
    });
  return { text: full, reasoning, toolCalls, apiBlocks: null };
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
    const wantsReasoning = effortEnabled(normalizeEffort(result.entry.effort, false));
    const entry = wantsReasoning ? { ...result.entry, effort: testEffort(result.entry) } : result.entry;
    const type = normalizeType(entry.type);
    const maxTokens = isResponses(entry)
      ? 2048
      : (type === TYPE_ANTHROPIC ? (wantsReasoning ? 1536 : 64) : (wantsReasoning ? null : 16));
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

  async function fetchModels(input) {
    const store = load();
    const source = input && typeof input === 'object' ? input : {};
    const existing = source.id ? store.models.find((entry) => entry.id === source.id) : null;
    const result = makeEntry(source, existing || {}, { requireModel: false });
    if (result.error) return { ok: false, error: result.error };
    const startedAt = Date.now();
    try {
      const models = await fetchModelCatalog(result.entry);
      return { ok: true, models, latencyMs: Date.now() - startedAt };
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

  async function toolTurn(entry, conversation, options = {}) {
    const target = typeof entry === 'string' ? get(entry) : entry;
    if (!target) throw new Error('model-not-found');
    return requestToolTurn(target, conversation, options);
  }

  load();

  return {
    list,
    get,
    find,
    save,
    remove,
    test,
    fetchModels,
    stream,
    toolTurn,
    buildHistory,
  };
}

module.exports = {
  createCustomModelStore,
  requestToolTurn,
  buildHistory,
  normalizeBaseUrl,
  endpointUrl,
  modelsUrl,
  collectModels,
  TYPE_OPENAI,
  TYPE_ANTHROPIC,
  LEGACY_TYPE_REASONING,
  API_CHAT,
  API_RESPONSES,
};
