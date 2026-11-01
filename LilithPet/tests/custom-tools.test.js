const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { executeTool } = require('../custom-tools');

function fixture(t) {
  const workspace = fs.mkdtempSync(path.join(os.tmpdir(), 'lilith-tools-test-'));
  t.after(() => fs.rmSync(workspace, { recursive: true, force: true }));
  return { workspace, mode: 'yolo' };
}

test('reads and writes beyond previous file size, character and line caps', async (t) => {
  const options = fixture(t);
  const content = Array.from({ length: 3000 }, (_, i) => `${i}: ${'x'.repeat(1000)}`).join('\n');
  assert.equal((await executeTool('write_file', { path: 'large.txt', content }, options)).isError, false);
  for (const limit of [0, 4000]) {
    const result = await executeTool('read_file', { path: 'large.txt', limit }, options);
    assert.equal(result.isError, false);
    assert.ok(result.content.endsWith(`3000: 2999: ${'x'.repeat(1000)}`));
    assert.ok(!result.content.includes('truncated'));
  }
});

test('lists beyond 400 entries and three directory levels', async (t) => {
  const options = fixture(t);
  for (let i = 0; i < 450; i++) fs.writeFileSync(path.join(options.workspace, `${i}.txt`), '');
  fs.mkdirSync(path.join(options.workspace, 'a/b/c/d/e'), { recursive: true });
  fs.writeFileSync(path.join(options.workspace, 'a/b/c/d/e/end.txt'), '');
  for (const depth of [0, 10]) {
    const result = await executeTool('list_files', { depth }, options);
    assert.equal(result.isError, false);
    assert.ok(result.content.includes('a/b/c/d/e/end.txt'));
    assert.ok(result.content.includes('449.txt'));
  }
});

test('returns full stdout and stderr without truncation', async (t) => {
  const options = fixture(t);
  fs.writeFileSync(path.join(options.workspace, 'output.js'), "process.stdout.write('a'.repeat(100000) + 'STDOUT_END'); process.stderr.write('b'.repeat(100000) + 'STDERR_END');");
  const result = await executeTool('run_command', { command: `${JSON.stringify(process.execPath)} output.js` }, options);
  assert.equal(result.isError, false);
  assert.ok(result.content.includes('a'.repeat(100000) + 'STDOUT_END'));
  assert.ok(result.content.includes('b'.repeat(100000) + 'STDERR_END'));
});

test('unlimited command can still be aborted and explicit timeouts still work', async (t) => {
  const options = fixture(t);
  fs.writeFileSync(path.join(options.workspace, 'wait.js'), 'setInterval(() => {}, 1000);');
  const command = `${JSON.stringify(process.execPath)} wait.js`;
  const controller = new AbortController();
  const pending = executeTool('run_command', { command }, { ...options, signal: controller.signal });
  const timer = setTimeout(() => controller.abort(), 200);
  t.after(() => clearTimeout(timer));
  assert.match((await pending).content, /command aborted/);
  const result = await executeTool('run_command', { command, timeout_ms: 200 }, options);
  assert.equal(result.isError, true);
  assert.match(result.content, /timed out after 200 ms/);
});

test('permission modes and workspace boundaries remain enforced', async (t) => {
  const options = fixture(t);
  assert.equal((await executeTool('run_command', { command: 'pwd' }, { ...options, mode: 'default' })).isError, true);
  assert.equal((await executeTool('read_file', { path: '../outside.txt' }, options)).isError, true);
});
