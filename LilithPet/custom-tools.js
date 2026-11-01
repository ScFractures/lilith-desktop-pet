'use strict';

const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

const TOOLS = [
  {
    name: 'run_command',
    permission: 'exec',
    description: 'Run a shell command inside the selected workspace. Returns stdout, stderr and the exit code. Use this for terminal tasks, running tests, git, and scripts.',
    parameters: {
      type: 'object',
      properties: {
        command: { type: 'string', description: 'Shell command to execute.' },
        timeout_ms: {
          type: 'integer',
          description: 'Optional timeout in milliseconds. Omit or use 0 for no timeout.',
        },
      },
      required: ['command'],
      additionalProperties: false,
    },
  },
  {
    name: 'read_file',
    permission: 'read',
    description: 'Read a text file from the workspace. Returns numbered lines. Use offset and limit for large files.',
    parameters: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'File path relative to the workspace.' },
        offset: { type: 'integer', description: 'First line to return, 1-based. Default 1.' },
        limit: { type: 'integer', description: 'Number of lines to return. Default 400; use 0 for all remaining lines. No maximum.' },
      },
      required: ['path'],
      additionalProperties: false,
    },
  },
  {
    name: 'write_file',
    permission: 'write',
    description: 'Write a text file in the workspace, creating parent directories when needed. Overwrites an existing file.',
    parameters: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'File path relative to the workspace.' },
        content: { type: 'string', description: 'Complete new file content.' },
      },
      required: ['path', 'content'],
      additionalProperties: false,
    },
  },
  {
    name: 'list_files',
    permission: 'read',
    description: 'List files and directories under a workspace path. Useful for exploring a project before reading or editing.',
    parameters: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'Directory path relative to the workspace. Default ".".' },
        depth: { type: 'integer', description: 'Directory depth to walk. Default 2; use 0 for all depths. No maximum.' },
      },
      additionalProperties: false,
    },
  },
];

const TOOL_BY_NAME = new Map(TOOLS.map((tool) => [tool.name, tool]));

function toolSpecs() {
  return TOOLS.map(({ name, description, parameters }) => ({ name, description, parameters }));
}

function toolAllowed(name, mode) {
  const tool = TOOL_BY_NAME.get(name);
  if (!tool) return false;
  if (mode === 'yolo') return true;
  if (mode === 'accept_edits') return tool.permission !== 'exec';
  return tool.permission === 'read';
}

function failure(message) {
  return { content: String(message || 'Tool failed'), isError: true };
}

function clampInt(value, fallback, min, max) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.min(max, Math.max(min, Math.trunc(number)));
}

function inside(root, target) {
  const relative = path.relative(root, target);
  return relative === '' || (relative !== '..' && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative));
}

function resolveWorkspacePath(workspace, input) {
  const root = fs.realpathSync(workspace);
  const requested = typeof input === 'string' && input.trim() ? input.trim() : '.';
  const target = path.resolve(root, requested);
  if (!inside(root, target)) throw new Error('path is outside the workspace');
  let probe = target;
  while (!fs.existsSync(probe)) {
    const parent = path.dirname(probe);
    if (parent === probe) break;
    probe = parent;
  }
  if (!inside(root, fs.realpathSync(probe))) throw new Error('path is outside the workspace');
  if (fs.existsSync(target) && !inside(root, fs.realpathSync(target))) {
    throw new Error('path is outside the workspace');
  }
  return target;
}

function relativeName(root, target) {
  const relative = path.relative(root, target);
  return relative || '.';
}

function killProcess(child, force) {
  if (!child || child.exitCode !== null || child.signalCode) return;
  if (process.platform === 'win32') {
    try { child.kill(force ? 'SIGKILL' : 'SIGTERM'); } catch {}
    return;
  }
  try {
    process.kill(-child.pid, force ? 'SIGKILL' : 'SIGTERM');
  } catch {
    try { child.kill(force ? 'SIGKILL' : 'SIGTERM'); } catch {}
  }
}

function runCommand(input, options) {
  return new Promise((resolve) => {
    const command = typeof input.command === 'string' ? input.command.trim() : '';
    if (!command) {
      resolve(failure('run_command requires a non-empty "command".'));
      return;
    }
    const timeoutMs = clampInt(input.timeout_ms, 0, 0, Number.MAX_SAFE_INTEGER);
    const signal = options.signal || null;
    if (signal && signal.aborted) {
      resolve(failure('Command aborted.'));
      return;
    }

    const workspace = fs.realpathSync(options.workspace);
    const win = process.platform === 'win32';
    const shell = win ? (process.env.ComSpec || 'cmd.exe') : (fs.existsSync('/bin/zsh') ? '/bin/zsh' : '/bin/bash');
    const args = win ? ['/d', '/s', '/c', command] : ['-lc', command];

    let child;
    try {
      child = spawn(shell, args, {
        cwd: workspace,
        env: process.env,
        detached: !win,
        stdio: ['ignore', 'pipe', 'pipe'],
      });
    } catch (error) {
      resolve(failure(`Failed to start command: ${error.message}`));
      return;
    }

    let stdout = '';
    let stderr = '';
    let done = false;
    let timedOut = false;
    let aborted = false;
    let timer = null;
    let forceTimer = null;

    const finish = (result) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      clearTimeout(forceTimer);
      if (signal) signal.removeEventListener('abort', onAbort);
      resolve(result);
    };

    const stop = () => {
      killProcess(child, false);
      forceTimer = setTimeout(() => killProcess(child, true), 800);
    };

    const onAbort = () => {
      aborted = true;
      stop();
    };

    if (signal) signal.addEventListener('abort', onAbort, { once: true });
    // Chain long explicit timeouts instead of overflowing Node's 32-bit timer delay.
    if (timeoutMs > 0) {
      const deadline = Date.now() + timeoutMs;
      const checkDeadline = () => {
        const remaining = deadline - Date.now();
        if (remaining <= 0) {
          timedOut = true;
          stop();
        } else {
          timer = setTimeout(checkDeadline, Math.min(remaining, 2147483647));
        }
      };
      checkDeadline();
    }

    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');
    child.stdout.on('data', (chunk) => { stdout += chunk; });
    child.stderr.on('data', (chunk) => { stderr += chunk; });
    child.on('error', (error) => finish(failure(`Failed to run command: ${error.message}`)));
    child.on('close', (code, signalName) => {
      const parts = [];
      if (stdout) parts.push(`stdout:\n${stdout}`);
      if (stderr) parts.push(`stderr:\n${stderr}`);
      if (!stdout && !stderr) parts.push('(no output)');
      parts.push(`exit code: ${code == null ? 'none' : code}${signalName ? ` (signal ${signalName})` : ''}`);
      if (timedOut) parts.push(`command timed out after ${timeoutMs} ms`);
      if (aborted) parts.push('command aborted');
      finish({
        content: parts.join('\n\n'),
        isError: !!(timedOut || aborted || (typeof code === 'number' && code !== 0)),
      });
    });
  });
}

function readFile(input, options) {
  const workspace = fs.realpathSync(options.workspace);
  const target = resolveWorkspacePath(workspace, input.path);
  const stat = fs.statSync(target);
  if (stat.isDirectory()) return failure('read_file needs a file, not a directory. Use list_files instead.');
  const buffer = fs.readFileSync(target);
  if (buffer.subarray(0, 8192).includes(0)) return failure('Cannot read a binary file as text.');
  const allLines = buffer.toString('utf8').split('\n');
  const offset = clampInt(input.offset, 1, 1, allLines.length || 1);
  const limit = input.limit === 0 ? allLines.length : clampInt(input.limit, 400, 1, Number.MAX_SAFE_INTEGER);
  const slice = allLines.slice(offset - 1, offset - 1 + limit);
  const body = slice.map((line, index) => `${offset + index}: ${line}`).join('\n');
  const range = `lines ${offset}-${offset + slice.length - 1} of ${allLines.length}`;
  return {
    content: `${relativeName(workspace, target)} (${range})\n${body}`,
    isError: false,
  };
}

function writeFile(input, options) {
  const workspace = fs.realpathSync(options.workspace);
  if (typeof input.content !== 'string') return failure('write_file requires a string "content".');
  const target = resolveWorkspacePath(workspace, input.path);
  if (fs.existsSync(target) && fs.statSync(target).isDirectory()) {
    return failure('write_file target is a directory.');
  }
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, input.content, 'utf8');
  return {
    content: `Wrote ${Buffer.byteLength(input.content, 'utf8')} bytes to ${relativeName(workspace, target)}.`,
    isError: false,
  };
}

function listFiles(input, options) {
  const workspace = fs.realpathSync(options.workspace);
  const root = resolveWorkspacePath(workspace, input.path);
  if (!fs.statSync(root).isDirectory()) return failure('list_files needs a directory path.');
  const depth = input.depth === 0 ? Infinity : clampInt(input.depth, 2, 1, Number.MAX_SAFE_INTEGER);
  const lines = [];
  const walk = (dir, base, level) => {
    let entries;
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch (error) {
      lines.push(`! ${base || '.'}: ${error.message}`);
      return;
    }
    entries.sort((a, b) => a.name.localeCompare(b.name));
    for (const entry of entries) {
      const rel = base ? `${base}/${entry.name}` : entry.name;
      const full = path.join(dir, entry.name);
      if (entry.isSymbolicLink()) {
        lines.push(`l ${rel}`);
      } else if (entry.isDirectory()) {
        const skipped = entry.name === '.git' || entry.name === 'node_modules';
        lines.push(`d ${rel}/${skipped ? ' (skipped)' : ''}`);
        if (!skipped && level < depth) walk(full, rel, level + 1);
      } else if (entry.isFile()) {
        let size = 0;
        try { size = fs.statSync(full).size; } catch {}
        lines.push(`f ${rel} (${size} B)`);
      }
    }
  };
  walk(root, relativeName(workspace, root) === '.' ? '' : relativeName(workspace, root), 1);
  return {
    content: lines.length ? lines.join('\n') : '(empty directory)',
    isError: false,
  };
}

async function executeTool(name, input, options = {}) {
  const tool = TOOL_BY_NAME.get(name);
  if (!tool) return failure(`Unknown tool: ${name}`);
  const mode = String(options.mode || 'default');
  if (!toolAllowed(name, mode)) {
    const allowed = mode === 'accept_edits' ? 'read and file-editing tools' : 'read-only tools';
    return failure(`Permission denied: mode "${mode}" allows ${allowed}. The user can switch the chat mode to allow ${tool.permission} tools.`);
  }
  const workspace = options.workspace;
  if (!workspace || !fs.existsSync(workspace)) return failure('The selected workspace does not exist.');
  const payload = input && typeof input === 'object' ? input : {};
  try {
    switch (name) {
      case 'run_command':
        return await runCommand(payload, { workspace, signal: options.signal });
      case 'read_file':
        return readFile(payload, { workspace });
      case 'write_file':
        return writeFile(payload, { workspace });
      case 'list_files':
        return listFiles(payload, { workspace });
      default:
        return failure(`Unknown tool: ${name}`);
    }
  } catch (error) {
    return failure(String((error && error.message) || error));
  }
}

module.exports = {
  toolSpecs,
  toolAllowed,
  executeTool,
};
