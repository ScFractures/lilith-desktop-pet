/* Chat window renderer. All state lives in main; this file only reflects events. */
(() => {
  const LABELS = {
    zh: {
      newChat: '新对话',
      history: '历史',
      historyTitle: '历史对话',
      closeHistory: '收起',
      searchHistory: '搜索标题或消息…',
      noHistoryResults: '没有找到匹配的对话',
      historySavedLocally: '对话自动保存在本机',
      untitledConversation: '未命名对话',
      emptyConversation: '还没有消息',
      messageCount: '{n} 条消息',
      renameConversation: '重命名对话',
      generateTitle: 'AI 起标题',
      titleGenerating: '正在生成标题…',
      titleFailed: '生成标题失败，请稍后再试。',
      deleteConversation: '删除对话',
      conversationName: '对话名称',
      cancel: '取消',
      save: '保存',
      deleteConversationConfirm: '确定删除「{title}」？此操作不可撤销。',
      deleteBusyConfirm: '此对话仍在运行，删除会停止当前任务。确定删除「{title}」？此操作不可撤销。',
      switchBusyConfirm: '模型还在运行。切换对话会停止当前任务，并保存已生成内容。继续吗？',
      conversationMissing: '这条对话已不存在，请重新选择。',
      invalidTitle: '请输入对话名称。',
      historySaveFailed: '对话保存失败，请检查磁盘空间和应用数据目录权限。',
      minimize: '最小化',
      close: '关闭',
      model: '模型',
      manageModels: '添加模型',
      mode: '模式',
      modelGroupOpenAI: 'OpenAI 兼容',
      modelGroupAnthropic: 'Anthropic',
      responsesSuffix: ' · Responses',
      reasoningSuffix: ' · 推理',
      toolsSuffix: ' · 工具',
      noModelWarning: '还没有添加模型。点上面的「添加模型」填写接口信息。',
      toolsWarning: '工具已启用：模型可以访问工作目录里的文件；权限由模式和目录控制。',
      toolsWarningFull: '完全访问：终端命令会直接执行，请确认工作目录正确。',
      reasoning: '思考过程',
      toolCalls: '工具调用',
      toolInput: '输入',
      toolResult: '结果',
      toolRunning: '运行中',
      toolFailed: '{n} 个失败',
      welcomeTitle: '和莉莉丝聊天',
      welcomeBody: '选一个模型，直接开始。回复会以流式出现，思考型模型还会显示思考过程。',
      hintModel: '模型可随时切换',
      hintTypes: 'OpenAI · Anthropic · Reasoning',
      hintEnter: 'Enter 发送',
      placeholder: '和莉莉丝说点什么…',
      attachFiles: '添加文件',
      removeFile: '移除文件',
      attachTooMany: '最多添加 {n} 个文件。',
      attachReadFailed: '无法读取「{name}」。',
      attachNotFile: '「{name}」不是文件。',
      attachExpired: '附件已失效，请重新添加。',
      attachAdded: '已添加 {n} 个文件。',
      filePages: '{n} 页',
      fileTruncated: '文本预览已截断',
      fileTooMany: '附件数量超过上限。',
      invalidFile: '附件格式无效。',
      emptyFile: '附件是空文件。',
      send: '发送',
      interject: '插嘴',
      stop: '停止',
      enterHint: 'Enter 发送 · Shift+Enter 换行',
      interjectHint: 'Enter 插嘴 · 会先停止当前输出',
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
      timeoutError: '请求超时，请稍后重试。',
      abortedError: '请求已取消。',
      errorToolRoundLimit: '工具调用轮次过多，已停止。',
      errorToolCallLimit: '工具调用次数过多，已停止。',
      interrupted: '已中断。',
      emptyReply: '（没有返回文本）',
      busySend: '上一条还在进行，先等它结束或点停止。',
      emptySend: '先说点什么吧。',
      tooLong: '这段话太长了，精简一点。',
      invalidModel: '这个模型已不存在，请重新选择。',
      manageFailed: '打开添加模型页面失败：{error}',
      newChatBusyConfirm: '模型还在回答。开始新对话会停止当前回答，当前对话会保留在历史中。继续吗？',
      workspaceConfirm: '切换工作目录会开始新对话，当前对话会保留在历史中。继续吗？',
      requestFailed: '操作失败：{error}',
    },
    en: {
      newChat: 'New chat',
      history: 'History',
      historyTitle: 'Conversations',
      closeHistory: 'Hide',
      searchHistory: 'Search titles or messages…',
      noHistoryResults: 'No matching conversations',
      historySavedLocally: 'Conversations saved on this device',
      untitledConversation: 'Untitled conversation',
      emptyConversation: 'No messages yet',
      messageCount: '{n} messages',
      renameConversation: 'Rename conversation',
      generateTitle: 'Suggest a title',
      titleGenerating: 'Generating title…',
      titleFailed: 'Could not generate a title. Try again later.',
      deleteConversation: 'Delete conversation',
      conversationName: 'Conversation name',
      cancel: 'Cancel',
      save: 'Save',
      deleteConversationConfirm: 'Delete “{title}”? This cannot be undone.',
      deleteBusyConfirm: 'This conversation is still running. Deleting it will stop the task. Delete “{title}”? This cannot be undone.',
      switchBusyConfirm: 'The model is still running. Switching conversations stops the task and saves the partial reply. Continue?',
      conversationMissing: 'That conversation no longer exists. Pick another one.',
      invalidTitle: 'Enter a conversation name.',
      historySaveFailed: 'Could not save the conversation. Check disk space and application-data permissions.',
      minimize: 'Minimize',
      close: 'Close',
      model: 'Model',
      mode: 'Mode',
      manageModels: 'Add model',
      modelGroupOpenAI: 'OpenAI-compatible',
      modelGroupAnthropic: 'Anthropic',
      responsesSuffix: ' · Responses',
      reasoningSuffix: ' · Reasoning',
      toolsSuffix: ' · Tools',
      noModelWarning: 'No models yet. Use “Add model” above to connect an endpoint.',
      toolsWarning: 'Tools are on: the model can access files in the workspace; the mode and folder set the limits.',
      toolsWarningFull: 'Full access: terminal commands run immediately — make sure the workspace is correct.',
      reasoning: 'Reasoning',
      toolCalls: 'Tool calls',
      toolInput: 'Input',
      toolResult: 'Result',
      toolRunning: 'running',
      toolFailed: '{n} failed',
      welcomeTitle: 'Chat with Lilith',
      welcomeBody: 'Pick a model and start. Replies stream in, and reasoning models also show their thinking.',
      hintModel: 'Switch models anytime',
      hintTypes: 'OpenAI · Anthropic · Reasoning',
      hintEnter: 'Enter to send',
      placeholder: 'Say something to Lilith…',
      attachFiles: 'Attach files',
      removeFile: 'Remove file',
      attachTooMany: 'You can attach up to {n} files.',
      attachReadFailed: 'Could not read “{name}”.',
      attachNotFile: '“{name}” is not a file.',
      attachExpired: 'The attachment expired. Add it again.',
      attachAdded: 'Attached {n} file(s).',
      filePages: '{n} pages',
      fileTruncated: 'Text preview truncated',
      fileTooMany: 'Too many attachments.',
      invalidFile: 'Invalid attachment.',
      emptyFile: 'The attachment is empty.',
      send: 'Send',
      interject: 'Interject',
      stop: 'Stop',
      enterHint: 'Enter to send · Shift+Enter for a new line',
      interjectHint: 'Enter to interject · stops the current output',
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
      timeoutError: 'The request timed out. Try again.',
      abortedError: 'The request was canceled.',
      errorToolRoundLimit: 'Too many tool rounds; the run was stopped.',
      errorToolCallLimit: 'Too many tool calls; the run was stopped.',
      interrupted: 'Interrupted.',
      emptyReply: '(no text returned)',
      busySend: 'The previous turn is still running. Wait or press Stop.',
      emptySend: 'Say something first.',
      tooLong: 'That message is too long — trim it a little.',
      invalidModel: 'That model no longer exists. Pick another one.',
      manageFailed: 'Could not open the add-model page: {error}',
      newChatBusyConfirm: 'The model is still replying. A new chat stops it and keeps this conversation in history. Continue?',
      workspaceConfirm: 'Switching workspace starts a new chat and keeps this conversation in history. Continue?',
      requestFailed: 'Action failed: {error}',
    },
  };

  const bodyClass = window.lilithChat.platform === 'darwin' ? 'darwin' : 'other';
  document.body.classList.add(bodyClass);

  const messagesEl = document.getElementById('messages');
  const welcomeEl = document.getElementById('welcome');
  const modelSel = document.getElementById('model');
  const modeSel = document.getElementById('mode');
  const manageModelsBtn = document.getElementById('manage-models');
  const workspaceBtn = document.getElementById('workspace');
  const workspaceName = document.getElementById('workspace-name');
  const workspacePath = document.getElementById('workspace-path');
  const modelWarning = document.getElementById('model-warning');
  const toolsWarning = document.getElementById('tools-warning');
  const toolsWarningText = document.getElementById('tools-warning-text');
  const newChatBtn = document.getElementById('newchat');
  const historyToggle = document.getElementById('history-toggle');
  const historyPanel = document.getElementById('history-panel');
  const historyClose = document.getElementById('history-close');
  const historyScrim = document.getElementById('history-scrim');
  const historyList = document.getElementById('history-list');
  const historySearch = document.getElementById('history-search');
  const historyEmpty = document.getElementById('history-empty');
  const historyCount = document.getElementById('history-count');
  const conversationTitle = document.getElementById('conversation-title');
  const conversationCount = document.getElementById('conversation-count');
  const renameDialog = document.getElementById('rename-dialog');
  const renameForm = document.getElementById('rename-form');
  const renameInput = document.getElementById('rename-input');
  const renameSave = document.getElementById('rename-save');
  const minimizeBtn = document.getElementById('minimize');
  const closeBtn = document.getElementById('closewin');
  const spinner = document.getElementById('spinner');
  const statusText = document.getElementById('status-text');
  const statusbar = document.getElementById('statusbar');
  const stopBtn = document.getElementById('stop');
  const input = document.getElementById('input');
  const sendBtn = document.getElementById('send');
  const sendLabel = sendBtn.querySelector('[data-i18n]');
  const enterHintEl = document.querySelector('.composer-foot [data-i18n="enterHint"]');
  const attachBtn = document.getElementById('attach');
  const attachmentList = document.getElementById('attachment-list');

  let lang = 'zh';
  let state = {
    conversationId: null,
    conversationTitle: '',
    conversations: [],
    inputDraft: '',
    model: '',
    modelEntries: [],
    mode: 'read',
    workspace: '',
    modes: [],
    tools: false,
    messages: [],
    busy: false,
    draft: null,
  };
  let draftNode = null;
  let draftTextEl = null;
  let draftToolsEl = null;
  let draftTools = [];
  let draftThinkEl = null;
  let draftReasonEl = null;
  let draftReasonTextEl = null;
  let statusResetTimer = null;
  let forceScroll = false;
  let draftQueued = false;
  let submitting = false;
  let historyOpen = window.innerWidth >= 760;
  let historyResults = null;
  let historySearchTimer = null;
  let searchRevision = 0;
  let changingConversation = false;
  let renamingId = null;
  const titleBusy = new Set();
  const inputDrafts = new Map();
  let inputDraftTimer = null;
  let inputDraftWrite = Promise.resolve();
  const MAX_FILES = 10;
  let pendingFiles = [];
  let attaching = false;

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

  function basename(p) {
    if (!p) return '~';
    const parts = String(p).split(/[\\/]/).filter(Boolean);
    return parts[parts.length - 1] || p;
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
    historyToggle.title = t('historyTitle');
    historyPanel.setAttribute('aria-label', t('historyTitle'));
    historyList.setAttribute('aria-label', t('historyTitle'));
    historySearch.setAttribute('aria-label', t('searchHistory'));
    historyScrim.setAttribute('aria-label', t('closeHistory'));
    manageModelsBtn.title = t('manageModels');
    minimizeBtn.title = t('minimize');
    closeBtn.title = t('close');
    input.placeholder = t('placeholder');
    attachBtn.title = t('attachFiles');
    attachBtn.setAttribute('aria-label', t('attachFiles'));
  }

  function formatFileSize(bytes) {
    const n = Number(bytes);
    if (!Number.isFinite(n) || n <= 0) return '0 B';
    if (n < 1024) return `${n} B`;
    if (n < 1024 * 1024) {
      const kb = n / 1024;
      return `${kb < 10 ? kb.toFixed(1) : Math.round(kb)} KB`;
    }
    return `${(n / (1024 * 1024)).toFixed(1)} MB`;
  }

  function fileTitle(file) {
    const meta = [String(file.kind || 'file').toUpperCase(), formatFileSize(file.size)];
    if (Number.isFinite(file.pages) && file.pages > 0) meta.push(fill(t('filePages'), { n: file.pages }));
    const lines = [file.name, meta.join(' · ')];
    if (file.truncated) lines.push(t('fileTruncated'));
    if (file.note) lines.push(file.note);
    return lines.join('\n');
  }

  function fileBadge(file) {
    return String(file.kind || 'file').toUpperCase().slice(0, 5);
  }

  function makeFileChip(file, { removable = false, index = -1 } = {}) {
    const chip = document.createElement('span');
    chip.className = removable ? 'attachment-chip' : 'bubble-file';
    chip.title = fileTitle(file);
    const kind = document.createElement('span');
    kind.className = removable ? 'attachment-kind' : 'bubble-file-kind';
    kind.textContent = fileBadge(file);
    const name = document.createElement('span');
    name.className = removable ? 'attachment-name' : 'bubble-file-name';
    name.textContent = file.name;
    const size = document.createElement('span');
    size.className = removable ? 'attachment-size' : 'bubble-file-size';
    size.textContent = formatFileSize(file.size);
    chip.append(kind, name, size);
    if (removable) {
      const remove = document.createElement('button');
      remove.type = 'button';
      remove.className = 'attachment-remove';
      remove.textContent = '×';
      remove.title = t('removeFile');
      remove.setAttribute('aria-label', `${t('removeFile')}: ${file.name}`);
      remove.addEventListener('click', () => removeAttachmentAt(index));
      chip.appendChild(remove);
    }
    return chip;
  }

  function renderAttachments() {
    attachmentList.textContent = '';
    attachmentList.hidden = !pendingFiles.length;
    pendingFiles.forEach((file, index) => {
      attachmentList.appendChild(makeFileChip(file, { removable: true, index }));
    });
    attachBtn.disabled = attaching || changingConversation || pendingFiles.length >= MAX_FILES;
    resizeInput();
  }

  function clearAttachments() {
    if (!pendingFiles.length) return;
    pendingFiles = [];
    renderAttachments();
  }

  async function removeAttachmentAt(index) {
    const file = pendingFiles[index];
    if (!file) return;
    pendingFiles.splice(index, 1);
    renderAttachments();
    if (!file.id) return;
    try {
      const result = await window.lilithChat.removeAttachment(file.id);
      if (result && Array.isArray(result.files)) {
        pendingFiles = result.files;
        renderAttachments();
      }
    } catch {}
  }

  function attachmentErrorText(error) {
    if (!error) return t('invalidFile');
    switch (error.code) {
      case 'too-many-files': return fill(t('attachTooMany'), { n: MAX_FILES });
      case 'not-a-file': return fill(t('attachNotFile'), { name: error.name || '' });
      case 'unreadable-file': return fill(t('attachReadFailed'), { name: error.name || '' });
      default: return fill(t('requestFailed'), { error: error.code || t('invalidFile') });
    }
  }

  async function chooseAttachments() {
    if (attachBtn.disabled || attaching) return;
    const before = pendingFiles.length;
    let firstError = null;
    attaching = true;
    attachBtn.disabled = true;
    try {
      let result;
      try {
        result = await window.lilithChat.attachFiles();
      } catch (error) {
        setStatus(fill(t('requestFailed'), { error: String((error && error.message) || error) }), 'error');
        return;
      }
      if (!result || result.ok === false) {
        if (result && result.error !== 'canceled') setStatus(sendErrorText(result.error), 'error');
        return;
      }
      pendingFiles = Array.isArray(result.files) ? result.files : pendingFiles;
      const errors = Array.isArray(result.errors) ? result.errors : [];
      if (errors.length) firstError = attachmentErrorText(errors[0]);
    } finally {
      attaching = false;
      renderAttachments();
    }
    if (firstError) setStatus(firstError, 'error');
    else if (pendingFiles.length > before) setStatus(fill(t('attachAdded'), { n: pendingFiles.length - before }), 'transient');
  }

  function setLang(nextLang) {
    lang = nextLang === 'en' ? 'en' : 'zh';
    document.documentElement.lang = lang === 'zh' ? 'zh-CN' : 'en';
    setStaticTexts();
    renderModelOptions(state.modelEntries, state.model);
    renderModeOptions(state.modes, state.mode);
    renderAll();
  }

  function setHistoryOpen(open) {
    historyOpen = !!open;
    document.getElementById('app').classList.toggle('history-open', historyOpen);
    historyToggle.setAttribute('aria-expanded', String(historyOpen));
    historyPanel.inert = !historyOpen;
  }

  function formatHistoryDate(value) {
    if (!Number.isFinite(value) || value <= 0) return '';
    return new Intl.DateTimeFormat(lang === 'zh' ? 'zh-CN' : 'en', {
      month: 'short', day: 'numeric',
    }).format(new Date(value));
  }

  function renderHistory() {
    const query = historySearch.value.trim();
    const entries = query && historyResults !== null ? historyResults : state.conversations;
    historyList.textContent = '';
    historyEmpty.hidden = entries.length > 0;
    historyCount.textContent = query ? `${entries.length} / ${state.conversations.length}` : String(entries.length);
    entries.forEach((conversation) => {
      const item = document.createElement('div');
      item.className = 'history-item';
      item.dataset.conversationId = conversation.id;
      const selected = conversation.id === state.conversationId;
      item.classList.toggle('active', selected);
      const select = document.createElement('button');
      select.type = 'button';
      select.className = 'history-select';
      select.disabled = changingConversation;
      if (selected) select.setAttribute('aria-current', 'true');
      const title = conversation.title || t('untitledConversation');
      select.title = `${title}\n${conversation.workspace || ''}`;
      const name = document.createElement('span');
      name.className = 'history-item-title';
      name.textContent = title;
      const preview = document.createElement('span');
      preview.className = 'history-preview';
      preview.textContent = conversation.preview || t('emptyConversation');
      const meta = document.createElement('span');
      meta.className = 'history-meta';
      const model = document.createElement('span');
      model.className = 'history-model';
      model.textContent = conversation.modelLabel || conversation.model || '';
      const date = document.createElement('time');
      date.textContent = formatHistoryDate(conversation.updatedAt);
      if (conversation.updatedAt) date.dateTime = new Date(conversation.updatedAt).toISOString();
      date.title = new Date(conversation.updatedAt || Date.now()).toLocaleString(lang === 'zh' ? 'zh-CN' : 'en');
      meta.append(model, date);
      select.append(name, preview, meta);
      select.addEventListener('click', () => switchConversation(conversation.id));
      const actions = document.createElement('div');
      actions.className = 'history-actions';
      const suggest = document.createElement('button');
      suggest.type = 'button';
      suggest.className = 'history-action';
      suggest.textContent = '✦';
      suggest.title = t('generateTitle');
      suggest.setAttribute('aria-label', `${t('generateTitle')}: ${title}`);
      suggest.disabled = changingConversation || titleBusy.has(conversation.id) || !conversation.messageCount;
      suggest.addEventListener('click', () => suggestTitle(conversation, suggest));
      const rename = document.createElement('button');
      rename.type = 'button';
      rename.className = 'history-action';
      rename.textContent = '✎';
      rename.title = t('renameConversation');
      rename.setAttribute('aria-label', `${t('renameConversation')}: ${title}`);
      rename.disabled = changingConversation;
      rename.addEventListener('click', () => openRename(conversation));
      const remove = document.createElement('button');
      remove.type = 'button';
      remove.className = 'history-action';
      remove.textContent = '×';
      remove.title = t('deleteConversation');
      remove.setAttribute('aria-label', `${t('deleteConversation')}: ${title}`);
      remove.disabled = changingConversation;
      remove.addEventListener('click', () => deleteConversation(conversation));
      actions.append(suggest, rename, remove);
      item.append(select, actions);
      historyList.appendChild(item);
    });
  }

  function refreshHistorySearch() {
    clearTimeout(historySearchTimer);
    const revision = ++searchRevision;
    const query = historySearch.value.trim();
    if (!query) {
      historyResults = null;
      renderHistory();
      return;
    }
    historySearchTimer = setTimeout(async () => {
      try {
        const entries = await window.lilithChat.listConversations(query);
        if (revision !== searchRevision) return;
        historyResults = Array.isArray(entries) ? entries : [];
        renderHistory();
      } catch (error) {
        if (revision === searchRevision) setStatus(fill(t('requestFailed'), { error: String(error.message || error) }), 'error');
      }
    }, 150);
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
    const groups = { openai: [], anthropic: [] };
    list.forEach((entry) => {
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
        let suffix = entry.api === 'responses' ? t('responsesSuffix') : (entry.effort ? t('reasoningSuffix') : '');
        if (entry.tools) suffix += t('toolsSuffix');
        option.textContent = `${entry.label || entry.value || '—'}${suffix}`;
        option.title = entry.model || entry.label || '';
        option.selected = entry.value === current;
        group.appendChild(option);
      });
      modelSel.appendChild(group);
    };
    addGroup(t('modelGroupOpenAI'), groups.openai);
    addGroup(t('modelGroupAnthropic'), groups.anthropic);
    if (!list.length) {
      const option = document.createElement('option');
      option.value = '';
      option.textContent = '—';
      modelSel.appendChild(option);
    }
    modelSel.disabled = state.busy || !list.length;
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
    if (!list.length) {
      const option = document.createElement('option');
      option.value = current || '';
      option.textContent = current || '—';
      modeSel.appendChild(option);
    }
    const active = list.find((mode) => mode.key === current);
    modeSel.title = active && active.hint ? (active.hint[lang] || active.hint.zh || '') : '';
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

  function localizedError(text) {
    const value = String(text || '');
    if (value === 'timeout' || value === '请求超时') return t('timeoutError');
    if (value === 'aborted' || value === '请求已取消') return t('abortedError');
    if (value === 'tool-round-limit') return t('errorToolRoundLimit');
    if (value === 'tool-call-limit') return t('errorToolCallLimit');
    return value;
  }

  function makeMessageElement(message) {
    const row = document.createElement('div');
    row.className = `msg ${message.role}`;
    if (message.role === 'user') {
      const stack = document.createElement('div');
      stack.className = 'user-stack';
      if (message.text) {
        const bubble = document.createElement('div');
        bubble.className = 'bubble';
        bubble.textContent = message.text;
        stack.appendChild(bubble);
      }
      const files = Array.isArray(message.files) ? message.files : [];
      if (files.length) {
        const list = document.createElement('div');
        list.className = 'bubble-files';
        files.forEach((file) => list.appendChild(makeFileChip(file)));
        stack.appendChild(list);
      }
      row.appendChild(stack);
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
    else if (!(message.tools && message.tools.length) && !message.error) textEl.textContent = t('emptyReply');
    body.appendChild(textEl);

    if (message.tools && message.tools.length) {
      body.appendChild(makeToolsGroup(message.tools));
    }

    if (message.error && message.errorText) {
      const note = document.createElement('div');
      note.className = 'error-note';
      note.textContent = t('errorPrefix') + localizedError(message.errorText);
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
    label.textContent = thinking ? t('thinking') : t('connecting');
    draftThinkEl.append(dots, label);
  }

  function renderAll() {
    const stick = forceScroll || nearBottom();
    forceScroll = false;
    draftNode = null;
    draftTextEl = null;
    draftToolsEl = null;
    draftTools = [];
    draftThinkEl = null;
    draftReasonEl = null;
    draftReasonTextEl = null;
    messagesEl.querySelectorAll(':scope > .msg').forEach((el) => el.remove());
    state.messages.forEach((message) => messagesEl.appendChild(makeMessageElement(message)));

    const hasDraft = state.busy;
    welcomeEl.classList.toggle('hidden', state.messages.length > 0 || hasDraft);
    if (hasDraft) {
      const draft = state.draft || { text: '', reasoning: '', thinking: false, tools: [] };
      messagesEl.appendChild(makeDraftElement(draft));
    }
    updateChrome();
    renderHistory();
    scrollToBottom(stick);
  }

  function updateChrome() {
    const busy = !!state.busy;
    const models = hasModel();
    const tools = !!state.tools;
    newChatBtn.disabled = changingConversation;
    conversationTitle.textContent = state.conversationTitle || t('newChat');
    conversationTitle.title = conversationTitle.textContent;
    conversationCount.textContent = fill(t('messageCount'), { n: state.messages.length });
    modelSel.disabled = busy || changingConversation || !models;
    modeSel.disabled = busy || changingConversation || !tools;
    workspaceBtn.disabled = busy || changingConversation || !tools;
    workspaceName.textContent = basename(state.workspace);
    workspaceBtn.title = state.workspace || '';
    workspacePath.textContent = state.workspace || '';
    toolsWarning.hidden = !tools;
    if (tools) {
      toolsWarningText.textContent = state.mode === 'full' ? t('toolsWarningFull') : t('toolsWarning');
      toolsWarning.classList.toggle('danger', state.mode === 'full');
    }
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
    attachBtn.disabled = attaching || changingConversation || pendingFiles.length >= MAX_FILES;
    sendBtn.disabled = changingConversation || !models || (!input.value.trim() && !pendingFiles.length);
    sendBtn.classList.toggle('interjecting', busy);
    sendLabel.textContent = busy ? t('interject') : t('send');
    enterHintEl.textContent = busy ? t('interjectHint') : t('enterHint');
  }

  // ------------------------------------------------------------- state sync
  function applyState(next) {
    if (!next) return;
    const changed = next.conversationId !== state.conversationId;
    if (changed && state.conversationId) inputDrafts.set(state.conversationId, input.value);
    const modelEntries = Array.isArray(next.modelEntries) ? next.modelEntries : [];
    const selected = modelEntries.find((entry) => entry.value === next.model);
    state = {
      conversationId: next.conversationId || null,
      conversationTitle: next.conversationTitle || '',
      conversations: Array.isArray(next.conversations) ? next.conversations : state.conversations,
      inputDraft: typeof next.inputDraft === 'string' ? next.inputDraft : '',
      model: next.model || '',
      modelEntries,
      mode: next.mode || state.mode || 'read',
      workspace: next.workspace || '',
      modes: Array.isArray(next.modes) && next.modes.length ? next.modes : state.modes,
      tools: typeof next.tools === 'boolean' ? next.tools : !!(selected && selected.tools),
      messages: Array.isArray(next.messages) ? next.messages : [],
      busy: !!next.busy,
      draft: next.draft || null,
    };
    if (changed) {
      input.value = inputDrafts.has(state.conversationId) ? inputDrafts.get(state.conversationId) : state.inputDraft;
      inputDrafts.set(state.conversationId, input.value);
      pendingFiles = [];
      resizeInput();
      forceScroll = true;
      setStatus(t('ready'));
    }
    if (Array.isArray(next.attachments)) pendingFiles = next.attachments;
    renderAttachments();
    renderModelOptions(state.modelEntries, state.model);
    renderModeOptions(state.modes, state.mode);
    renderAll();
    if (historySearch.value.trim()) refreshHistorySearch();
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
    if (!state.draft) state.draft = { text: '', reasoning: '', thinking: false, tools: draftTools };
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

  function mergeTool(tool, result) {
    if (!state.busy) return;
    if (!state.draft) state.draft = { text: '', reasoning: '', thinking: false, tools: [] };
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
    // Ignore a delayed stream event from the conversation that was just left.
    if (event.conversationId && event.conversationId !== state.conversationId
      && !['snapshot', 'done', 'stopped', 'error'].includes(event.type)) return;
    switch (event.type) {
      case 'snapshot':
        applyState(event.state);
        break;
      case 'delta':
        syncDraftText(event);
        break;
      case 'tool':
        mergeTool(event.tool, null);
        break;
      case 'tool-result':
        mergeTool({ id: event.id, state: 'done' }, event);
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
      case 'notice':
        if (event.code === 'history-save-failed') setStatus(t('historySaveFailed'), 'error');
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
    sendBtn.disabled = changingConversation || !hasModel() || (!input.value.trim() && !pendingFiles.length);
  }

  function sendErrorText(code) {
    switch (code) {
      case 'busy': return t('busySend');
      case 'empty': return t('emptySend');
      case 'too-long': return t('tooLong');
      case 'invalid-model': return t('invalidModel');
      case 'no-model': return t('noModel');
      case 'conversation-not-found': return t('conversationMissing');
      case 'invalid-title': return t('invalidTitle');
      case 'title-busy': return t('titleGenerating');
      case 'title-failed': return t('titleFailed');
      case 'no-messages': return t('titleFailed');
      case 'history-save-failed': return t('historySaveFailed');
      case 'too-many-files': return t('fileTooMany');
      case 'attachment-expired': return t('attachExpired');
      case 'invalid-file': return t('invalidFile');
      case 'empty-file': return t('emptyFile');
      default: return fill(t('requestFailed'), { error: code || 'unknown' });
    }
  }

  async function submit() {
    if (submitting || changingConversation || !hasModel()) return;
    const text = input.value.trim();
    if (!text && !pendingFiles.length) return;
    const files = pendingFiles.map((file) => file.id).filter(Boolean);
    const interject = !!state.busy;
    submitting = true;
    try {
      await flushInputDraft();
      const result = interject
        ? await window.lilithChat.interject(text, files)
        : await window.lilithChat.send(text, files);
      if (!result || !result.ok) {
        if (result && result.error === 'attachment-expired') clearAttachments();
        setStatus(sendErrorText(result && result.error), 'error');
        return;
      }
      input.value = '';
      inputDrafts.set(state.conversationId, '');
      clearAttachments();
      resizeInput();
      forceScroll = true;
      scrollToBottom(true);
    } catch (error) {
      setStatus(fill(t('requestFailed'), { error: String((error && error.message) || error) }), 'error');
    } finally {
      submitting = false;
    }
  }

  function persistInputDraft() {
    clearTimeout(inputDraftTimer);
    if (!state.conversationId) return inputDraftWrite;
    const id = state.conversationId;
    const text = input.value;
    inputDrafts.set(id, text);
    // Serialize writes so a late debounce cannot replace a newer draft.
    inputDraftWrite = inputDraftWrite.catch(() => {}).then(() => window.lilithChat.saveInputDraft(id, text)).then((result) => {
      if (result && !result.ok && result.error !== 'conversation-not-found') setStatus(sendErrorText(result.error), 'error');
    }).catch((error) => {
      setStatus(fill(t('requestFailed'), { error: String(error.message || error) }), 'error');
    });
    return inputDraftWrite;
  }

  function flushInputDraft() {
    return persistInputDraft();
  }

  function onInput() {
    resizeInput();
    inputDrafts.set(state.conversationId, input.value);
    clearTimeout(inputDraftTimer);
    inputDraftTimer = setTimeout(persistInputDraft, 350);
  }

  async function conversationAction(action, { closeHistory = false } = {}) {
    if (changingConversation) return;
    changingConversation = true;
    updateChrome();
    renderHistory();
    try {
      await flushInputDraft();
      const result = await action();
      if (!result || !result.ok) {
        setStatus(sendErrorText(result && result.error), 'error');
        return;
      }
      if (result.state) applyState(result.state);
      if (closeHistory && window.innerWidth < 760) setHistoryOpen(false);
      input.focus();
    } catch (error) {
      setStatus(fill(t('requestFailed'), { error: String(error.message || error) }), 'error');
    } finally {
      changingConversation = false;
      updateChrome();
      renderHistory();
    }
  }

  async function stopRun() {
    stopBtn.disabled = true;
    try {
      await window.lilithChat.stop();
    } catch {}
    stopBtn.disabled = false;
  }

  async function newChat() {
    if (changingConversation) return;
    if (state.busy && !window.confirm(t('newChatBusyConfirm'))) return;
    await conversationAction(() => window.lilithChat.newChat(), { closeHistory: true });
  }

  async function switchConversation(id) {
    if (changingConversation) return;
    if (id === state.conversationId) {
      if (window.innerWidth < 760) setHistoryOpen(false);
      input.focus();
      return;
    }
    if (state.busy && !window.confirm(t('switchBusyConfirm'))) return;
    await conversationAction(() => window.lilithChat.switchConversation(id), { closeHistory: true });
  }

  async function deleteConversation(conversation) {
    if (changingConversation) return;
    const key = state.busy && conversation.id === state.conversationId ? 'deleteBusyConfirm' : 'deleteConversationConfirm';
    if (!window.confirm(fill(t(key), { title: conversation.title || t('untitledConversation') }))) return;
    await conversationAction(async () => {
      const result = await window.lilithChat.deleteConversation(conversation.id);
      if (result && result.ok) inputDrafts.delete(conversation.id);
      return result;
    });
  }

  function openRename(conversation) {
    if (changingConversation || renameDialog.open) return;
    renamingId = conversation.id;
    renameInput.value = conversation.title || '';
    renameSave.disabled = false;
    renameDialog.showModal();
    renameInput.focus();
    renameInput.select();
  }

  async function saveRename(event) {
    event.preventDefault();
    if (!renamingId || !renameInput.value.trim() || renameSave.disabled) return;
    renameSave.disabled = true;
    try {
      const result = await window.lilithChat.renameConversation(renamingId, renameInput.value.trim());
      if (!result || !result.ok) {
        setStatus(sendErrorText(result && result.error), 'error');
        return;
      }
      if (result.state) applyState(result.state);
      renameDialog.close();
    } catch (error) {
      setStatus(fill(t('requestFailed'), { error: String(error.message || error) }), 'error');
    } finally {
      renameSave.disabled = false;
    }
  }

  async function suggestTitle(conversation, button) {
    if (changingConversation || titleBusy.has(conversation.id)) return;
    titleBusy.add(conversation.id);
    const label = button.textContent;
    button.disabled = true;
    button.textContent = '…';
    setStatus(t('titleGenerating'));
    try {
      const result = await window.lilithChat.suggestTitle(conversation.id);
      if (!result || !result.ok) {
        setStatus(sendErrorText(result && result.error), 'error');
        return;
      }
      if (result.state) applyState(result.state);
      setStatus(t('done'));
    } catch (error) {
      setStatus(fill(t('requestFailed'), { error: String((error && error.message) || error) }), 'error');
    } finally {
      titleBusy.delete(conversation.id);
      button.disabled = changingConversation || !conversation.messageCount;
      button.textContent = label;
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

  async function onModeChange() {
    const value = modeSel.value;
    if (!value) return;
    const result = await window.lilithChat.setMode(value).catch(() => null);
    if (result && result.ok) {
      if (result.state) applyState(result.state);
      return;
    }
    setStatus(sendErrorText(result && result.error), 'error');
    renderModeOptions(state.modes, state.mode);
  }

  async function chooseWorkspace() {
    if (state.busy || changingConversation) return;
    if ((state.messages.length || input.value.trim() || pendingFiles.length) && !window.confirm(t('workspaceConfirm'))) return;
    let result;
    try {
      await flushInputDraft();
      result = await window.lilithChat.chooseWorkspace();
    } catch (error) {
      setStatus(fill(t('requestFailed'), { error: String((error && error.message) || error) }), 'error');
      return;
    }
    if (result && result.ok && result.state) applyState(result.state);
    else if (result && !result.ok && result.error !== 'canceled') setStatus(sendErrorText(result.error), 'error');
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
  historyToggle.addEventListener('click', () => setHistoryOpen(!historyOpen));
  historyClose.addEventListener('click', () => { setHistoryOpen(false); historyToggle.focus(); });
  historyScrim.addEventListener('click', () => setHistoryOpen(false));
  historySearch.addEventListener('input', refreshHistorySearch);
  renameForm.addEventListener('submit', saveRename);
  document.getElementById('rename-cancel').addEventListener('click', () => renameDialog.close());
  renameDialog.addEventListener('close', () => { renamingId = null; });
  window.addEventListener('beforeunload', () => { persistInputDraft(); });
  document.addEventListener('visibilitychange', () => { if (document.hidden) persistInputDraft(); });
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && !renameDialog.open && historyOpen) {
      setHistoryOpen(false);
      historyToggle.focus();
    }
  });
  setHistoryOpen(historyOpen);
  minimizeBtn.addEventListener('click', () => window.lilithChat.minimize());
  closeBtn.addEventListener('click', async () => { await flushInputDraft(); window.lilithChat.close(); });
  manageModelsBtn.addEventListener('click', (event) => {
    event.preventDefault();
    event.stopPropagation();
    openModelsPage();
  });
  stopBtn.addEventListener('click', stopRun);
  modelSel.addEventListener('change', onModelChange);
  modeSel.addEventListener('change', onModeChange);
  workspaceBtn.addEventListener('click', chooseWorkspace);
  sendBtn.addEventListener('click', submit);
  attachBtn.addEventListener('click', chooseAttachments);

  input.addEventListener('input', onInput);
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
