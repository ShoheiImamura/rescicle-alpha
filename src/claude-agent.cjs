const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const { spawn } = require('node:child_process');
const { RESPONSE_SCHEMA, AGENT_INSTRUCTIONS, buildPrompt, applyOperations, ensureAgentWorkspace } = require('./agent.cjs');

const OUTPUT_CONTRACT = [
  '',
  '## Output format',
  'Return exactly one JSON object and nothing else: no prose before or after it, no markdown code fence.',
  'The object must match this JSON schema:',
  JSON.stringify(RESPONSE_SCHEMA),
  'Every operation object must contain all the keys listed in the schema; use null for the ones that do not apply.',
  'If no research object should change, return an empty operations array.'
].join('\n');

const SYSTEM_PROMPT = `${AGENT_INSTRUCTIONS}\n${OUTPUT_CONTRACT}`;

function candidateBins() {
  const list = [];
  if (process.env.RESCICLE_CLAUDE_BIN) list.push(process.env.RESCICLE_CLAUDE_BIN);
  const home = os.homedir();
  if (home) {
    list.push(path.join(home, '.local', 'bin', process.platform === 'win32' ? 'claude.exe' : 'claude'));
    list.push(path.join(home, '.claude', 'local', process.platform === 'win32' ? 'claude.exe' : 'claude'));
  }
  const pathDirs = (process.env.PATH || '').split(path.delimiter).filter(Boolean);
  const names = process.platform === 'win32' ? ['claude.exe', 'claude.cmd', 'claude.bat'] : ['claude'];
  for (const dir of pathDirs) for (const name of names) list.push(path.join(dir, name));
  return list;
}

// Claude Code is a user-installed CLI, so its location is discovered rather than bundled.
function resolveClaudeBin() {
  for (const candidate of candidateBins()) {
    try { if (fs.statSync(candidate).isFile()) return candidate; } catch { /* keep looking */ }
  }
  return null;
}

function stripFence(text) {
  const trimmed = String(text || '').trim();
  if (!trimmed.startsWith('```')) return trimmed;
  return trimmed.replace(/^```[a-zA-Z]*\s*/, '').replace(/```\s*$/, '').trim();
}

function parseStructured(resultText) {
  const text = stripFence(resultText);
  try { return JSON.parse(text); } catch { /* fall through to brace scan */ }
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start >= 0 && end > start) {
    try { return JSON.parse(text.slice(start, end + 1)); } catch { /* unparsable */ }
  }
  return null;
}

class ClaudeAgent {
  constructor({ workDir, getSessionId, setSessionId, spawnImpl = spawn, bin = null, timeoutMs = 180000 }) {
    this.workDir = workDir;
    this.getSessionId = getSessionId;
    this.setSessionId = setSessionId;
    this.spawnImpl = spawnImpl;
    this.bin = bin;
    this.timeoutMs = timeoutMs;
    ensureAgentWorkspace(workDir);
  }

  executable() {
    if (!this.bin) this.bin = resolveClaudeBin();
    return this.bin;
  }

  #run(args, stdin) {
    const bin = this.executable();
    if (!bin) throw new Error('Claude Codeが見つかりません。claudeコマンドをインストールしてから再試行してください。');
    return new Promise((resolve, reject) => {
      const child = this.spawnImpl(bin, args, {
        cwd: this.workDir,
        env: { ...process.env },
        stdio: ['pipe', 'pipe', 'pipe'],
        // Without this the CLI gets its own console window on Windows.
        windowsHide: true
      });
      let out = '';
      let err = '';
      const timer = setTimeout(() => {
        try { child.kill(); } catch { /* already gone */ }
        reject(new Error('Claude Codeの応答がタイムアウトしました。'));
      }, this.timeoutMs);
      child.stdout.on('data', chunk => { out += chunk; });
      child.stderr.on('data', chunk => { err += chunk; });
      child.on('error', error => { clearTimeout(timer); reject(error); });
      child.on('exit', code => { clearTimeout(timer); resolve({ code, out, err }); });
      if (stdin !== undefined) { child.stdin.end(stdin); } else { child.stdin.end(); }
    });
  }

  async status() {
    const bin = this.executable();
    if (!bin) return { available: false, provider: 'claude', error: 'claudeコマンドが見つかりません', bin: null, version: null };
    try {
      const { code, out, err } = await this.#run(['--version']);
      if (code !== 0) return { available: false, provider: 'claude', error: (err || out || `exit ${code}`).trim().slice(0, 200), bin, version: null };
      return { available: true, provider: 'claude', error: null, bin, version: out.trim().split('\n')[0] };
    } catch (error) {
      return { available: false, provider: 'claude', error: error.message, bin, version: null };
    }
  }

  // --strict-mcp-config keeps rescicle's own MCP server from being loaded back into this
  // child process, and an empty --allowedTools keeps the turn to plain reasoning.
  #turnArgs(sessionId, isNew) {
    return [
      '-p',
      '--output-format', 'json',
      '--system-prompt', SYSTEM_PROMPT,
      '--allowedTools', '',
      '--strict-mcp-config',
      isNew ? '--session-id' : '--resume', sessionId
    ];
  }

  async #turn(projectId, prompt) {
    let sessionId = this.getSessionId(projectId);
    let isNew = false;
    if (!sessionId) { sessionId = crypto.randomUUID(); isNew = true; }

    let run = await this.#run(this.#turnArgs(sessionId, isNew), prompt);
    if (run.code !== 0 && !isNew) {
      // The stored session can be gone (cleared history, another machine): start a fresh one.
      sessionId = crypto.randomUUID();
      isNew = true;
      run = await this.#run(this.#turnArgs(sessionId, true), prompt);
    }
    if (run.code !== 0) {
      const detail = (run.err || run.out || '').trim().slice(0, 300);
      throw new Error(`Claude Codeがエラーを返しました: ${detail || `exit ${run.code}`}`);
    }

    let envelope;
    try { envelope = JSON.parse(run.out); }
    catch { throw new Error(`Claude Codeの出力を解釈できませんでした: ${run.out.slice(0, 300)}`); }
    if (envelope.is_error) throw new Error(`Claude Codeがエラーを返しました: ${String(envelope.result || '').slice(0, 300)}`);

    this.setSessionId(projectId, envelope.session_id || sessionId);
    return envelope.result;
  }

  async chat({ db, projectId, text, selectedObjectId, fileIndex }) {
    const prompt = buildPrompt({ db, projectId, text, selectedObjectId, fileIndex });
    let structured = parseStructured(await this.#turn(projectId, prompt));
    if (!structured) {
      structured = parseStructured(await this.#turn(projectId, 'Return the previous answer again as a single JSON object matching the schema, with no other text.'));
    }
    if (!structured || typeof structured.reply !== 'string') {
      throw new Error('Claude Codeが期待した形式のJSONを返しませんでした。');
    }
    const applied = applyOperations({ db, project: db.getProject(projectId), projectId, operations: structured.operations });
    return { reply: structured.reply, operations: applied };
  }
}

module.exports = { ClaudeAgent, resolveClaudeBin, parseStructured, SYSTEM_PROMPT };
