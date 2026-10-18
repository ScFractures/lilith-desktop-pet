/* Qoder chat window renderer. All state lives in main; this file only reflects events. */
(() => {
  const LABELS = {
    zh: {
      newChat: '新对话',
      minimize: '最小化',
      close: '关闭',
      model: '模型',
      mode: '模式',
      manageModels: '添加模型',
      qoderGroup: 'Qoder',
      customOpenAIGroup: '自定义 · OpenAI',
      customAnthropicGroup: '自定义 · Anthropic',
      responsesSuffix: ' · Responses',
      reasoningSuffix: ' · 推理',
      customWarning: '自定义模型直连所选接口（OpenAI / Anthropic / Reasoning），不启用 Qoder 工具、权限模式和工作目录。',
      reasoning: '思考过程',
      sessionCustom: '自定义模型不使用 Qoder 会话',
      yoloWarning: 'YOLO：工具调用不再确认，请确认工作目录正确。',
      welcomeTitle: '直接和 Qoder 说话',
      welcomeBody: '这个窗口会以你选定的模型和权限模式运行 Qoder。它可以读文件、跑命令、改代码——尤其是 YOLO 模式下。',
      hintModel: '模型可随时切换',
      hintMode: '模式决定工具权限',
      hintEnter: 'Enter 发送',
      placeholder: '交代一件事，或直接问…',
      send: '发送',
      stop: '停止',
      enterHint: 'Enter 发送 · Shift+Enter 换行',
      sessionActive: '会话已连接，后续消息会保留上下文',
      sessionNew: '还没有建立会话',
      sessionReset: '旧会话已失效，已自动开始新会话。',
      working: 'Qoder 正在工作…',
      workingCustom: '模型正在回答…',
      starting: '正在启动 Qoder…',
      connecting: '正在连接模型…',
      thinking: '正在思考…',
      stopping: '正在停止…',
      ready: '就绪',
      done: '完成',
      stopped: '已停止',
      failed: '出错了',
      credits: '{n} credits',
      errorPrefix: '错误：',
      interrupted: '已中断。',
      emptyReply: '（没有返回文本）',
      toolInput: '输入',
      toolResult: '结果',
      toolRunning: '运行中',
      toolCalls: '工具调用',
      toolFailed: '{n} 个失败',
      errorTimeout: '请求超时了。',
      errorQoderTimeout: 'Qoder 运行超时了。',
      errorCustomTimeout: '自定义模型请求超时了。',
      busySend: '上一条还在进行，先等它结束或点停止。',
      emptySend: '先说点什么吧。',
      tooLong: '这段话太长了，精简一点。',
      qoderMissing: '找不到 Qoder CLI，请确认 ~/.qoder-cn 已安装并可运行。',
      spawnFailed: '启动 Qoder 失败。',
      invalidModel: '这个模型已不存在，请重新选择。',
      manageFailed: '打开添加模型页面失败：{error}',
      chooseWorkspace: '选择工作目录',
      newChatConfirm: '开始新对话？当前对话会从窗口中清空。',
      newChatBusyConfirm: 'Qoder 还在运行。开始新对话会停止当前运行并清空对话，继续吗？',
      workspaceConfirm: '切换工作目录会开始新对话，当前对话会被清空。继续吗？',
      requestFailed: '操作失败：{error}',
    },
    en: {
      newChat: 'New chat',
      minimize: 'Minimize',
      close: 'Close',
      model: 'Model',
      mode: 'Mode',
      manageModels: 'Add model',
      qoderGroup: 'Qoder',
      customOpenAIGroup: 'Custom · OpenAI',
      customAnthropicGroup: 'Custom · Anthropic',
      responsesSuffix: ' · Responses',
      reasoningSuffix: ' · Reasoning',
      customWarning: 'Custom models call the selected endpoint directly (OpenAI / Anthropic / Reasoning); Qoder tools, mode and workspace are not used.',
      reasoning: 'Reasoning',
      sessionCustom: 'Custom models do not use a Qoder session',
      yoloWarning: 'YOLO: tool calls run without confirmation. Make sure the workspace is correct.',
      welcomeTitle: 'Talk to Qoder directly',
      welcomeBody: 'This window runs Qoder with the model and permission mode you pick. It can read files, run commands and edit code — especially in YOLO mode.',
      hintModel: 'Switch models anytime',
      hintMode: 'Mode sets tool permissions',
      hintEnter: 'Enter to send',
      placeholder: 'Assign a task, or just ask…',
      send: 'Send',
      stop: 'Stop',
      enterHint: 'Enter to send · Shift+Enter for a new line',
      sessionActive: 'Session connected; later messages keep the context',
      sessionNew: 'No session yet',
      sessionReset: 'The old session was invalid; started a new one.',
      working: 'Qoder is working…',
      workingCustom: 'The model is replying…',
      starting: 'Starting Qoder…',
      connecting: 'Connecting to the model…',
      thinking: 'Thinking…',
      stopping: 'Stopping…',
      ready: 'Ready',
      done: 'Done',
      stopped: 'Stopped',
      failed: 'Something went wrong',
      credits: '{n} credits',
      errorPrefix: 'Error: ',
      interrupted: 'Interrupted.',
      emptyReply: '(no text returned)',
      toolInput: 'Input',
      toolResult: 'Result',
      toolRunning: 'running',
      toolCalls: 'Tool calls',
      toolFailed: '{n} failed',
      errorTimeout: 'The request timed out.',
      errorQoderTimeout: 'The Qoder run timed out.',
      errorCustomTimeout: 'The custom model request timed out.',
      busySend: 'The previous turn is still running. Wait or press Stop.',
      emptySend: 'Say something first.',
      tooLong: 'That message is too long — trim it a little.',
      qoderMissing: 'Qoder CLI was not found. Check that ~/.qoder-cn is installed and runnable.',
      spawnFailed: 'Failed to start Qoder.',
      invalidModel: 'That model no longer exists. Pick another one.',
      manageFailed: 'Could not open the add-model page: {error}',
      chooseWorkspace: 'Choose workspace',
      newChatConfirm: 'Start a new chat? The current conversation will be cleared from the window.',
      newChatBusyConfirm: 'Qoder is still running. Starting a new chat will stop it and clear the conversation. Continue?',
      workspaceConfirm: 'Switching workspace starts a new chat and clears the current conversation. Continue?',
      requestFailed: 'Action failed: {error}',
    },
  };

  const bodyClass = window.qoder.platform === 'darwin' ? 'darwin' : 'other';
  document.body.classList.add(bodyClass);

  const messagesEl = document.getElementById('messages');
  const welcomeEl = document.getElementById('welcome');
  const modelSel = document.getElementById('model');
  const modeSel = document.getElementById('mode');
  const manageModelsBtn = document.getElementById('manage-models');
  const workspaceBtn = document.getElementById('workspace');
  const workspaceName = document.getElementById('workspace-name');
  const workspacePath = document.getElementById('workspace-path');
  const yoloWarning = document.getElementById('yolo-warning');
  const customWarning = document.getElementById('custom-warning');
  const sessionDot = document.getElementById('session-dot');
  const newChatBtn = document.getElementById('newchat');
  const minimizeBtn = document.getElementById('minimize');
  const closeBtn = document.getElementById('closewin');
  const spinner = document.getElementById('spinner');
  const statusText = document.getElementById('status-text');
  const statusCredits = document.getElementById('status-credits');
  const statusbar = document.getElementById('statusbar');
  const stopBtn = document.getElementById('stop');
  const input = document.getElementById('input');
  const sendBtn = document.getElementById('send');

  let lang = 'zh';
  let state = {
    sessionId: null,
    model: '',
    modelKind: 'qoder',
    modelEntries: [],
    mode: 'yolo',
    workspace: '',
    messages: [],
    models: [],
    modes: [],
    busy: false,
    draft: null,
  };
  let draftNode = null;
  let draftTextEl = null;
  let draftToolsEl = null;
  let draftThinkEl = null;
  let draftReasonEl = null;
  let draftReasonTextEl = null;
  let draftTools = [];
  let statusResetTimer = null;
  let forceScroll = false;
  let draftQueued = false;

  const t = (key) => (LABELS[lang] && LABELS[lang][key]) || LABELS.zh[key] || key;
  const fill = (template, vars) => String(template).replace(/\{(\w+)\}/g, (_m, k) => (vars && k in vars ? vars[k] : `{${k}}`));

  function formatCredits(value) {
    const n = Number(value);
    if (!Number.isFinite(n) || n <= 0) return '';
    const fixed = n.toFixed(n >= 1 ? 2 : 4).replace(/\.?0+$/, '');
    return fill(t('credits'), { n: fixed });
  }

  function basename(p) {
    if (!p) return '~';
    const parts = String(p).split(/[\\/]/).filter(Boolean);
    return parts[parts.length - 1] || p;
  }

  function setStatus(text, kind) {
    clearTimeout(statusResetTimer);
    statusText.textContent = text || '';
    statusbar.classList.toggle('error', kind === 'error');
    if (kind === 'transient') {
      statusResetTimer = setTimeout(() => {
        if (!state.busy) {
          statusText.textContent = t('ready');
          statusbar.classList.remove('error');
        }
      }, 5000);
    }
  }

  function isCustomSelected() {
    if (state.modelKind === 'custom') return true;
    const entries = Array.isArray(state.modelEntries) ? state.modelEntries : [];
    const entry = entries.find((item) => item.value === state.model);
    return !!entry && entry.kind === 'custom';
  }

  function selectionKind(entries, model) {
    const entry = (Array.isArray(entries) ? entries : []).find((item) => item.value === model);
    return entry && entry.kind === 'custom' ? 'custom' : 'qoder';
  }

  function setStaticTexts() {
    document.title = 'Lilith · Qoder';
    document.querySelectorAll('[data-i18n]').forEach((el) => {
      const key = el.dataset.i18n;
      el.textContent = t(key);
    });
    document.querySelectorAll('[data-i18n-placeholder]').forEach((el) => {
      el.placeholder = t(el.dataset.i18nPlaceholder);
    });
    newChatBtn.textContent = t('newChat');
    manageModelsBtn.title = t('manageModels');
    minimizeBtn.title = t('minimize');
    closeBtn.title = t('close');
    workspaceBtn.title = state.workspace || '';
    input.placeholder = t('placeholder');
    sessionDot.title = state.sessionId ? t('sessionActive') : t('sessionNew');
    yoloWarning.hidden = state.mode !== 'yolo';
  }

  function setLang(nextLang) {
    lang = nextLang === 'en' ? 'en' : 'zh';
    document.documentElement.lang = lang === 'zh' ? 'zh-CN' : 'en';
    setStaticTexts();
    renderModelOptions(state.modelEntries, state.model);
    renderModeOptions(state.modes, state.mode);
    renderAll();
  }

  function nearBottom() {
    return messagesEl.scrollHeight - messagesEl.scrollTop - messagesEl.clientHeight < 80;
  }

  function scrollToBottom(force) {
    if (force) messagesEl.scrollTop = messagesEl.scrollHeight;
    else if (nearBottom()) messagesEl.scrollTop = messagesEl.scrollHeight;
  }

  // ------------------------------------------------------------- rendering
  function renderModelOptions(entries, selected) {
    const current = selected || state.model;
    const list = Array.isArray(entries) ? entries.slice() : [];
    const hasCurrent = list.some((entry) => entry.value === current);
    if (current && !hasCurrent) {
      list.push({
        value: current,
        label: current,
        kind: current.startsWith('custom:') ? 'custom' : 'qoder',
      });
    }
    const groups = { qoder: [], openai: [], anthropic: [] };
    list.forEach((entry) => {
      if (!entry || entry.kind !== 'custom') {
        groups.qoder.push(entry || {});
        return;
      }
      const type = entry.type === 'anthropic' ? 'anthropic' : 'openai';
      groups[type].push(entry);
    });

    modelSel.textContent = '';
    const addGroup = (label, items) => {
      if (!items.length) return;
      const group = document.createElement('optgroup');
      group.label = label;
      items.forEach((entry) => {
        const option = document.createElement('option');
        option.value = entry.value || '';
        const suffix = entry.kind === 'custom'
          ? (entry.api === 'responses' ? t('responsesSuffix') : (entry.effort ? t('reasoningSuffix') : ''))
          : '';
        option.textContent = `${entry.label || entry.value || '—'}${suffix}`;
        option.title = entry.kind === 'custom' && entry.model ? entry.model : (entry.label || '');
        option.selected = entry.value === current;
        group.appendChild(option);
      });
      modelSel.appendChild(group);
    };
    addGroup(t('qoderGroup'), groups.qoder);
    addGroup(t('customOpenAIGroup'), groups.openai);
    addGroup(t('customAnthropicGroup'), groups.anthropic);
    if (!list.length) {
      const option = document.createElement('option');
      option.value = current || '';
      option.textContent = current || '—';
      modelSel.appendChild(option);
    }
  }

  function renderModeOptions(modes, selected) {
    const list = Array.isArray(modes) ? modes : [];
    const current = selected || state.mode;
    modeSel.textContent = '';
    list.forEach((mode) => {
      const option = document.createElement('option');
      option.value = mode.key;
      option.textContent = (mode.label && (mode.label[lang] || mode.label.zh)) || mode.key;
      option.title = (mode.hint && (mode.hint[lang] || mode.hint.zh)) || '';
      option.selected = mode.key === current;
      modeSel.appendChild(option);
    });
    const active = list.find((mode) => mode.key === current);
    modeSel.title = active && active.hint ? (active.hint[lang] || active.hint.zh || '') : '';
  }

  function makeMeta(message) {
    const meta = document.createElement('div');
    meta.className = 'msg-meta';
    const parts = [];
    if (message.model) parts.push(message.model);
    if (Number.isFinite(message.credits) && message.credits > 0) parts.push(formatCredits(message.credits));
    if (Number.isFinite(message.durationMs) && message.durationMs > 0) {
      parts.push(`${(message.durationMs / 1000).toFixed(1)}s`);
    }
    parts.forEach((part, index) => {
      if (index) {
        const sep = document.createElement('span');
        sep.className = 'meta-sep';
        sep.textContent = '·';
        meta.appendChild(sep);
      }
      const span = document.createElement('span');
      span.textContent = part;
      meta.appendChild(span);
    });
    return meta;
  }

  function makeToolElement(tool) {
    const details = document.createElement('details');
    details.className = 'tool';
    if (tool.state === 'running') details.classList.add('running');
    else if (tool.isError) details.classList.add('error');
    else details.classList.add('done');
    details.dataset.toolId = tool.id;

    const summary = document.createElement('summary');
    const dot = document.createElement('span');
    dot.className = 'tool-status';
    const name = document.createElement('span');
    name.className = 'tool-name';
    name.textContent = tool.name || 'Tool';
    const label = document.createElement('span');
    label.className = 'tool-summary';
    label.textContent = tool.summary || (tool.state === 'running' ? t('toolRunning') : '');
    const chevron = document.createElement('span');
    chevron.className = 'tool-chevron';
    chevron.textContent = '›';
    summary.append(dot, name, label, chevron);

    const body = document.createElement('div');
    body.className = 'tool-body';
    if (tool.inputText) {
      const inputLabel = document.createElement('div');
      inputLabel.className = 'tool-label';
      inputLabel.textContent = t('toolInput');
      const inputPre = document.createElement('pre');
      inputPre.textContent = tool.inputText;
      body.append(inputLabel, inputPre);
    }
    if (tool.result) {
      const resultLabel = document.createElement('div');
      resultLabel.className = 'tool-label';
      resultLabel.textContent = t('toolResult');
      const resultPre = document.createElement('pre');
      resultPre.textContent = tool.result;
      body.append(resultLabel, resultPre);
    }
    details.append(summary, body);
    return details;
  }

  function makeToolsGroup(tools, options) {
    const list = Array.isArray(tools) ? tools : [];
    const openIds = (options && options.openIds) || new Set();
    const running = list.find((tool) => tool.state === 'running');
    const failures = list.filter((tool) => tool.isError).length;

    const details = document.createElement('details');
    details.className = 'tool-calls';
    if (running) details.classList.add('running');
    else if (failures) details.classList.add('error');
    else details.classList.add('done');
    if (options && options.open) details.open = true;

    const summary = document.createElement('summary');
    const dot = document.createElement('span');
    dot.className = 'tool-calls-status';
    const name = document.createElement('span');
    name.className = 'tool-calls-name';
    name.textContent = t('toolCalls');
    const count = document.createElement('span');
    count.className = 'tool-calls-count';
    count.textContent = String(list.length);
    const meta = document.createElement('span');
    meta.className = 'tool-calls-meta';
    if (running) {
      meta.textContent = running.summary || running.name || '';
      meta.title = meta.textContent;
    } else if (failures) {
      meta.textContent = fill(t('toolFailed'), { n: failures });
    }
    const chevron = document.createElement('span');
    chevron.className = 'tool-calls-chevron';
    chevron.textContent = '›';
    summary.append(dot, name, count, meta, chevron);

    const body = document.createElement('div');
    body.className = 'tool-list';
    list.forEach((tool) => {
      const el = makeToolElement(tool);
      if (openIds.has(tool.id)) el.open = true;
      body.appendChild(el);
    });
    details.append(summary, body);
    return details;
  }

  function errorText(value) {
    const code = String(value || '');
    if (code === 'qoder-timeout') return t('errorQoderTimeout');
    if (code === 'custom-timeout') return t('errorCustomTimeout');
    if (code === 'timeout') return t('errorTimeout');
    return code;
  }

  function renderRichText(container, text, streaming) {
    container.textContent = '';
    const value = String(text || '');
    let index = 0;
    while (index < value.length) {
      const start = value.indexOf('```', index);
      if (start < 0) {
        appendTextSegments(container, value.slice(index));
        break;
      }
      const lineEnd = value.indexOf('\n', start + 3);
      if (lineEnd < 0) {
        appendTextSegments(container, value.slice(index));
        break;
      }
      const fenceLang = value.slice(start + 3, lineEnd).trim();
      const end = value.indexOf('```', lineEnd + 1);
      if (end < 0) {
        appendTextSegments(container, value.slice(index));
        break;
      }
      if (start > index) appendTextSegments(container, value.slice(index, start));
      const block = document.createElement('div');
      block.className = 'code-block';
      const head = document.createElement('div');
      head.className = 'code-head';
      const langLabel = document.createElement('span');
      langLabel.textContent = fenceLang || 'code';
      head.appendChild(langLabel);
      const pre = document.createElement('pre');
      pre.textContent = value.slice(lineEnd + 1, end).replace(/\n$/, '');
      block.append(head, pre);
      container.appendChild(block);
      index = end + 3;
    }
    if (streaming) {
      const cursor = document.createElement('span');
      cursor.className = 'stream-cursor';
      container.appendChild(cursor);
    }
  }

  function appendTextSegments(container, raw) {
    const text = String(raw || '');
    const chunks = text.split(/\n{2,}/);
    chunks.forEach((chunk, i) => {
      if (!chunk.trim() && chunks.length > 1) return;
      const div = document.createElement('div');
      div.className = 'text-segment';
      div.textContent = chunk;
      if (i === chunks.length - 1) div.style.marginBottom = '0';
      container.appendChild(div);
    });
  }

  function makeReasoningElement(text, open) {
    const details = document.createElement('details');
    details.className = 'reasoning';
    details.open = !!open;
    const summary = document.createElement('summary');
    summary.textContent = t('reasoning');
    const body = document.createElement('div');
    body.className = 'reasoning-text';
    body.textContent = text;
    details.append(summary, body);
    return details;
  }

  function makeMessageElement(message) {
    const row = document.createElement('div');
    row.className = `msg ${message.role}`;
    if (message.role === 'user') {
      const bubble = document.createElement('div');
      bubble.className = 'bubble';
      bubble.textContent = message.text;
      row.appendChild(bubble);
      return row;
    }

    const avatar = document.createElement('div');
    avatar.className = 'avatar';
    avatar.textContent = 'Q';
    const body = document.createElement('div');
    body.className = 'assistant-body';

    if (message.reasoning) body.appendChild(makeReasoningElement(message.reasoning, false));

    const textEl = document.createElement('div');
    textEl.className = 'assistant-text';
    if (message.text) renderRichText(textEl, message.text, false);
    else if (!(message.tools && message.tools.length) && !message.error) textEl.textContent = t('emptyReply');
    body.appendChild(textEl);

    if (message.tools && message.tools.length) {
      body.appendChild(makeToolsGroup(message.tools));
    }
    if (message.error && message.errorText) {
      const note = document.createElement('div');
      note.className = 'error-note';
      note.textContent = t('errorPrefix') + errorText(message.errorText);
      body.appendChild(note);
    } else if (message.interrupted) {
      const note = document.createElement('div');
      note.className = 'interrupted-note';
      note.textContent = t('interrupted');
      body.appendChild(note);
    }
    if (message.model || Number.isFinite(message.credits) || Number.isFinite(message.durationMs)) {
      body.appendChild(makeMeta(message));
    }
    row.append(avatar, body);
    return row;
  }

  function makeDraftElement(draft) {
    const row = document.createElement('div');
    row.className = 'msg assistant draft';
    const avatar = document.createElement('div');
    avatar.className = 'avatar';
    avatar.textContent = 'Q';
    const body = document.createElement('div');
    body.className = 'assistant-body';

    const reasoningEl = document.createElement('details');
    reasoningEl.className = 'reasoning draft-reasoning';
    reasoningEl.open = true;
    reasoningEl.hidden = true;
    const reasoningSummary = document.createElement('summary');
    reasoningSummary.textContent = t('reasoning');
    const reasoningText = document.createElement('div');
    reasoningText.className = 'reasoning-text';
    reasoningEl.append(reasoningSummary, reasoningText);

    const textEl = document.createElement('div');
    textEl.className = 'assistant-text';
    const toolsEl = document.createElement('div');
    toolsEl.className = 'tools-slot';
    const thinkEl = document.createElement('div');
    thinkEl.className = 'thinking-line';

    body.append(reasoningEl, textEl, toolsEl, thinkEl);
    row.append(avatar, body);

    draftNode = row;
    draftTextEl = textEl;
    draftToolsEl = toolsEl;
    draftThinkEl = thinkEl;
    draftReasonEl = reasoningEl;
    draftReasonTextEl = reasoningText;
    updateDraftReasoning(draft);
    updateDraftText(draft);
    updateDraftTools(draft.tools || []);
    updateDraftThinking(draft);
    return row;
  }

  function updateDraftReasoning(draft) {
    if (!draftReasonEl || !draftReasonTextEl) return;
    const text = draft && draft.reasoning ? String(draft.reasoning) : '';
    draftReasonEl.hidden = !text;
    if (!text) {
      draftReasonTextEl.textContent = '';
      return;
    }
    draftReasonTextEl.textContent = text;
    draftReasonEl.open = true;
    draftReasonTextEl.scrollTop = draftReasonTextEl.scrollHeight;
  }

  function updateDraftText(draft) {
    if (!draftTextEl) return;
    const text = (draft && draft.text) || '';
    if (text) {
      renderRichText(draftTextEl, text, true);
      draftTextEl.hidden = false;
    } else {
      draftTextEl.textContent = '';
      draftTextEl.hidden = true;
    }
  }

  function updateDraftTools(tools) {
    if (!draftToolsEl) return;
    draftTools = tools || [];
    if (!draftTools.length) {
      draftToolsEl.textContent = '';
      draftToolsEl.hidden = true;
      return;
    }
    draftToolsEl.hidden = false;
    const prevGroup = draftToolsEl.querySelector('details.tool-calls');
    const groupOpen = !!prevGroup && prevGroup.open;
    const openIds = new Set(
      [...draftToolsEl.querySelectorAll('details.tool[open]')].map((el) => el.dataset.toolId)
    );
    draftToolsEl.textContent = '';
    draftToolsEl.appendChild(makeToolsGroup(draftTools, { open: groupOpen, openIds }));
  }

  function updateDraftThinking(draft) {
    if (!draftThinkEl) return;
    const thinking = !!(draft && draft.thinking);
    const hasReasoning = !!(draft && draft.reasoning);
    const empty = !draft || (!draft.text && !(draft.tools && draft.tools.length));
    draftThinkEl.hidden = hasReasoning || (!thinking && !empty);
    if (draftThinkEl.hidden) return;
    draftThinkEl.textContent = '';
    const dots = document.createElement('span');
    dots.className = 'thinking-dots';
    dots.append(document.createElement('i'), document.createElement('i'), document.createElement('i'));
    const label = document.createElement('span');
    label.textContent = thinking ? t('thinking') : (isCustomSelected() ? t('connecting') : t('starting'));
    draftThinkEl.append(dots, label);
  }

  function renderAll() {
    const stick = forceScroll || nearBottom();
    forceScroll = false;
    draftNode = null;
    draftTextEl = null;
    draftToolsEl = null;
    draftThinkEl = null;
    draftReasonEl = null;
    draftReasonTextEl = null;
    messagesEl.querySelectorAll(':scope > .msg').forEach((el) => el.remove());
    state.messages.forEach((message) => messagesEl.appendChild(makeMessageElement(message)));

    const hasDraft = state.busy;
    welcomeEl.classList.toggle('hidden', state.messages.length > 0 || hasDraft);
    if (hasDraft) {
      const draft = state.draft || { text: '', thinking: false, tools: [], credits: 0 };
      messagesEl.appendChild(makeDraftElement(draft));
    }
    updateChrome();
    scrollToBottom(stick);
  }

  function updateChrome() {
    const busy = !!state.busy;
    const custom = isCustomSelected();
    modelSel.disabled = busy;
    modeSel.disabled = busy || custom;
    workspaceBtn.disabled = busy || custom;
    stopBtn.hidden = !busy;
    spinner.hidden = !busy;
    if (busy) {
      setStatus(custom ? t('workingCustom') : t('working'));
      const credits = formatCredits(state.draft && state.draft.credits);
      statusCredits.textContent = credits;
    } else if (!statusbar.classList.contains('error')) {
      statusCredits.textContent = '';
    }
    sessionDot.classList.toggle('active', !!state.sessionId && !custom);
    sessionDot.title = custom
      ? t('sessionCustom')
      : (state.sessionId ? t('sessionActive') : t('sessionNew'));
    workspaceName.textContent = basename(state.workspace);
    workspaceBtn.title = state.workspace || '';
    workspacePath.textContent = state.workspace || '';
    yoloWarning.hidden = custom || state.mode !== 'yolo';
    customWarning.hidden = !custom;
    sendBtn.disabled = busy || !input.value.trim();
  }

  // ------------------------------------------------------------- state sync
  function applyState(next) {
    if (!next) return;
    const model = next.model || '';
    const modelEntries = Array.isArray(next.modelEntries)
      ? next.modelEntries
      : (Array.isArray(next.models)
        ? next.models.map((name) => ({ value: name, label: name, kind: 'qoder' }))
        : state.modelEntries);
    state = {
      sessionId: next.sessionId || null,
      model,
      modelKind: next.modelKind === 'custom' ? 'custom' : selectionKind(modelEntries, model),
      modelEntries,
      mode: next.mode || 'yolo',
      workspace: next.workspace || '',
      messages: Array.isArray(next.messages) ? next.messages : [],
      models: Array.isArray(next.models) ? next.models : state.models,
      modes: Array.isArray(next.modes) && next.modes.length ? next.modes : state.modes,
      busy: !!next.busy,
      draft: next.draft || null,
    };
    setStaticTexts();
    renderModelOptions(state.modelEntries, state.model);
    renderModeOptions(state.modes, state.mode);
    renderAll();
    if (!state.busy && !statusText.textContent) setStatus(t('ready'));
  }

  function scheduleDraftPaint() {
    if (draftQueued) return;
    draftQueued = true;
    requestAnimationFrame(() => {
      draftQueued = false;
      if (!draftNode) return;
      updateDraftText(state.draft || {});
      updateDraftReasoning(state.draft || {});
      updateDraftThinking(state.draft || {});
      scrollToBottom(false);
    });
  }

  function syncDraftText(event) {
    if (!state.draft) state.draft = { text: '', reasoning: '', thinking: false, tools: draftTools, credits: 0 };
    state.draft.text = event.text || '';
    if (typeof event.reasoning === 'string') state.draft.reasoning = event.reasoning;
    if (typeof event.thinking === 'boolean') state.draft.thinking = event.thinking;
    if (Number.isFinite(event.credits)) state.draft.credits = event.credits;
    if (!draftNode) {
      welcomeEl.classList.add('hidden');
      messagesEl.appendChild(makeDraftElement(state.draft));
    }
    scheduleDraftPaint();
    const credits = formatCredits(state.draft.credits);
    if (credits) statusCredits.textContent = credits;
  }

  function mergeTool(tool, result) {
    if (!state.busy) return;
    if (!state.draft) state.draft = { text: '', thinking: false, tools: [], credits: 0 };
    const tools = state.draft.tools || (state.draft.tools = []);
    let entry = tools.find((item) => item.id === tool.id);
    if (!entry) {
      entry = { ...tool };
      tools.push(entry);
    } else {
      Object.assign(entry, tool);
    }
    if (result) {
      entry.result = result.result || '';
      entry.isError = result.isError === true;
      entry.state = 'done';
    }
    if (!draftNode) {
      welcomeEl.classList.add('hidden');
      messagesEl.appendChild(makeDraftElement(state.draft));
    }
    updateDraftTools(tools);
    updateDraftThinking(state.draft);
    scrollToBottom(false);
  }

  function handleEvent(event) {
    if (!event || typeof event.type !== 'string') return;
    switch (event.type) {
      case 'snapshot':
        applyState(event.state);
        break;
      case 'delta':
        syncDraftText(event);
        break;
      case 'thinking':
        if (state.draft) {
          state.draft.thinking = !!event.value;
          updateDraftThinking(state.draft);
        }
        break;
      case 'credits':
        if (state.draft) {
          state.draft.credits = Number(event.credits) || 0;
          const credits = formatCredits(state.draft.credits);
          if (credits) statusCredits.textContent = credits;
        }
        break;
      case 'tool':
        mergeTool(event.tool, null);
        break;
      case 'tool-result':
        mergeTool({ id: event.id, state: 'done' }, event);
        break;
      case 'run-meta':
        if (event.sessionId) {
          state.sessionId = event.sessionId;
          sessionDot.classList.add('active');
          sessionDot.title = t('sessionActive');
        }
        break;
      case 'models':
        if (Array.isArray(event.modelEntries)) {
          state.modelEntries = event.modelEntries;
          state.modelKind = selectionKind(state.modelEntries, state.model);
        } else if (Array.isArray(event.models)) {
          state.models = event.models;
          state.modelEntries = event.models.map((name) => ({ value: name, label: name, kind: 'qoder' }));
          state.modelKind = 'qoder';
        }
        renderModelOptions(state.modelEntries, state.model);
        updateChrome();
        break;
      case 'run-status':
        if (event.status === 'stopping') setStatus(t('stopping'));
        break;
      case 'notice':
        if (event.code === 'session-reset') setStatus(t('sessionReset'), 'transient');
        break;
      case 'done':
        applyState(event.state);
        setStatus(t('done'), 'transient');
        break;
      case 'stopped':
        applyState(event.state);
        setStatus(t('stopped'), 'transient');
        break;
      case 'error':
        applyState(event.state);
        setStatus(t('failed'), 'error');
        break;
      case 'lang':
        setLang(event.lang);
        break;
      default:
        break;
    }
  }

  // ------------------------------------------------------------- actions
  function resizeInput() {
    input.style.height = 'auto';
    input.style.height = `${Math.min(150, input.scrollHeight)}px`;
    sendBtn.disabled = state.busy || !input.value.trim();
  }

  function sendErrorText(code) {
    switch (code) {
      case 'busy': return t('busySend');
      case 'empty': return t('emptySend');
      case 'too-long': return t('tooLong');
      case 'qoder-not-found': return t('qoderMissing');
      case 'spawn-failed': return t('spawnFailed');
      case 'invalid-model': return t('invalidModel');
      default: return fill(t('requestFailed'), { error: code || 'unknown' });
    }
  }

  async function submit() {
    if (state.busy) return;
    const text = input.value.trim();
    if (!text) return;
    let result;
    try {
      result = await window.qoder.send(text);
    } catch (error) {
      setStatus(fill(t('requestFailed'), { error: String((error && error.message) || error) }), 'error');
      return;
    }
    if (!result || !result.ok) {
      setStatus(sendErrorText(result && result.error), 'error');
      return;
    }
    input.value = '';
    resizeInput();
    forceScroll = true;
    scrollToBottom(true);
  }

  async function stopRun() {
    stopBtn.disabled = true;
    try {
      await window.qoder.stop();
    } catch {}
    stopBtn.disabled = false;
  }

  async function newChat() {
    if (state.busy) {
      if (!window.confirm(t('newChatBusyConfirm'))) return;
    } else if (state.messages.length && !window.confirm(t('newChatConfirm'))) {
      return;
    }
    try {
      const result = await window.qoder.newChat();
      if (result && result.state) applyState(result.state);
      input.focus();
    } catch (error) {
      setStatus(fill(t('requestFailed'), { error: String((error && error.message) || error) }), 'error');
    }
  }

  async function chooseWorkspace() {
    if (state.busy) return;
    if (state.messages.length && !window.confirm(t('workspaceConfirm'))) return;
    let result;
    try {
      result = await window.qoder.chooseWorkspace();
    } catch (error) {
      setStatus(fill(t('requestFailed'), { error: String((error && error.message) || error) }), 'error');
      return;
    }
    if (result && result.ok && result.state) applyState(result.state);
    else if (result && !result.ok && result.error !== 'canceled') setStatus(sendErrorText(result.error), 'error');
  }

  async function onModelChange() {
    const value = modelSel.value;
    const result = await window.qoder.setModel(value).catch(() => null);
    if (result && result.ok) {
      if (result.state) applyState(result.state);
      return;
    }
    setStatus(sendErrorText(result && result.error), 'error');
    renderModelOptions(state.modelEntries, state.model);
  }

  async function openModelsPage() {
    try {
      const result = await window.qoder.openModels();
      if (result && result.ok === false) {
        setStatus(fill(t('manageFailed'), { error: result.error || t('unknownError') }), 'error');
      }
    } catch (error) {
      setStatus(fill(t('manageFailed'), { error: String((error && error.message) || error) }), 'error');
    }
  }

  async function onModeChange() {
    const value = modeSel.value;
    const result = await window.qoder.setMode(value).catch(() => null);
    if (!result || !result.ok) {
      setStatus(sendErrorText(result && result.error), 'error');
      renderModeOptions(state.modes, state.mode);
    }
  }

  // ------------------------------------------------------------- wiring
  newChatBtn.addEventListener('click', newChat);
  minimizeBtn.addEventListener('click', () => window.qoder.minimize());
  closeBtn.addEventListener('click', () => window.qoder.close());
  manageModelsBtn.addEventListener('click', (event) => {
    event.preventDefault();
    event.stopPropagation();
    openModelsPage();
  });
  stopBtn.addEventListener('click', stopRun);
  workspaceBtn.addEventListener('click', chooseWorkspace);
  modelSel.addEventListener('change', onModelChange);
  modeSel.addEventListener('change', onModeChange);
  sendBtn.addEventListener('click', submit);

  input.addEventListener('input', resizeInput);
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) {
      e.preventDefault();
      submit();
    }
  });

  window.qoder.onEvent(handleEvent);

  (async () => {
    resizeInput();
    try {
      const [initial, info] = await Promise.all([
        window.qoder.getState(),
        window.qoder.getLang().catch(() => null),
      ]);
      if (info && info.lang) lang = info.lang === 'en' ? 'en' : 'zh';
      document.documentElement.lang = lang === 'zh' ? 'zh-CN' : 'en';
      if (initial) applyState(initial);
      setLang(lang);
      setStatus(t('ready'));
    } catch (error) {
      setStatus(fill(t('requestFailed'), { error: String((error && error.message) || error) }), 'error');
    }
    input.focus();
  })();
})();
