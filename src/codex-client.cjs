const fs = require('node:fs');
const path = require('node:path');
const readline = require('node:readline');
const { spawn } = require('node:child_process');
const { EventEmitter } = require('node:events');

const CODEX_TARGET_TRIPLE = {
  'win32-x64': 'x86_64-pc-windows-msvc',
  'win32-arm64': 'aarch64-pc-windows-msvc',
  'darwin-x64': 'x86_64-apple-darwin',
  'darwin-arm64': 'aarch64-apple-darwin',
  'linux-x64': 'x86_64-unknown-linux-musl',
  'linux-arm64': 'aarch64-unknown-linux-musl'
};

function codexPackageRoot() {
  return path.dirname(require.resolve('@openai/codex/package.json'));
}

// @openai/codex ships a bin/codex.js launcher whose only job is to spawn this
// same native binary, but it spawns without windowsHide, so on Windows the
// binary gets its own terminal window and nothing upstream can suppress it.
// Running the binary ourselves keeps that window away and drops a Node process
// from the chain.
function findBundledCodexBinary() {
  if (process.env.RESCICLE_CODEX_BIN) return process.env.RESCICLE_CODEX_BIN;
  const key = `${process.platform}-${process.arch}`;
  const triple = CODEX_TARGET_TRIPLE[key];
  if (!triple) throw new Error(`Codex does not ship a binary for ${key}.`);
  const exe = process.platform === 'win32' ? 'codex.exe' : 'codex';
  // The platform package is the normal location; the vendor directory inside
  // @openai/codex is the same fallback the upstream launcher uses.
  const roots = [];
  try { roots.push(path.dirname(require.resolve(`@openai/codex-${key}/package.json`))); } catch { /* not installed */ }
  try { roots.push(codexPackageRoot()); } catch { /* not installed */ }
  for (const root of roots) {
    const candidate = path.join(root, 'vendor', triple, 'bin', exe);
    if (fs.existsSync(candidate)) return candidate;
  }
  throw new Error(`Bundled Codex binary for ${key} not found.`);
}

class CodexAppServer extends EventEmitter {
  constructor({ workDir, clientVersion = '0.0.2', spawnImpl = spawn, codexBin = null } = {}) {
    super();
    this.workDir = workDir;
    this.clientVersion = clientVersion;
    this.spawnImpl = spawnImpl;
    this.codexBin = codexBin;
    this.proc = null;
    this.nextId = 1;
    this.pending = new Map();
    this.activeTurns = new Map();
    this.started = false;
  }

  async start() {
    if (this.started && this.proc && !this.proc.killed) return;
    fs.mkdirSync(this.workDir, { recursive: true });
    const codexBin = this.codexBin || findBundledCodexBinary();
    const env = { ...process.env };
    // The upstream launcher sets these before handing over to the binary, so
    // Codex keeps seeing the install the same way now that we skip it.
    try { env.CODEX_MANAGED_PACKAGE_ROOT = codexPackageRoot(); } catch { /* leave unset */ }
    env.CODEX_MANAGED_BY_NPM = '1';
    this.proc = this.spawnImpl(codexBin, ['app-server'], {
      cwd: this.workDir,
      env,
      stdio: ['pipe', 'pipe', 'pipe'],
      // Codex is a console program: without this it opens a terminal window.
      windowsHide: true
    });

    this.proc.on('exit', (code, signal) => {
      const error = new Error(`Codex app-server exited (${code ?? signal ?? 'unknown'})`);
      for (const { reject } of this.pending.values()) reject(error);
      this.pending.clear();
      for (const turn of this.activeTurns.values()) turn.reject(error);
      this.activeTurns.clear();
      this.started = false;
      this.emit('exit', { code, signal });
    });

    this.proc.stderr.on('data', chunk => this.emit('stderr', String(chunk)));
    const rl = readline.createInterface({ input: this.proc.stdout });
    rl.on('line', line => this.#handleLine(line));

    await this.request('initialize', {
      clientInfo: { name: 'rescicle', title: 'rescicle', version: this.clientVersion },
      capabilities: {
        optOutNotificationMethods: ['item/agentMessage/delta', 'item/reasoning/summaryTextDelta', 'item/reasoning/textDelta']
      }
    });
    this.notify('initialized', {});
    this.started = true;
  }

  async stop() {
    if (this.proc && !this.proc.killed) this.proc.kill();
    this.proc = null;
    this.started = false;
  }

  #send(message) {
    if (!this.proc?.stdin?.writable) throw new Error('Codex app-server is not running');
    this.proc.stdin.write(`${JSON.stringify(message)}\n`);
  }

  #handleLine(line) {
    let msg;
    try { msg = JSON.parse(line); } catch { return; }

    if (Object.hasOwn(msg, 'id') && !msg.method) {
      const pending = this.pending.get(msg.id);
      if (!pending) return;
      this.pending.delete(msg.id);
      if (msg.error) pending.reject(new Error(msg.error.message || JSON.stringify(msg.error)));
      else pending.resolve(msg.result);
      return;
    }

    // Server-initiated request. rescicle never lets Codex execute commands or edit files.
    if (Object.hasOwn(msg, 'id') && msg.method) {
      const method = msg.method;
      if (method.includes('requestApproval') || method === 'item/tool/requestUserInput' || method === 'item/permissions/requestApproval') {
        this.#send({ id: msg.id, result: { decision: 'decline' } });
      } else {
        this.#send({ id: msg.id, error: { code: -32601, message: `Unsupported server request: ${method}` } });
      }
      return;
    }

    if (msg.method) {
      this.emit('notification', msg);
      this.emit(msg.method, msg.params || {});
      const params = msg.params || {};
      if (msg.method === 'item/completed' && params.item?.type === 'agentMessage') {
        const turnId = params.turnId;
        if (turnId && this.activeTurns.has(turnId)) {
          const state = this.activeTurns.get(turnId);
          // Prefer a final answer over commentary if both are emitted.
          if (params.item.phase === 'final_answer' || !state.text) state.text = params.item.text || '';
        } else if (this.activeTurns.size === 1) {
          const state = [...this.activeTurns.values()][0];
          if (params.item.phase === 'final_answer' || !state.text) state.text = params.item.text || '';
        }
      }
      if (msg.method === 'turn/completed') {
        const turn = params.turn || {};
        const state = this.activeTurns.get(turn.id);
        if (!state) return;
        this.activeTurns.delete(turn.id);
        if (turn.status === 'failed') state.reject(new Error(turn.error?.message || 'Codex turn failed'));
        else if (turn.status === 'interrupted') state.reject(new Error('Codex turn was interrupted'));
        else state.resolve(state.text || '');
      }
    }
  }

  request(method, params = {}, timeoutMs = 30000) {
    const id = this.nextId++;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        if (!this.pending.has(id)) return;
        this.pending.delete(id);
        reject(new Error(`Codex request timed out: ${method}`));
      }, timeoutMs);
      this.pending.set(id, {
        resolve: value => { clearTimeout(timer); resolve(value); },
        reject: error => { clearTimeout(timer); reject(error); }
      });
      this.#send({ method, id, params });
    });
  }

  notify(method, params = {}) { this.#send({ method, params }); }

  async account() {
    await this.start();
    return this.request('account/read', { refreshToken: false });
  }

  async loginChatGPT() {
    await this.start();
    return this.request('account/login/start', {
      type: 'chatgpt',
      useHostedLoginSuccessPage: true,
      appBrand: 'chatgpt'
    });
  }

  async logout() {
    await this.start();
    return this.request('account/logout', {});
  }

  async startThread({ cwd }) {
    await this.start();
    const result = await this.request('thread/start', {
      cwd,
      approvalPolicy: 'never',
      // Codex 0.154 rejects readOnly.access; restricted reads now need a named permissionProfile.
      sandboxPolicy: { type: 'readOnly' },
      personality: 'friendly',
      serviceName: 'rescicle'
    }, 60000);
    return result.thread;
  }

  async resumeThread(threadId) {
    await this.start();
    const result = await this.request('thread/resume', { threadId }, 60000);
    return result.thread;
  }

  async runStructuredTurn({ threadId, text, outputSchema, cwd }) {
    await this.start();
    const result = await this.request('turn/start', {
      threadId,
      input: [{ type: 'text', text }],
      cwd,
      approvalPolicy: 'never',
      // Codex 0.154 rejects readOnly.access; restricted reads now need a named permissionProfile.
      sandboxPolicy: { type: 'readOnly' },
      outputSchema,
      personality: 'friendly'
    }, 60000);
    const turnId = result.turn?.id;
    if (!turnId) throw new Error('Codex did not return a turn id');
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        if (!this.activeTurns.has(turnId)) return;
        this.activeTurns.delete(turnId);
        reject(new Error('Codex turn timed out'));
      }, 180000);
      this.activeTurns.set(turnId, {
        text: '',
        resolve: value => { clearTimeout(timer); resolve(value); },
        reject: error => { clearTimeout(timer); reject(error); }
      });
    });
  }
}

module.exports = { CodexAppServer, findBundledCodexBinary };
