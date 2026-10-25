/* Qoder chat window renderer. All state lives in main; this file only reflects events. */
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
      mode: '模式',
      manageModels: '添加模型',
      qoderGroup: 'Qoder',
      customOpenAIGroup: '自定义 · OpenAI',
      customAnthropicGroup: '自定义 · Anthropic',
      responsesSuffix: ' · Responses',
      reasoningSuffix: ' · 推理',
      toolsSuffix: ' · 工具',
      customWarning: '自定义模型直连所选接口（OpenAI / Anthropic / Reasoning），不启用 Qoder 工具、权限模式和工作目录。',
      customToolsWarning: '此自定义模型已启用工具：可在下方工作目录运行终端、读写文件，权限由模式控制；YOLO 会直接执行。',
      customToolsWorking: '模型正在使用工具…',
      reasoning: '思考过程',
      sessionCustom: '自定义模型不使用 Qoder 会话',
      yoloWarning: 'YOLO：工具调用不再确认，请确认工作目录正确。',
      welcomeTitle: '直接和 Qoder 说话',
      welcomeBody: '这个窗口会以你选定的模型和权限模式运行 Qoder。它可以读文件、跑命令、改代码——尤其是 YOLO 模式下。',
      hintModel: '模型可随时切换',
      hintMode: '模式决定工具权限',
      hintEnter: 'Enter 发送',
      placeholder: '交代一件事，或直接问…',
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
      interjectHint: 'Enter 插嘴 · 会先停止当前输出',
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
      errorToolRoundLimit: '工具调用轮次超过上限，已停止。',
      errorToolCallLimit: '工具调用次数超过上限，已停止。',
      busySend: '上一条还在进行，先等它结束或点停止。',
      emptySend: '先说点什么吧。',
      tooLong: '这段话太长了，精简一点。',
      qoderMissing: '找不到 Qoder CLI，请确认 ~/.qoder-cn 已安装并可运行。',
      spawnFailed: '启动 Qoder 失败。',
      invalidModel: '这个模型已不存在，请重新选择。',
      manageFailed: '打开添加模型页面失败：{error}',
      chooseWorkspace: '选择工作目录',
      newChatBusyConfirm: '模型还在运行。开始新对话会停止当前任务，当前对话和已生成内容会保留在历史中。继续吗？',
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
      qoderGroup: 'Qoder',
      customOpenAIGroup: 'Custom · OpenAI',
      customAnthropicGroup: 'Custom · Anthropic',
      responsesSuffix: ' · Responses',
      reasoningSuffix: ' · Reasoning',
      toolsSuffix: ' · Tools',
      customWarning: 'Custom models call the selected endpoint directly (OpenAI / Anthropic / Reasoning); Qoder tools, mode and workspace are not used.',
      customToolsWarning: 'Tool calls are enabled for this custom model: it can run the terminal and edit files in the workspace below. The mode controls permissions; YOLO runs tools immediately.',
      customToolsWorking: 'The model is using tools…',
      reasoning: 'Reasoning',
      sessionCustom: 'Custom models do not use a Qoder session',
      yoloWarning: 'YOLO: tool calls run without confirmation. Make sure the workspace is correct.',
      welcomeTitle: 'Talk to Qoder directly',
      welcomeBody: 'This window runs Qoder with the model and permission mode you pick. It can read files, run commands and edit code — especially in YOLO mode.',
      hintModel: 'Switch models anytime',
      hintMode: 'Mode sets tool permissions',
      hintEnter: 'Enter to send',
      placeholder: 'Assign a task, or just ask…',
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
      interjectHint: 'Enter to interject · stops the current output',
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
      errorToolRoundLimit: 'Stopped after too many tool rounds.',
      errorToolCallLimit: 'Stopped after too many tool calls.',
      busySend: 'The previous turn is still running. Wait or press Stop.',
      emptySend: 'Say something first.',
      tooLong: 'That message is too long — trim it a little.',
      qoderMissing: 'Qoder CLI was not found. Check that ~/.qoder-cn is installed and runnable.',
      spawnFailed: 'Failed to start Qoder.',
      invalidModel: 'That model no longer exists. Pick another one.',
      manageFailed: 'Could not open the add-model page: {error}',
      chooseWorkspace: 'Choose workspace',
      newChatBusyConfirm: 'The model is still running. A new chat stops the task and keeps this conversation and partial reply in history. Continue?',
      workspaceConfirm: 'Switching workspace starts a new chat and keeps this conversation in history. Continue?',
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
  const customWarningText = document.getElementById('custom-warning-text');
  const sessionDot = document.getElementById('session-dot');
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
  const statusCredits = document.getElementById('status-credits');
  const statusbar = document.getElementById('statusbar');
  const stopBtn = document.getElementById('stop');
  const input = document.getElementById('input');
  const sendBtn = document.getElementById('send');
  const sendLabel = sendBtn.querySelector('[data-i18n]');
  const attachBtn = document.getElementById('attach');
  const attachmentList = document.getElementById('attachment-list');
  const enterHintEl = document.querySelector('.composer-foot [data-i18n="enterHint"]');

  let lang = 'zh';
  let state = {
    conversationId: null,
    conversationTitle: '',
    conversations: [],
    inputDraft: '',
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
  let historyOpen = window.innerWidth >= 760;
  let historyResults = null;
  let historySearchTimer = null;
  let searchRevision = 0;
  let changingConversation = false;
  let renamingId = null;
  let submitting = false;
  const titleBusy = new Set();
  const inputDrafts = new Map();
  let inputDraftTimer = null;
  let inputDraftWrite = Promise.resolve();
  const MAX_FILES = 10;
  let pendingFiles = [];
  let attaching = false;

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
      const result = await window.qoder.removeAttachment(file.id);
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
        result = await window.qoder.attachFiles();
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

  function isCustomSelected() {
    if (state.modelKind === 'custom') return true;
    const entries = Array.isArray(state.modelEntries) ? state.modelEntries : [];
    const entry = entries.find((item) => item.value === state.model);
    return !!entry && entry.kind === 'custom';
  }

  function selectedModelEntry() {
    const entries = Array.isArray(state.modelEntries) ? state.modelEntries : [];
    return entries.find((item) => item.value === state.model) || null;
  }

  function customToolsSelected() {
    const entry = selectedModelEntry();
    return !!entry && entry.kind === 'custom' && entry.tools === true;
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
    historyToggle.title = t('historyTitle');
    historyPanel.setAttribute('aria-label', t('historyTitle'));
    historyList.setAttribute('aria-label', t('historyTitle'));
    historySearch.setAttribute('aria-label', t('searchHistory'));
    historyScrim.setAttribute('aria-label', t('closeHistory'));
    manageModelsBtn.title = t('manageModels');
    minimizeBtn.title = t('minimize');
    closeBtn.title = t('close');
    workspaceBtn.title = state.workspace || '';
    input.placeholder = t('placeholder');
    attachBtn.title = t('attachFiles');
    attachBtn.setAttribute('aria-label', t('attachFiles'));
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
          ? `${entry.tools ? t('toolsSuffix') : ''}${entry.api === 'responses' ? t('responsesSuffix') : (entry.effort ? t('reasoningSuffix') : '')}`
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
        const entries = await window.qoder.listConversations(query);
        if (revision !== searchRevision) return;
        historyResults = Array.isArray(entries) ? entries : [];
        renderHistory();
      } catch (error) {
        if (revision === searchRevision) setStatus(fill(t('requestFailed'), { error: String(error.message || error) }), 'error');
      }
    }, 150);
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
    if (code === 'tool-round-limit') return t('errorToolRoundLimit');
    if (code === 'tool-call-limit') return t('errorToolCallLimit');
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
    renderHistory();
    scrollToBottom(stick);
  }

  function updateChrome() {
    const busy = !!state.busy;
    newChatBtn.disabled = changingConversation;
    conversationTitle.textContent = state.conversationTitle || t('newChat');
    conversationTitle.title = conversationTitle.textContent;
    conversationCount.textContent = fill(t('messageCount'), { n: state.messages.length });
    const custom = isCustomSelected();
    const customTools = custom && customToolsSelected();
    modelSel.disabled = busy || changingConversation;
    modeSel.disabled = busy || changingConversation || (custom && !customTools);
    workspaceBtn.disabled = busy || changingConversation || (custom && !customTools);
    attachBtn.disabled = attaching || changingConversation || pendingFiles.length >= MAX_FILES;
    stopBtn.hidden = !busy;
    spinner.hidden = !busy;
    if (busy) {
      setStatus(customTools ? t('customToolsWorking') : (custom ? t('workingCustom') : t('working')));
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
    yoloWarning.hidden = (custom && !customTools) || state.mode !== 'yolo';
    customWarning.hidden = !custom;
    if (custom && customWarningText) {
      customWarningText.textContent = customTools ? t('customToolsWarning') : t('customWarning');
    }
    sendBtn.disabled = changingConversation || (!input.value.trim() && !pendingFiles.length);
    sendLabel.textContent = busy ? t('interject') : t('send');
    enterHintEl.textContent = busy ? t('interjectHint') : t('enterHint');
    sendBtn.classList.toggle('interjecting', busy);
  }

  // ------------------------------------------------------------- state sync
  function applyState(next) {
    if (!next) return;
    const changed = next.conversationId !== state.conversationId;
    if (changed && state.conversationId) inputDrafts.set(state.conversationId, input.value);
    const model = next.model || '';
    const modelEntries = Array.isArray(next.modelEntries)
      ? next.modelEntries
      : (Array.isArray(next.models)
        ? next.models.map((name) => ({ value: name, label: name, kind: 'qoder' }))
        : state.modelEntries);
    state = {
      conversationId: next.conversationId || null,
      conversationTitle: next.conversationTitle || '',
      conversations: Array.isArray(next.conversations) ? next.conversations : state.conversations,
      inputDraft: typeof next.inputDraft === 'string' ? next.inputDraft : '',
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
    setStaticTexts();
    renderModelOptions(state.modelEntries, state.model);
    renderModeOptions(state.modes, state.mode);
    renderAll();
    if (historySearch.value.trim()) refreshHistorySearch();
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
    sendBtn.disabled = changingConversation || (!input.value.trim() && !pendingFiles.length);
  }

  function sendErrorText(code) {
    switch (code) {
      case 'busy': return t('busySend');
      case 'empty': return t('emptySend');
      case 'too-long': return t('tooLong');
      case 'qoder-not-found': return t('qoderMissing');
      case 'spawn-failed': return t('spawnFailed');
      case 'invalid-model': return t('invalidModel');
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
    if (submitting || changingConversation) return;
    const text = input.value.trim();
    if (!text && !pendingFiles.length) return;
    const files = pendingFiles.map((file) => file.id).filter(Boolean);
    const interject = !!state.busy;
    submitting = true;
    try {
      await flushInputDraft();
      const result = interject
        ? await window.qoder.interject(text, files)
        : await window.qoder.send(text, files);
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

  async function stopRun() {
    stopBtn.disabled = true;
    try {
      await window.qoder.stop();
    } catch {}
    stopBtn.disabled = false;
  }

  function persistInputDraft() {
    clearTimeout(inputDraftTimer);
    if (!state.conversationId) return inputDraftWrite;
    const id = state.conversationId;
    const text = input.value;
    inputDrafts.set(id, text);
    // Serialize writes so a late debounce cannot replace a newer draft.
    inputDraftWrite = inputDraftWrite.catch(() => {}).then(() => window.qoder.saveInputDraft(id, text)).then((result) => {
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

  async function newChat() {
    if (changingConversation) return;
    if (state.busy && !window.confirm(t('newChatBusyConfirm'))) return;
    await conversationAction(() => window.qoder.newChat(), { closeHistory: true });
  }

  async function switchConversation(id) {
    if (changingConversation) return;
    if (id === state.conversationId) {
      if (window.innerWidth < 760) setHistoryOpen(false);
      input.focus();
      return;
    }
    if (state.busy && !window.confirm(t('switchBusyConfirm'))) return;
    await conversationAction(() => window.qoder.switchConversation(id), { closeHistory: true });
  }

  async function deleteConversation(conversation) {
    if (changingConversation) return;
    const key = state.busy && conversation.id === state.conversationId ? 'deleteBusyConfirm' : 'deleteConversationConfirm';
    if (!window.confirm(fill(t(key), { title: conversation.title || t('untitledConversation') }))) return;
    await conversationAction(async () => {
      const result = await window.qoder.deleteConversation(conversation.id);
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
      const result = await window.qoder.renameConversation(renamingId, renameInput.value.trim());
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
      const result = await window.qoder.suggestTitle(conversation.id);
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

  async function chooseWorkspace() {
    if (state.busy || changingConversation) return;
    if ((state.messages.length || input.value.trim() || pendingFiles.length) && !window.confirm(t('workspaceConfirm'))) return;
    let result;
    try {
      await flushInputDraft();
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
  minimizeBtn.addEventListener('click', () => window.qoder.minimize());
  closeBtn.addEventListener('click', async () => { await flushInputDraft(); window.qoder.close(); });
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
  attachBtn.addEventListener('click', chooseAttachments);

  input.addEventListener('input', onInput);
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
