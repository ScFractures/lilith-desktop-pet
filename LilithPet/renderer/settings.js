const $ = (id) => document.getElementById(id);
const statusEl = $('status');

function setStatus(text, kind) {
  statusEl.textContent = text;
  statusEl.className = kind || '';
}

function formValues() {
  return {
    baseUrl: $('baseUrl').value.trim(),
    apiKey: $('apiKey').value.trim(),
    model: $('model').value.trim(),
  };
}

(async () => {
  try {
    const cfg = await window.pet.aiGetConfig();
    if (cfg) {
      $('baseUrl').value = cfg.baseUrl || '';
      $('apiKey').value = cfg.apiKey || '';
      $('model').value = cfg.model || '';
    }
  } catch {}
})();

$('save').addEventListener('click', async () => {
  const res = await window.pet.aiSaveConfig(formValues());
  if (res && res.ok) setStatus('已保存', 'ok');
  else setStatus('保存失败：' + ((res && res.error) || '未知错误'), 'err');
});

$('test').addEventListener('click', async () => {
  $('test').disabled = true;
  setStatus('测试中…', '');
  try {
    const res = await window.pet.aiTest(formValues());
    if (res && res.reply) {
      const oneLine = res.reply.replace(/\s+/g, ' ').slice(0, 70);
      setStatus('连接成功，回复：' + oneLine, 'ok');
    } else {
      setStatus('失败：' + ((res && res.error) || '未知错误'), 'err');
    }
  } finally {
    $('test').disabled = false;
  }
});
