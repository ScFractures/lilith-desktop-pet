(() => {
  const LABELS = {
    zh: {
      windowTitle: '添加模型',
      title: '添加模型',
      subtitle: '接入 OpenAI、Anthropic 或 Reasoning 接口，添加后可在对话窗口中直接选择。',
      typeLabel: '类型',
      typeOpenAI: 'OpenAI 兼容（Chat Completions）',
      typeAnthropic: 'Anthropic（Messages API）',
      typeReasoning: 'Reasoning（OpenAI Responses API）',
      typeHintOpenAI: '请求会发往 Base URL + /chat/completions。',
      typeHintAnthropic: '请求会发往 Base URL + /v1/messages，使用 x-api-key 鉴权。',
      typeHintReasoning: '请求会发往 Base URL + /v1/responses，回复中的思考内容会一并显示。',
      effortLabel: '推理强度',
      effortLow: '低 · low',
      effortMedium: '中 · medium',
      effortHigh: '高 · high',
      nameLabel: '显示名称',
      namePh: '如 DeepSeek 官方（可留空）',
      modelLabel: '模型 ID',
      modelPh: '如 deepseek-chat',
      modelPhAnthropic: '如 claude-sonnet-4-5',
      modelPhReasoning: '如 gpt-5',
      baseLabel: 'Base URL',
      basePh: 'https://api.deepseek.com/v1',
      basePhAnthropic: 'https://api.anthropic.com',
      basePhReasoning: 'https://api.openai.com/v1',
      keyLabel: 'API Key',
      keyPh: 'sk-…（本地服务可留空）',
      keyKeepPh: '已保存，留空保持不变',
      keyHint: 'Key 只保存在本机配置里，并且只会发送到上面填写的 Base URL。',
      keyHintEdit: '已保存的 Key 不会显示。留空则继续使用原 Key，输入新值则覆盖。',
      listTitle: '已添加的模型',
      listEmpty: '还没有自定义模型。填写下面的表单添加第一个。',
      addTitle: '添加模型',
      editTitle: '编辑模型',
      save: '保存模型',
      saveEdit: '保存修改',
      test: '测试连接',
      testing: '测试中…',
      testingShort: '测试中',
      saving: '保存中…',
      cancelEdit: '取消编辑',
      saved: '已保存，回到对话窗口即可选择。',
      deleted: '已删除。',
      testOk: '连接成功{detail}{ms}',
      testFail: '连接失败：{error}',
      deleteConfirm: '删除「{name}」？它也会从对话窗口的模型列表里移除。',
      deleteFail: '删除失败：{error}',
      saveFail: '保存失败：{error}',
      edit: '编辑',
      delete: '删除',
      testShort: '测试',
      legacy: '旧配置',
      hasKey: 'Key 已保存',
      noKey: '无 Key',
      badgeOpenAI: 'OpenAI',
      badgeAnthropic: 'Anthropic',
      badgeReasoning: 'Reasoning',
      errBaseUrl: 'Base URL 格式不对，需要以 http:// 或 https:// 开头。',
      errModel: '请填写模型 ID。',
      errNotFound: '没有找到这个模型。',
      errUnavailable: '模型配置暂不可用。',
      unknownError: '未知错误',
      footnote: '保存后回到对话窗口，在模型下拉框里选择；模型返回的思考内容会显示在回复上方。',
    },
    en: {
      windowTitle: 'Add model',
      title: 'Add model',
      subtitle: 'Connect OpenAI, Anthropic or Reasoning endpoints and pick them in the chat window.',
      typeLabel: 'Type',
      typeOpenAI: 'OpenAI-compatible (Chat Completions)',
      typeAnthropic: 'Anthropic (Messages API)',
      typeReasoning: 'Reasoning (OpenAI Responses API)',
      typeHintOpenAI: 'Requests go to Base URL + /chat/completions.',
      typeHintAnthropic: 'Requests go to Base URL + /v1/messages with x-api-key auth.',
      typeHintReasoning: 'Requests go to Base URL + /v1/responses; reasoning content is shown in chat.',
      effortLabel: 'Reasoning effort',
      effortLow: 'Low',
      effortMedium: 'Medium',
      effortHigh: 'High',
      nameLabel: 'Display name',
      namePh: 'e.g. DeepSeek official (optional)',
      modelLabel: 'Model ID',
      modelPh: 'e.g. deepseek-chat',
      modelPhAnthropic: 'e.g. claude-sonnet-4-5',
      modelPhReasoning: 'e.g. gpt-5',
      baseLabel: 'Base URL',
      basePh: 'https://api.deepseek.com/v1',
      basePhAnthropic: 'https://api.anthropic.com',
      basePhReasoning: 'https://api.openai.com/v1',
      keyLabel: 'API Key',
      keyPh: 'sk-… (optional for local servers)',
      keyKeepPh: 'Saved — leave blank to keep it',
      keyHint: 'The key is stored only in the local config and sent only to the Base URL above.',
      keyHintEdit: 'The saved key is not shown. Leave blank to keep it, or type a new one to replace it.',
      listTitle: 'Added models',
      listEmpty: 'No custom models yet. Add the first one below.',
      addTitle: 'Add model',
      editTitle: 'Edit model',
      save: 'Save model',
      saveEdit: 'Save changes',
      test: 'Test connection',
      testing: 'Testing…',
      testingShort: 'Testing',
      saving: 'Saving…',
      cancelEdit: 'Cancel edit',
      saved: 'Saved. Go back to the chat window to pick it.',
      deleted: 'Deleted.',
      testOk: 'Connected{detail}{ms}',
      testFail: 'Connection failed: {error}',
      deleteConfirm: 'Delete “{name}”? It will also disappear from the chat model list.',
      deleteFail: 'Delete failed: {error}',
      saveFail: 'Save failed: {error}',
      edit: 'Edit',
      delete: 'Delete',
      testShort: 'Test',
      legacy: 'Imported',
      hasKey: 'Key saved',
      noKey: 'No key',
      badgeOpenAI: 'OpenAI',
      badgeAnthropic: 'Anthropic',
      badgeReasoning: 'Reasoning',
      errBaseUrl: 'Base URL must start with http:// or https://.',
      errModel: 'Enter a model ID.',
      errNotFound: 'This model was not found.',
      errUnavailable: 'Model settings are unavailable.',
      unknownError: 'Unknown error',
      footnote: 'After saving, pick it in the chat window model menu. Reasoning returned by the model appears above the reply.',
    },
  };

  const $ = (id) => document.getElementById(id);
  const listEl = $('model-list');
  const formEl = $('model-form');
  const statusEl = $('status');
  const testBtn = $('test');
  const saveBtn = $('save');
  const cancelBtn = $('cancel-edit');
  const typeEl = $('type');
  const effortEl = $('effort');
  const effortField = $('effort-field');

  let lang = 'zh';
  let models = [];
  let editingId = null;
  let actionBusy = false;

  const t = (key) => (LABELS[lang] && LABELS[lang][key]) || LABELS.zh[key] || key;
  const fill = (template, vars) => String(template).replace(/\{(\w+)\}/g, (_m, key) => (vars && key in vars ? vars[key] : `{${key}}`));

  function setStatus(message, kind) {
    statusEl.textContent = message || '';
    statusEl.className = `status${kind ? ` ${kind}` : ''}`;
  }

  function errorText(result) {
    if (!result) return t('unknownError');
    const code = result.error;
    if (code === 'invalid-base-url') return t('errBaseUrl');
    if (code === 'missing-model') return t('errModel');
    if (code === 'not-found') return t('errNotFound');
    if (code === 'unavailable') return t('errUnavailable');
    return String(code || t('unknownError'));
  }

  function badgeLabel(type) {
    if (type === 'anthropic') return t('badgeAnthropic');
    if (type === 'reasoning') return t('badgeReasoning');
    return t('badgeOpenAI');
  }

  function syncTypeFields() {
    const type = typeEl.value;
    effortField.hidden = type !== 'reasoning';
    $('type-hint').textContent = t(
      type === 'anthropic' ? 'typeHintAnthropic' : (type === 'reasoning' ? 'typeHintReasoning' : 'typeHintOpenAI')
    );
    $('base-url').placeholder = t(
      type === 'anthropic' ? 'basePhAnthropic' : (type === 'reasoning' ? 'basePhReasoning' : 'basePh')
    );
    $('model-id').placeholder = t(
      type === 'anthropic' ? 'modelPhAnthropic' : (type === 'reasoning' ? 'modelPhReasoning' : 'modelPh')
    );
  }

  function updateFormChrome() {
    $('form-title').textContent = editingId ? t('editTitle') : t('addTitle');
    cancelBtn.hidden = !editingId;
    cancelBtn.textContent = t('cancelEdit');
    saveBtn.textContent = editingId ? t('saveEdit') : t('save');
    $('api-key').placeholder = editingId ? t('keyKeepPh') : t('keyPh');
    $('key-hint').textContent = editingId ? t('keyHintEdit') : t('keyHint');
  }

  function applyLabels() {
    document.title = t('windowTitle');
    document.documentElement.lang = lang === 'zh' ? 'zh-CN' : 'en';
    $('title').textContent = t('title');
    $('subtitle').textContent = t('subtitle');
    typeEl.options[0].textContent = t('typeOpenAI');
    typeEl.options[1].textContent = t('typeAnthropic');
    typeEl.options[2].textContent = t('typeReasoning');
    effortEl.options[0].textContent = t('effortLow');
    effortEl.options[1].textContent = t('effortMedium');
    effortEl.options[2].textContent = t('effortHigh');
    $('lbl-effort').textContent = t('effortLabel');
    $('list-title').textContent = t('listTitle');
    $('lbl-type').textContent = t('typeLabel');
    $('lbl-name').textContent = t('nameLabel');
    $('lbl-model').textContent = t('modelLabel');
    $('lbl-base').textContent = t('baseLabel');
    $('lbl-key').textContent = t('keyLabel');
    $('name').placeholder = t('namePh');
    $('model-id').placeholder = t('modelPh');
    $('base-url').placeholder = t('basePh');
    $('footnote').textContent = t('footnote');
    testBtn.textContent = t('test');
    syncTypeFields();
    updateFormChrome();
    renderList();
  }

  function makeElement(tag, className, textContent) {
    const el = document.createElement(tag);
    if (className) el.className = className;
    if (textContent != null) el.textContent = textContent;
    return el;
  }

  function renderList() {
    listEl.textContent = '';
    $('list-count').textContent = models.length ? String(models.length) : '';
    if (!models.length) {
      listEl.appendChild(makeElement('div', 'empty', t('listEmpty')));
      return;
    }
    models.forEach((model) => {
      const card = makeElement('div', 'model-card');
      const info = makeElement('div', 'model-info');

      const titleRow = makeElement('div', 'model-title-row');
      titleRow.appendChild(makeElement('span', 'model-name', model.name));
      const type = model.type === 'anthropic' || model.type === 'reasoning' ? model.type : 'openai';
      titleRow.appendChild(makeElement('span', `badge type-${type}`, badgeLabel(type)));
      if (model.legacy) titleRow.appendChild(makeElement('span', 'badge legacy', t('legacy')));

      info.appendChild(titleRow);
      info.appendChild(makeElement('div', 'model-id', model.model));
      info.appendChild(makeElement('div', 'model-url', model.baseUrl));
      info.appendChild(makeElement('div', 'key-state', model.hasKey ? t('hasKey') : t('noKey')));

      const actions = makeElement('div', 'card-actions');
      const testButton = makeElement('button', '', t('testShort'));
      testButton.type = 'button';
      testButton.addEventListener('click', () => testExisting(model, testButton));
      const editButton = makeElement('button', '', t('edit'));
      editButton.type = 'button';
      editButton.addEventListener('click', () => startEditing(model));
      const deleteButton = makeElement('button', 'danger', t('delete'));
      deleteButton.type = 'button';
      deleteButton.addEventListener('click', () => deleteModel(model));
      actions.append(testButton, editButton, deleteButton);

      card.append(info, actions);
      listEl.appendChild(card);
    });
  }

  async function refreshList() {
    try {
      const result = await window.models.list();
      if (result && Array.isArray(result.models)) models = result.models;
      else models = [];
    } catch {
      models = [];
    }
    renderList();
  }

  function formPayload() {
    const type = typeEl.value;
    return {
      id: editingId || undefined,
      type,
      name: $('name').value.trim(),
      model: $('model-id').value.trim(),
      baseUrl: $('base-url').value.trim(),
      apiKey: $('api-key').value,
      effort: type === 'reasoning' ? effortEl.value : '',
    };
  }

  function validateForm() {
    const payload = formPayload();
    if (!/^https?:\/\/\S+$/i.test(payload.baseUrl)) {
      setStatus(t('errBaseUrl'), 'err');
      $('base-url').focus();
      return null;
    }
    if (!payload.model) {
      setStatus(t('errModel'), 'err');
      $('model-id').focus();
      return null;
    }
    return payload;
  }

  function setActionBusy(value) {
    actionBusy = value;
    testBtn.disabled = value;
    saveBtn.disabled = value;
  }

  function resetForm(focus) {
    editingId = null;
    formEl.reset();
    typeEl.value = 'openai';
    effortEl.value = 'medium';
    syncTypeFields();
    updateFormChrome();
    if (focus) $('name').focus();
  }

  function startEditing(model) {
    if (actionBusy) return;
    editingId = model.id;
    typeEl.value = model.type === 'anthropic' || model.type === 'reasoning' ? model.type : 'openai';
    effortEl.value = model.effort === 'low' || model.effort === 'high' ? model.effort : 'medium';
    syncTypeFields();
    $('name').value = model.name;
    $('model-id').value = model.model;
    $('base-url').value = model.baseUrl;
    $('api-key').value = '';
    updateFormChrome();
    setStatus(t('keyHintEdit'), '');
    const panel = formEl.closest('.panel');
    if (panel) panel.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    $('name').focus();
  }

  async function testCurrent() {
    if (actionBusy) return;
    const payload = validateForm();
    if (!payload) return;
    setActionBusy(true);
    testBtn.textContent = t('testing');
    setStatus(t('testing'), 'busy');
    let result;
    try {
      result = await window.models.test(payload);
    } catch (error) {
      result = { ok: false, error: String((error && error.message) || error) };
    }
    setActionBusy(false);
    testBtn.textContent = t('test');
    if (result && result.ok) {
      const detail = result.reply ? ` · ${result.reply}` : '';
      const latency = Number.isFinite(result.latencyMs) ? ` · ${result.latencyMs}ms` : '';
      setStatus(fill(t('testOk'), { detail, ms: latency }), 'ok');
    } else {
      setStatus(fill(t('testFail'), { error: errorText(result) }), 'err');
    }
  }

  async function testExisting(model, button) {
    if (actionBusy) return;
    actionBusy = true;
    button.disabled = true;
    const original = button.textContent;
    button.textContent = t('testingShort');
    setStatus(t('testing'), 'busy');
    let result;
    try {
      result = await window.models.test({ id: model.id });
    } catch (error) {
      result = { ok: false, error: String((error && error.message) || error) };
    }
    actionBusy = false;
    button.disabled = false;
    button.textContent = original;
    if (result && result.ok) {
      const detail = result.reply ? ` · ${result.reply}` : '';
      const latency = Number.isFinite(result.latencyMs) ? ` · ${result.latencyMs}ms` : '';
      setStatus(fill(t('testOk'), { detail, ms: latency }), 'ok');
    } else {
      setStatus(fill(t('testFail'), { error: errorText(result) }), 'err');
    }
  }

  async function saveModel(event) {
    event.preventDefault();
    if (actionBusy) return;
    const payload = validateForm();
    if (!payload) return;
    setActionBusy(true);
    saveBtn.textContent = t('saving');
    setStatus(t('saving'), 'busy');
    let result;
    try {
      result = await window.models.save(payload);
    } catch (error) {
      result = { ok: false, error: String((error && error.message) || error) };
    }
    setActionBusy(false);
    if (!result || !result.ok) {
      saveBtn.textContent = editingId ? t('saveEdit') : t('save');
      setStatus(fill(t('saveFail'), { error: errorText(result) }), 'err');
      return;
    }
    if (Array.isArray(result.models)) models = result.models;
    editingId = null;
    formEl.reset();
    effortEl.value = 'medium';
    syncTypeFields();
    updateFormChrome();
    renderList();
    setStatus(t('saved'), 'ok');
  }

  async function deleteModel(model) {
    if (actionBusy) return;
    if (!window.confirm(fill(t('deleteConfirm'), { name: model.name }))) return;
    actionBusy = true;
    let result;
    try {
      result = await window.models.remove(model.id);
    } catch (error) {
      result = { ok: false, error: String((error && error.message) || error) };
    }
    actionBusy = false;
    if (!result || !result.ok) {
      setStatus(fill(t('deleteFail'), { error: errorText(result) }), 'err');
      return;
    }
    models = Array.isArray(result.models) ? result.models : models.filter((item) => item.id !== model.id);
    if (editingId === model.id) resetForm(false);
    renderList();
    setStatus(t('deleted'), 'ok');
  }

  formEl.addEventListener('submit', saveModel);
  testBtn.addEventListener('click', testCurrent);
  typeEl.addEventListener('change', syncTypeFields);
  cancelBtn.addEventListener('click', () => {
    resetForm(true);
    setStatus('', '');
  });

  window.models.onEvent((event) => {
    if (!event || event.type !== 'lang') return;
    lang = event.lang === 'en' ? 'en' : 'zh';
    applyLabels();
  });

  (async () => {
    try {
      const info = await window.models.getLang();
      if (info && info.lang) lang = info.lang === 'en' ? 'en' : 'zh';
    } catch {}
    effortEl.value = 'medium';
    applyLabels();
    await refreshList();
  })();
})();
