const $ = (id) => document.getElementById(id);
const statusEl = $('status');

let L = {};

function setStatus(text, kind) {
  statusEl.textContent = text;
  statusEl.className = kind || '';
}

function applyDict(payload) {
  L = payload.dict;
  document.documentElement.lang = payload.lang === 'zh' ? 'zh-CN' : 'en';
  document.title = L.aiSettingsTitle;
  $('title').textContent = L.aiSettingsTitle;
  $('sub').textContent = L.setSub;
  $('lblBaseUrl').textContent = L.setBaseUrlLabel;
  $('lblApiKey').textContent = L.setApiKeyLabel;
  $('lblModel').textContent = L.setModelLabel;
  $('baseUrl').placeholder = L.setBaseUrlPh;
  $('apiKey').placeholder = L.setApiKeyPh;
  $('model').placeholder = L.setModelPh;
  $('save').textContent = L.setSave;
  $('test').textContent = L.setTest;
  document.body.classList.add('ready');
}

window.pet.on('i18n', (payload) => applyDict(payload));

function formValues() {
  return {
    baseUrl: $('baseUrl').value.trim(),
    apiKey: $('apiKey').value.trim(),
    model: $('model').value.trim(),
  };
}

(async () => {
  try {
    applyDict(await window.pet.i18nGet());
    const cfg = await window.pet.aiGetConfig();
    if (cfg) {
      $('baseUrl').value = cfg.baseUrl || '';
      $('apiKey').value = cfg.apiKey || '';
      $('model').value = cfg.model || '';
    }
  } catch {
    document.body.classList.add('ready');
  }
})();
setTimeout(() => document.body.classList.add('ready'), 600);

$('save').addEventListener('click', async () => {
  const res = await window.pet.aiSaveConfig(formValues());
  if (res && res.ok) setStatus(L.setSaved, 'ok');
  else setStatus(L.setSaveFailPrefix + ((res && res.error) || L.unknownError), 'err');
});

$('test').addEventListener('click', async () => {
  $('test').disabled = true;
  setStatus(L.setTesting, '');
  try {
    const res = await window.pet.aiTest(formValues());
    if (res && res.reply) {
      const oneLine = res.reply.replace(/\s+/g, ' ').slice(0, 70);
      setStatus(L.setTestOkPrefix + oneLine, 'ok');
    } else {
      setStatus(L.setTestFailPrefix + ((res && res.error) || L.unknownError), 'err');
    }
  } finally {
    $('test').disabled = false;
  }
});
