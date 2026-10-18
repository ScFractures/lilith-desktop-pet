/* Chat window renderer. All state lives in main; this file only reflects events. */
(() => {
  const LABELS = {
    zh: {
      newChat: '新对话',
      minimize: '最小化',
      close: '关闭',
      model: '模型',
      manageModels: '添加模型',
      modelGroupOpenAI: 'OpenAI 兼容',
      modelGroupAnthropic: 'Anthropic',
      modelGroupReasoning: 'Reasoning',
      noModelWarning: '还没有添加模型。点上面的「添加模型」填写接口信息。',
      reasoning: '思考过程',
      welcomeTitle: '和莉莉丝聊天',
      welcomeBody: '选一个模型，直接开始。回复会以流式出现，思考型模型还会显示思考过程。',
      hintModel: '模型可随时切换',
      hintTypes: 'OpenAI · Anthropic · Reasoning',
      hintEnter: 'Enter 发送',
      placeholder: '和莉莉丝说点什么…',
      send: '发送',
      stop: '停止',
      enterHint: 'Enter 发送 · Shift+Enter 换行',
      working: '模型正在回答…',
      connecting: '正在连接模型…',
      thinking: '正在思考…',
      stopping: '正在停止…',
      ready: '就绪',
      noModel: '还没有添加模型',
      done: '完成',
      stopped: '已停止',
      failed: '出错了',
      errorPrefix: '错误：',
      interrupted: '已中断。',
      emptyReply: '（没有返回文本）',
      busySend: '上一条还在进行，先等它结束或点停止。',
      emptySend: '先说点什么吧。',
      tooLong: '这段话太长了，精简一点。',
      invalidModel: '这个模型已不存在，请重新选择。',
      manageFailed: '打开添加模型页面失败：{error}',
      newChatConfirm: '开始新对话？当前对话会从窗口中清空。',
      newChatBusyConfirm: '模型还在回答。开始新对话会停止当前回答并清空对话，继续吗？',
      requestFailed: '操作失败：{error}',
    },
    en: {
      newChat: 'New chat',
      minimize: 'Minimize',
      close: 'Close',
      model: 'Model',
      manageModels: 'Add model',
      modelGroupOpenAI: 'OpenAI-compatible',
      modelGroupAnthropic: 'Anthropic',
      modelGroupReasoning: 'Reasoning',
      noModelWarning: 'No models yet. Use “Add model” above to connect an endpoint.',
      reasoning: 'Reasoning',
      welcomeTitle: 'Chat with Lilith',
      welcomeBody: 'Pick a model and start. Replies stream in, and reasoning models also show their thinking.',
      hintModel: 'Switch models anytime',
      hintTypes: 'OpenAI · Anthropic · Reasoning',
      hintEnter: 'Enter to send',
      placeholder: 'Say something to Lilith…',
      send: 'Send',
      stop: 'Stop',
      enterHint: 'Enter to send · Shift+Enter for a new line',
      working: 'The model is replying…',
      connecting: 'Connecting to the model…',
      thinking: 'Thinking…',
      stopping: 'Stopping…',
      ready: 'Ready',
      noModel: 'No models yet',
      done: 'Done',
      stopped: 'Stopped',
      failed: 'Something went wrong',
      errorPrefix: 'Error: ',
      interrupted: 'Interrupted.',
      emptyReply: '(no text returned)',
      busySend: 'The previous turn is still running. Wait or press Stop.',
      emptySend: 'Say something first.',
      tooLong: 'That message is too long — trim it a little.',
      invalidModel: 'That model no longer exists. Pick another one.',
      manageFailed: 'Could not open the add-model page: {error}',
      newChatConfirm: 'Start a new chat? The current conversation will be cleared from the window.',
      newChatBusyConfirm: 'The model is still replying. Starting a new chat will stop it and clear the conversation. Continue?',
      requestFailed: 'Action failed: {error}',
    },
  };

  const bodyClass = window.lilithChat.platform === 'darwin' ? 'darwin' : 'other';
  document.body.classList.add(bodyClass);

  const messagesEl = document.getElementById('messages');
  const welcomeEl = document.getElementById('welcome');
  const modelSel = document.getElementById('model');
  const manageModelsBtn = document.getElementById('manage-models');
  const modelWarning = document.getElementById('model-warning');
  const newChatBtn = document.getElementById('newchat');
  const minimizeBtn = document.getElementById('minimize');
  const closeBtn = document.getElementById('closewin');
  const spinner = document.getElementById('spinner');
  const statusText = document.getElementById('status-text');
  const statusbar = document.getElementById('statusbar');
  const stopBtn = document.getElementById('stop');
  const input = document.getElementById('input');
  const sendBtn = document.getElementById('send');

  let lang = 'zh';
  let state = {
    model: '',
    modelEntries: [],
    messages: [],
    busy: false,
    draft: null,
  };
  let draftNode = null;
  let draftTextEl = null;
  let draftThinkEl = null;
  let draftReasonEl = null;
  let draftReasonTextEl = null;
  let statusResetTimer = null;
  let forceScroll = false;
  let draftQueued = false;

  const t = (key) => (LABELS[lang] && LABELS[lang][key]) || LABELS.zh[key] || key;
  const fill = (template, vars) => String(template).replace(/\{(\w+)\}/g, (_m, k) => (vars && k in vars ? vars[k] : `{${k}}`));

  function setStatus(text, kind) {
    clearTimeout(statusResetTimer);
    statusText.textContent = text || '';
    statusbar.classList.toggle('error', kind === 'error');
    if (kind === 'transient') {
      statusResetTimer = setTimeout(() => {
        if (!state.busy) {
          statusText.textContent = state.modelEntries.length ? t('ready') : t('noModel');
          statusbar.classList.remove('error');
        }
      }, 5000);
    }
  }

  function hasModel() {
    return state.modelEntries.length > 0;
  }

  function setStaticTexts() {
    document.title = 'Lilith · Chat';
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
    input.placeholder = t('placeholder');
  }

  function setLang(nextLang) {
    lang = nextLang === 'en' ? 'en' : 'zh';
    document.documentElement.lang = lang === 'zh' ? 'zh-CN' : 'en';
    setStaticTexts();
    renderModelOptions(state.modelEntries, state.model);
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
    const groups = { openai: [], anthropic: [], reasoning: [] };
    list.forEach((entry) => {
      const type = entry.type === 'anthropic' || entry.type === 'reasoning' ? entry.type : 'openai';
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
        option.textContent = entry.label || entry.value || '—';
        option.title = entry.model || entry.label || '';
        option.selected = entry.value === current;
        group.appendChild(option);
      });
      modelSel.appendChild(group);
    };
    addGroup(t('modelGroupOpenAI'), groups.openai);
    addGroup(t('modelGroupAnthropic'), groups.anthropic);
    addGroup(t('modelGroupReasoning'), groups.reasoning);
    if (!list.length) {
      const option = document.createElement('option');
      option.value = '';
      option.textContent = '—';
      modelSel.appendChild(option);
    }
    modelSel.disabled = state.busy || !list.length;
  }

  function makeMeta(message) {
    const meta = document.createElement('div');
    meta.className = 'msg-meta';
    const parts = [];
    if (message.model) parts.push(message.model);
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
    avatar.textContent = 'L';
    const body = document.createElement('div');
    body.className = 'assistant-body';

    if (message.reasoning) body.appendChild(makeReasoningElement(message.reasoning, false));

    const textEl = document.createElement('div');
    textEl.className = 'assistant-text';
    if (message.text) renderRichText(textEl, message.text, false);
    else if (!message.error) textEl.textContent = t('emptyReply');
    body.appendChild(textEl);

    if (message.error && message.errorText) {
      const note = document.createElement('div');
      note.className = 'error-note';
      note.textContent = t('errorPrefix') + message.errorText;
      body.appendChild(note);
    } else if (message.interrupted) {
      const note = document.createElement('div');
      note.className = 'interrupted-note';
      note.textContent = t('interrupted');
      body.appendChild(note);
    }
    if (message.model || Number.isFinite(message.durationMs)) body.appendChild(makeMeta(message));
    row.append(avatar, body);
    return row;
  }

  function makeDraftElement(draft) {
    const row = document.createElement('div');
    row.className = 'msg assistant draft';
    const avatar = document.createElement('div');
    avatar.className = 'avatar';
    avatar.textContent = 'L';
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
    const thinkEl = document.createElement('div');
    thinkEl.className = 'thinking-line';

    body.append(reasoningEl, textEl, thinkEl);
    row.append(avatar, body);

    draftNode = row;
    draftTextEl = textEl;
    draftThinkEl = thinkEl;
    draftReasonEl = reasoningEl;
    draftReasonTextEl = reasoningText;
    updateDraftReasoning(draft);
    updateDraftText(draft);
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

  function updateDraftThinking(draft) {
    if (!draftThinkEl) return;
    const thinking = !!(draft && draft.thinking);
    const hasReasoning = !!(draft && draft.reasoning);
    const empty = !draft || !draft.text;
    draftThinkEl.hidden = hasReasoning || (!thinking && !empty);
    if (draftThinkEl.hidden) return;
    draftThinkEl.textContent = '';
    const dots = document.createElement('span');
    dots.className = 'thinking-dots';
    dots.append(document.createElement('i'), document.createElement('i'), document.createElement('i'));
    const label = document.createElement('span');
    label.textContent = thinking ? t('thinking') : t('connecting');
    draftThinkEl.append(dots, label);
  }

  function renderAll() {
    const stick = forceScroll || nearBottom();
    forceScroll = false;
    draftNode = null;
    draftTextEl = null;
    draftThinkEl = null;
    draftReasonEl = null;
    draftReasonTextEl = null;
    messagesEl.querySelectorAll(':scope > .msg').forEach((el) => el.remove());
    state.messages.forEach((message) => messagesEl.appendChild(makeMessageElement(message)));

    const hasDraft = state.busy;
    welcomeEl.classList.toggle('hidden', state.messages.length > 0 || hasDraft);
    if (hasDraft) {
      const draft = state.draft || { text: '', reasoning: '', thinking: false };
      messagesEl.appendChild(makeDraftElement(draft));
    }
    updateChrome();
    scrollToBottom(stick);
  }

  function updateChrome() {
    const busy = !!state.busy;
    const models = hasModel();
    modelSel.disabled = busy || !models;
    modelWarning.hidden = models;
    stopBtn.hidden = !busy;
    spinner.hidden = !busy;
    if (busy) {
      setStatus(state.draft && state.draft.thinking ? t('thinking') : t('working'));
    } else if (statusbar.classList.contains('error')) {
      // keep the error visible
    } else if (!models) {
      setStatus(t('noModel'));
    } else if (/^(就绪|Ready|还没有添加模型|No models yet)$/.test(statusText.textContent || '')) {
      setStatus(t('ready'));
    }
    sendBtn.disabled = busy || !models || !input.value.trim();
  }

  // ------------------------------------------------------------- state sync
  function applyState(next) {
    if (!next) return;
    state = {
      model: next.model || '',
      modelEntries: Array.isArray(next.modelEntries) ? next.modelEntries : [],
      messages: Array.isArray(next.messages) ? next.messages : [],
      busy: !!next.busy,
      draft: next.draft || null,
    };
    renderModelOptions(state.modelEntries, state.model);
    renderAll();
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
    if (!state.draft) state.draft = { text: '', reasoning: '', thinking: false };
    state.draft.text = event.text || '';
    if (typeof event.reasoning === 'string') state.draft.reasoning = event.reasoning;
    if (typeof event.thinking === 'boolean') state.draft.thinking = event.thinking;
    if (!draftNode) {
      welcomeEl.classList.add('hidden');
      messagesEl.appendChild(makeDraftElement(state.draft));
    }
    scheduleDraftPaint();
    if (state.draft.thinking) setStatus(t('thinking'));
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
          if (event.value) setStatus(t('thinking'));
        }
        break;
      case 'run-status':
        if (event.status === 'stopping') setStatus(t('stopping'));
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
    sendBtn.disabled = state.busy || !hasModel() || !input.value.trim();
  }

  function sendErrorText(code) {
    switch (code) {
      case 'busy': return t('busySend');
      case 'empty': return t('emptySend');
      case 'too-long': return t('tooLong');
      case 'invalid-model': return t('invalidModel');
      case 'no-model': return t('noModel');
      default: return fill(t('requestFailed'), { error: code || 'unknown' });
    }
  }

  async function submit() {
    if (state.busy || !hasModel()) return;
    const text = input.value.trim();
    if (!text) return;
    let result;
    try {
      result = await window.lilithChat.send(text);
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
      await window.lilithChat.stop();
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
      const result = await window.lilithChat.newChat();
      if (result && result.state) applyState(result.state);
      input.focus();
    } catch (error) {
      setStatus(fill(t('requestFailed'), { error: String((error && error.message) || error) }), 'error');
    }
  }

  async function onModelChange() {
    const value = modelSel.value;
    if (!value) return;
    const result = await window.lilithChat.setModel(value).catch(() => null);
    if (result && result.ok) {
      if (result.state) applyState(result.state);
      return;
    }
    setStatus(sendErrorText(result && result.error), 'error');
    renderModelOptions(state.modelEntries, state.model);
  }

  async function openModelsPage() {
    try {
      const result = await window.lilithChat.openModels();
      if (result && result.ok === false) {
        setStatus(fill(t('manageFailed'), { error: result.error || 'unknown' }), 'error');
      }
    } catch (error) {
      setStatus(fill(t('manageFailed'), { error: String((error && error.message) || error) }), 'error');
    }
  }

  // ------------------------------------------------------------- wiring
  newChatBtn.addEventListener('click', newChat);
  minimizeBtn.addEventListener('click', () => window.lilithChat.minimize());
  closeBtn.addEventListener('click', () => window.lilithChat.close());
  manageModelsBtn.addEventListener('click', (event) => {
    event.preventDefault();
    event.stopPropagation();
    openModelsPage();
  });
  stopBtn.addEventListener('click', stopRun);
  modelSel.addEventListener('change', onModelChange);
  sendBtn.addEventListener('click', submit);

  input.addEventListener('input', resizeInput);
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) {
      e.preventDefault();
      submit();
    }
  });

  window.lilithChat.onEvent(handleEvent);

  (async () => {
    resizeInput();
    try {
      const [initial, info] = await Promise.all([
        window.lilithChat.getState(),
        window.lilithChat.getLang().catch(() => null),
      ]);
      if (info && info.lang) lang = info.lang === 'en' ? 'en' : 'zh';
      document.documentElement.lang = lang === 'zh' ? 'zh-CN' : 'en';
      if (initial) applyState(initial);
      setLang(lang);
      setStatus(hasModel() ? t('ready') : t('noModel'));
    } catch (error) {
      setStatus(fill(t('requestFailed'), { error: String((error && error.message) || error) }), 'error');
    }
    input.focus();
  })();
})();
