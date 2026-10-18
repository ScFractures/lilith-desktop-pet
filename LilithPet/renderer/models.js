(() => {
  const LABELS = {
    zh: {
      windowTitle: '添加模型',
      title: '添加模型',
      subtitle: '接入 OpenAI 兼容或 Anthropic 接口，可自动读取模型列表，也支持推理模型。',
      typePill: 'OpenAI · Anthropic · 自动读取模型',
      typeLabel: '类型',
      typeOpenAI: 'OpenAI 兼容',
      typeAnthropic: 'Anthropic（Messages API）',
      apiLabel: '接口协议',
      apiChat: 'Chat Completions',
      apiResponses: 'Responses API（推理）',
      typeHintOpenAI: '请求会发往 Base URL + /chat/completions；开启推理后会附带 reasoning_effort（需模型支持）。',
      typeHintResponses: '请求会发往 Base URL + /v1/responses；模型返回的推理摘要会显示在回复上方。',
      typeHintAnthropic: '请求会发往 Base URL + /v1/messages，使用 x-api-key 鉴权；开启推理会启用扩展思考（extended thinking，需模型支持）。',
      effortLabel: '推理强度',
      effortOff: '默认（不指定）',
      effortNone: '关闭思考 · none',
      effortMinimal: '极低 · minimal',
      effortLow: '低 · low',
      effortMedium: '中 · medium',
      effortHigh: '高 · high',
      effortXhigh: '极高 · xhigh',
      effortMax: '最大 · max',
      effortShortNone: '关闭',
      effortShortMinimal: '极低',
      effortShortLow: '低',
      effortShortMedium: '中',
      effortShortHigh: '高',
      effortShortXhigh: '极高',
      effortShortMax: '最大',
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
      badgeResponses: 'Responses',
      badgeReasoning: '推理 · {level}',
      badgeEfforts: '深度 · {levels}',
      fetchModel: '读取模型',
      fetchingModels: '读取中…',
      fetchHint: '可从接口读取模型列表和每个模型支持的思考深度，也可以手动填写。',
      fetchOk: '已读取 {n} 个模型，可从输入框下拉选择。',
      fetchOkDepth: '已读取 {n} 个模型，其中 {d} 个包含思考深度信息。',
      fetchEmpty: '接口没有返回模型，可手动填写。',
      depthLoading: '读取模型后会显示每个模型支持的思考深度。',
      depthKnown: '可用思考深度：{levels}（{source}）',
      depthNone: '接口显示该模型没有可调的思考深度参数。',
      depthUnknown: '接口未提供这个模型的思考深度，仍可手动选择档位。',
      depthReset: '原档位不受支持，已切换为默认。',
      depthSourceApi: '来自接口',
      depthSourceInferred: '根据模型推断',
      depthSourceSaved: '已保存的信息',
      depthSourceUnknown: '来源未知',
      fetchFail: '读取失败：{error}',
      fetchNeedBase: '请先填写有效的 Base URL。',
      errBaseUrl: 'Base URL 格式不对，需要以 http:// 或 https:// 开头。',
      errModel: '请填写模型 ID。',
      errNotFound: '没有找到这个模型。',
      errUnavailable: '模型配置暂不可用。',
      unknownError: '未知错误',
      footnote: '保存后回到对话窗口，在模型下拉框里选择；读取模型时会同时读取每个模型支持的思考深度，OpenAI 和 Anthropic 的思考内容都会显示在回复上方。',
    },
    en: {
      windowTitle: 'Add model',
      title: 'Add model',
      subtitle: 'Connect OpenAI-compatible or Anthropic endpoints, fetch the model list automatically, and enable reasoning.',
      typePill: 'OpenAI · Anthropic · model discovery',
      typeLabel: 'Type',
      typeOpenAI: 'OpenAI-compatible',
      typeAnthropic: 'Anthropic (Messages API)',
      apiLabel: 'API protocol',
      apiChat: 'Chat Completions',
      apiResponses: 'Responses API (reasoning)',
      typeHintOpenAI: 'Requests go to Base URL + /chat/completions; enabling reasoning sends reasoning_effort (model support required).',
      typeHintResponses: 'Requests go to Base URL + /v1/responses; reasoning summaries appear above the reply.',
      typeHintAnthropic: 'Requests go to Base URL + /v1/messages with x-api-key auth; enabling reasoning turns on extended thinking (model support required).',
      effortLabel: 'Reasoning effort',
      effortOff: 'Default (unset)',
      effortNone: 'Off · none',
      effortMinimal: 'Minimal · minimal',
      effortLow: 'Low · low',
      effortMedium: 'Medium · medium',
      effortHigh: 'High · high',
      effortXhigh: 'Extra high · xhigh',
      effortMax: 'Max · max',
      effortShortNone: 'off',
      effortShortMinimal: 'minimal',
      effortShortLow: 'low',
      effortShortMedium: 'medium',
      effortShortHigh: 'high',
      effortShortXhigh: 'xhigh',
      effortShortMax: 'max',
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
      badgeResponses: 'Responses',
      badgeReasoning: 'Reasoning · {level}',
      badgeEfforts: 'Depths · {levels}',
      fetchModel: 'Fetch models',
      fetchingModels: 'Fetching…',
      fetchHint: 'Fetch the model list and each model’s supported thinking depths, or type an ID manually.',
      fetchOk: 'Loaded {n} models — choose one from the dropdown.',
      fetchOkDepth: 'Loaded {n} models; {d} include thinking-depth info.',
      fetchEmpty: 'The endpoint returned no models. Type an ID manually.',
      depthLoading: 'Fetch models to see the thinking depths each model supports.',
      depthKnown: 'Supported thinking depths: {levels} ({source})',
      depthNone: 'The endpoint reports no adjustable thinking depth for this model.',
      depthUnknown: 'No thinking-depth info for this model; you can still choose a level manually.',
      depthReset: 'The previous level is unsupported, so it was reset to default.',
      depthSourceApi: 'from API',
      depthSourceInferred: 'inferred from model ID',
      depthSourceSaved: 'saved info',
      depthSourceUnknown: 'unknown source',
      fetchFail: 'Fetch failed: {error}',
      fetchNeedBase: 'Enter a valid Base URL first.',
      errBaseUrl: 'Base URL must start with http:// or https://.',
      errModel: 'Enter a model ID.',
      errNotFound: 'This model was not found.',
      errUnavailable: 'Model settings are unavailable.',
      unknownError: 'Unknown error',
      footnote: 'After saving, pick it in the chat window model menu. Fetching models also reads each model’s supported thinking depths; reasoning from both OpenAI and Anthropic appears above the reply.',
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
  const apiEl = $('api');
  const apiField = $('api-field');
  const effortEl = $('effort');
  const fetchBtn = $('fetch-models');
  const modelOptions = $('model-options');
  const modelHint = $('model-hint');
  const depthHint = $('depth-hint');

  let lang = 'zh';
  let models = [];
  let catalog = [];
  let selectedMeta = null;
  let editingId = null;
  let actionBusy = false;
  let fetchBusy = false;
  let fetchTimer = null;
  let fetchSeq = 0;

  const t = (key) => (LABELS[lang] && LABELS[lang][key]) || LABELS.zh[key] || key;
  const fill = (template, vars) => String(template).replace(/\{(\w+)\}/g, (_m, key) => (vars && key in vars ? vars[key] : `{${key}}`));

  function setStatus(message, kind) {
    statusEl.textContent = message || '';
    statusEl.className = `status${kind ? ` ${kind}` : ''}`;
  }

  function setModelHint(message, kind) {
    modelHint.textContent = message || '';
    modelHint.className = `hint${kind ? ` ${kind}` : ''}`;
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
    return type === 'anthropic' ? t('badgeAnthropic') : t('badgeOpenAI');
  }

  function effortShort(effort) {
    const keys = {
      none: 'effortShortNone',
      minimal: 'effortShortMinimal',
      low: 'effortShortLow',
      medium: 'effortShortMedium',
      high: 'effortShortHigh',
      xhigh: 'effortShortXhigh',
      max: 'effortShortMax',
    };
    return t(keys[effort] || 'effortShortMedium');
  }

  function effortsText(list) {
    return (Array.isArray(list) ? list : []).map(effortShort).join(' / ');
  }

  function catalogMeta(id) {
    return catalog.find((entry) => entry && entry.id === id) || null;
  }

  function savedMeta(id) {
    if (!editingId) return null;
    const saved = models.find((entry) => entry.id === editingId);
    if (!saved || saved.model !== id) return null;
    return {
      efforts: Array.isArray(saved.efforts) ? saved.efforts : null,
      thinking: saved.thinking || '',
      source: 'saved',
    };
  }

  function depthSourceLabel(source) {
    if (source === 'api') return t('depthSourceApi');
    if (source === 'inferred') return t('depthSourceInferred');
    if (source === 'saved') return t('depthSourceSaved');
    return t('depthSourceUnknown');
  }

  function syncEffortOptions(efforts) {
    const allowed = Array.isArray(efforts) ? efforts : null;
    let reset = false;
    Array.from(effortEl.options).forEach((option) => {
      if (!option.value) {
        option.disabled = false;
        return;
      }
      option.disabled = !!allowed && !allowed.includes(option.value);
    });
    if (allowed && effortEl.value && !allowed.includes(effortEl.value)) {
      effortEl.value = '';
      reset = true;
    }
    return reset;
  }

  function refreshDepthInfo() {
    const id = $('model-id').value.trim();
    let meta = id ? catalogMeta(id) : null;
    if (!meta) meta = id ? savedMeta(id) : null;
    selectedMeta = meta
      ? {
          efforts: Array.isArray(meta.efforts) ? meta.efforts.slice() : null,
          thinking: meta.thinking || '',
        }
      : null;
    const reset = syncEffortOptions(meta ? meta.efforts : null);
    if (!id) {
      depthHint.textContent = '';
      return;
    }
    let message;
    if (meta && Array.isArray(meta.efforts)) {
      message = meta.efforts.length
        ? fill(t('depthKnown'), {
            levels: effortsText(meta.efforts),
            source: depthSourceLabel(meta.source),
          })
        : t('depthNone');
    } else if (meta || catalog.length) {
      message = t('depthUnknown');
    } else {
      message = t('depthLoading');
    }
    if (reset) message = `${message} ${t('depthReset')}`;
    depthHint.textContent = message;
  }

  function syncTypeFields() {
    const type = typeEl.value;
    const api = apiEl.value;
    apiField.hidden = type !== 'openai';
    const hintKey = type === 'anthropic'
      ? 'typeHintAnthropic'
      : (api === 'responses' ? 'typeHintResponses' : 'typeHintOpenAI');
    $('type-hint').textContent = t(hintKey);
    $('base-url').placeholder = t(
      type === 'anthropic' ? 'basePhAnthropic' : (api === 'responses' ? 'basePhReasoning' : 'basePh')
    );
    $('model-id').placeholder = t(
      type === 'anthropic' ? 'modelPhAnthropic' : (api === 'responses' ? 'modelPhReasoning' : 'modelPh')
    );
    setModelHint(t('fetchHint'), '');
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
    $('type-pill').textContent = t('typePill');
    typeEl.options[0].textContent = t('typeOpenAI');
    typeEl.options[1].textContent = t('typeAnthropic');
    apiEl.options[0].textContent = t('apiChat');
    apiEl.options[1].textContent = t('apiResponses');
    ['effortOff', 'effortNone', 'effortMinimal', 'effortLow', 'effortMedium', 'effortHigh', 'effortXhigh', 'effortMax']
      .forEach((key, index) => {
        if (effortEl.options[index]) effortEl.options[index].textContent = t(key);
      });
    $('lbl-effort').textContent = t('effortLabel');
    $('lbl-api').textContent = t('apiLabel');
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
    setFetchBusy(fetchBusy);
    testBtn.textContent = t('test');
    syncTypeFields();
    updateFormChrome();
    refreshDepthInfo();
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
      const type = model.type === 'anthropic' ? 'anthropic' : 'openai';
      titleRow.appendChild(makeElement('span', `badge type-${type}`, badgeLabel(type)));
      if (type === 'openai' && model.api === 'responses') {
        titleRow.appendChild(makeElement('span', 'badge type-responses', t('badgeResponses')));
      }
      if (Array.isArray(model.efforts) && model.efforts.length) {
        titleRow.appendChild(makeElement(
          'span',
          'badge type-responses',
          fill(t('badgeEfforts'), { levels: effortsText(model.efforts) })
        ));
      }
      if (model.effort) {
        titleRow.appendChild(makeElement(
          'span',
          'badge type-reasoning',
          fill(t('badgeReasoning'), { level: effortShort(model.effort) })
        ));
      }
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
    const payload = {
      id: editingId || undefined,
      type,
      api: type === 'openai' ? apiEl.value : '',
      name: $('name').value.trim(),
      model: $('model-id').value.trim(),
      baseUrl: $('base-url').value.trim(),
      apiKey: $('api-key').value,
      effort: effortEl.value || '',
    };
    if (selectedMeta) {
      payload.efforts = Array.isArray(selectedMeta.efforts) ? selectedMeta.efforts : null;
      payload.thinking = selectedMeta.thinking || '';
    }
    return payload;
  }

  function fetchPayload() {
    const type = typeEl.value;
    return {
      id: editingId || undefined,
      type,
      api: type === 'openai' ? apiEl.value : '',
      baseUrl: $('base-url').value.trim(),
      apiKey: $('api-key').value,
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

  function setFetchBusy(value) {
    fetchBusy = value;
    fetchBtn.disabled = value || actionBusy;
    fetchBtn.textContent = value ? t('fetchingModels') : t('fetchModel');
  }

  function setActionBusy(value) {
    actionBusy = value;
    testBtn.disabled = value || fetchBusy;
    saveBtn.disabled = value || fetchBusy;
    fetchBtn.disabled = value || fetchBusy;
  }

  function clearModelChoices() {
    fetchSeq += 1;
    modelOptions.textContent = '';
    catalog = [];
    selectedMeta = null;
    refreshDepthInfo();
  }

  function renderModelChoices(list) {
    catalog = Array.isArray(list)
      ? list.filter((model) => model && typeof model.id === 'string' && model.id)
      : [];
    modelOptions.textContent = '';
    catalog.forEach((model) => {
      const option = document.createElement('option');
      option.value = model.id;
      const levels = Array.isArray(model.efforts) && model.efforts.length ? effortsText(model.efforts) : '';
      const parts = [model.name || '', levels].filter(Boolean);
      if (parts.length) option.label = parts.join(' · ');
      modelOptions.appendChild(option);
    });
    refreshDepthInfo();
  }

  function scheduleAutoFetch() {
    clearTimeout(fetchTimer);
    fetchTimer = setTimeout(() => readRemoteModels({ auto: true }), 600);
  }

  async function readRemoteModels({ auto = false } = {}) {
    if (actionBusy || fetchBusy) return;
    const payload = fetchPayload();
    if (!/^https?:\/\/\S+$/i.test(payload.baseUrl)) {
      if (!auto) {
        setModelHint(t('fetchNeedBase'), 'err');
        $('base-url').focus();
      }
      return;
    }
    if (auto && !payload.apiKey.trim() && !editingId) return;

    const seq = ++fetchSeq;
    setFetchBusy(true);
    if (!auto) setModelHint(t('fetchingModels'), '');
    let result;
    try {
      result = await window.models.fetchModels(payload);
    } catch (error) {
      result = { ok: false, error: String((error && error.message) || error) };
    }
    if (seq !== fetchSeq) {
      setFetchBusy(false);
      return;
    }
    setFetchBusy(false);
    if (result && result.ok) {
      const list = Array.isArray(result.models) ? result.models : [];
      renderModelChoices(list);
      const withDepth = list.filter((model) => Array.isArray(model.efforts) && model.efforts.length).length;
      const message = !list.length
        ? t('fetchEmpty')
        : (withDepth
          ? fill(t('fetchOkDepth'), { n: list.length, d: withDepth })
          : fill(t('fetchOk'), { n: list.length }));
      setModelHint(message, '');
    } else if (!auto) {
      setModelHint(fill(t('fetchFail'), { error: errorText(result) }), 'err');
    }
  }

  function resetForm(focus) {
    clearTimeout(fetchTimer);
    clearModelChoices();
    editingId = null;
    formEl.reset();
    typeEl.value = 'openai';
    apiEl.value = 'chat';
    effortEl.value = '';
    syncTypeFields();
    updateFormChrome();
    refreshDepthInfo();
    if (focus) $('name').focus();
  }

  function startEditing(model) {
    if (actionBusy) return;
    clearTimeout(fetchTimer);
    editingId = model.id;
    typeEl.value = model.type === 'anthropic' ? 'anthropic' : 'openai';
    apiEl.value = model.type === 'reasoning' || model.api === 'responses' ? 'responses' : 'chat';
    const storedEffort = model.effort || (model.type === 'reasoning' ? 'medium' : '');
    effortEl.value = storedEffort;
    if (effortEl.value !== storedEffort) effortEl.value = '';
    syncTypeFields();
    $('name').value = model.name;
    $('model-id').value = model.model;
    $('base-url').value = model.baseUrl;
    $('api-key').value = '';
    clearModelChoices();
    updateFormChrome();
    setStatus(t('keyHintEdit'), '');
    const panel = formEl.closest('.panel');
    if (panel) panel.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    $('name').focus();
    scheduleAutoFetch();
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
    resetForm(false);
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
  fetchBtn.addEventListener('click', () => readRemoteModels({ auto: false }));
  typeEl.addEventListener('change', () => {
    syncTypeFields();
    clearModelChoices();
    scheduleAutoFetch();
  });
  apiEl.addEventListener('change', () => {
    syncTypeFields();
    clearModelChoices();
    scheduleAutoFetch();
  });
  $('model-id').addEventListener('input', refreshDepthInfo);
  $('base-url').addEventListener('change', () => {
    clearModelChoices();
    setModelHint(t('fetchHint'), '');
    scheduleAutoFetch();
  });
  $('api-key').addEventListener('change', () => {
    clearModelChoices();
    setModelHint(t('fetchHint'), '');
    scheduleAutoFetch();
  });
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
    effortEl.value = '';
    applyLabels();
    await refreshList();
  })();
})();
