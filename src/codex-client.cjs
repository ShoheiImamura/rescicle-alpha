const fs = require('node:fs');
const path = require('node:path');
const readline = require('node:readline');
const { spawn } = require('node:child_process');
const { EventEmitter } = require('node:events');

function findBundledCodexEntry() {
  if (process.env.RESCICLE_CODEX_ENTRY) return process.env.RESCICLE_CODEX_ENTRY;
  const pkg = require.resolve('@openai/codex/package.json');
  return path.join(path.dirname(pkg), 'bin', 'codex.js');
}

class CodexAppServer extends EventEmitter {
  constructor({ workDir, clientVersion = '0.0.2', spawnImpl = spawn, codexEntry = null } = {}) {
    super();
    this.workDir = workDir;
    this.clientVersion = clientVersion;
    this.spawnImpl = spawnImpl;
    this.codexEntry = codexEntry;
    this.proc = null;
    this.nextId = 1;
    this.pending = new Map();
    this.activeTurns = new Map();
    this.started = false;
  }

  async start() {
    if (this.started && this.proc && !this.proc.killed) return;
    fs.mkdirSync(this.workDir, { recursive: true });
    const codexEntry = this.codexEntry || findBundledCodexEntry();
    const env = { ...process.env };
    // Electron can act as Node for the bundled Codex JS launcher.
    if (process.versions?.electron) env.ELECTRON_RUN_AS_NODE = '1';
    this.proc = this.spawnImpl(process.execPath, [codexEntry, 'app-server'], {
      cwd: this.workDir,
      env,
      stdio: ['pipe', 'pipe', 'pipe'],
      // ELECTRON_RUN_AS_NODE pops up a console window on Windows unless it is hidden.
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

module.exports = { CodexAppServer, findBundledCodexEntry };
