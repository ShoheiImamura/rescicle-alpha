const fs = require('node:fs');
const path = require('node:path');
const { resolveProjectFile } = require('./files.cjs');

const RESPONSE_SCHEMA = {
  type: 'object',
  properties: {
    reply: { type: 'string' },
    operations: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          op: { type: 'string', enum: ['create_object', 'create_relation', 'set_status', 'register_asset'] },
          ref: { anyOf: [{ type: 'string' }, { type: 'null' }] },
          object_type: { anyOf: [{ type: 'string', enum: ['question', 'hypothesis', 'prediction', 'measurement', 'note'] }, { type: 'null' }] },
          id: { anyOf: [{ type: 'string' }, { type: 'null' }] },
          title: { anyOf: [{ type: 'string' }, { type: 'null' }] },
          body: { anyOf: [{ type: 'string' }, { type: 'null' }] },
          origin: { anyOf: [{ type: 'string', enum: ['researcher', 'agent'] }, { type: 'null' }] },
          status: { anyOf: [{ type: 'string', enum: ['proposed', 'confirmed', 'rejected'] }, { type: 'null' }] },
          subject: { anyOf: [{ type: 'string' }, { type: 'null' }] },
          predicate: { anyOf: [{ type: 'string', enum: ['addresses', 'predicts', 'tested_by', 'produces', 'references', 'related_to'] }, { type: 'null' }] },
          object: { anyOf: [{ type: 'string' }, { type: 'null' }] },
          path: { anyOf: [{ type: 'string' }, { type: 'null' }] }
        },
        required: ['op', 'ref', 'object_type', 'id', 'title', 'body', 'origin', 'status', 'subject', 'predicate', 'object', 'path'],
        additionalProperties: false
      }
    }
  },
  required: ['reply', 'operations'],
  additionalProperties: false
};

const AGENT_INSTRUCTIONS = `# rescicle research copilot\n\nYou are the reasoning agent inside rescicle. The researcher talks naturally; you help make their research objects visible without turning every sentence into formal data.\n\nThe v0 domain has only: question, hypothesis, prediction, measurement, asset, note. Relations are: hypothesis addresses question; hypothesis predicts prediction; prediction tested_by measurement; measurement produces asset; otherwise references/related_to.\n\nRules:\n- Do not force every sentence into a scientific object. Use note when uncertain, or create no operation.\n- A researcher statement can be represented with origin=researcher. Your own alternative hypotheses/predictions use origin=agent.\n- New scientific objects are proposed by default. Only set confirmed/rejected when the researcher explicitly confirms/rejects something in this turn.\n- Never treat model confidence as scientific truth.\n- Do not invent files. Only register assets that appear in FILE INDEX.\n- File paths in operations must use the relative path exactly as shown in FILE INDEX.\n- Prefer a few useful objects over many speculative ones.\n- If a currently selected object exists, words like "this/これ" usually refer to it.\n- Reply conversationally in the researcher's language.\n- Return only the object required by the supplied output schema. The application validates and executes operations; you do not directly modify storage or research files.\n- Do not run commands, edit files, browse the web, or inspect the local machine. Your only job in this app is conversation and structured research reasoning.`;

function ensureAgentWorkspace(workDir) {
  fs.mkdirSync(workDir, { recursive: true });
  const instructions = path.join(workDir, 'AGENTS.md');
  if (!fs.existsSync(instructions) || fs.readFileSync(instructions, 'utf8') !== AGENT_INSTRUCTIONS) {
    fs.writeFileSync(instructions, AGENT_INSTRUCTIONS, 'utf8');
  }
}

class CodexAgent {
  constructor({ codex, workDir, getThreadId, setThreadId }) {
    this.codex = codex;
    this.workDir = workDir;
    this.getThreadId = getThreadId;
    this.setThreadId = setThreadId;
    ensureAgentWorkspace(workDir);
  }

  async ensureThread(projectId) {
    let threadId = this.getThreadId(projectId);
    if (threadId) {
      try {
        const thread = await this.codex.resumeThread(threadId);
        return thread.id;
      } catch {
        this.setThreadId(projectId, null);
      }
    }
    const thread = await this.codex.startThread({ cwd: this.workDir });
    this.setThreadId(projectId, thread.id);
    return thread.id;
  }

  async chat({ db, projectId, text, selectedObjectId, fileIndex }) {
    const account = await this.codex.account();
    if (!account?.account) throw new Error('ChatGPTにサインインしてください。AI設定からログインできます。');
    const threadId = await this.ensureThread(projectId);
    const context = db.context(projectId, selectedObjectId);
    const safeFiles = fileIndex.slice(0, 120).map(f => ({ path: f.relative_path, size_bytes: f.size_bytes, modified_at: f.modified_at }));
    const prompt = [
      'PROJECT CONTEXT (rescicle local record, summarized):',
      JSON.stringify(context),
      'FILE INDEX (names/metadata only; raw file contents were not sent):',
      JSON.stringify(safeFiles),
      'CURRENT USER MESSAGE:',
      text
    ].join('\n\n');
    const output = await this.codex.runStructuredTurn({ threadId, text: prompt, outputSchema: RESPONSE_SCHEMA, cwd: this.workDir });
    let structured;
    try { structured = JSON.parse(output); }
    catch { throw new Error(`Codex returned invalid structured output: ${String(output).slice(0, 300)}`); }
    const applied = applyOperations({ db, project: db.getProject(projectId), projectId, operations: structured.operations });
    return { reply: structured.reply, operations: applied };
  }
}

function applyOperations({ db, project, projectId, operations }) {
  const refs = new Map();
  const applied = [];
  const resolve = value => refs.get(value) || value;

  for (const op of operations || []) {
    try {
      if (op.op === 'create_object') {
        const created = db.createObject(projectId, {
          type: op.object_type,
          title: op.title || 'Untitled',
          body: op.body,
          origin: op.origin || 'agent',
          status: op.status || 'proposed'
        }, op.origin === 'researcher' ? 'researcher-via-agent' : 'agent');
        if (op.ref) refs.set(op.ref, created.id);
        applied.push({ ok: true, op: op.op, id: created.id });
      } else if (op.op === 'register_asset') {
        if (!op.path) throw new Error('path required');
        const absolute = resolveProjectFile(project.root_path, op.path);
        const asset = db.registerAsset(projectId, absolute);
        if (op.ref) refs.set(op.ref, asset.id);
        applied.push({ ok: true, op: op.op, id: asset.id });
      } else if (op.op === 'create_relation') {
        const relation = db.createRelation(projectId, {
          subjectId: resolve(op.subject), predicate: op.predicate, objectId: resolve(op.object),
          origin: op.origin || 'agent', status: op.status || 'proposed'
        }, op.origin === 'researcher' ? 'researcher-via-agent' : 'agent');
        applied.push({ ok: true, op: op.op, id: relation.id });
      } else if (op.op === 'set_status') {
        const target = resolve(op.id);
        const updated = db.updateObjectStatus(target, op.status, 'researcher-via-agent');
        applied.push({ ok: true, op: op.op, id: updated.id, status: updated.status });
      }
    } catch (error) {
      applied.push({ ok: false, op: op.op, error: error.message });
    }
  }
  return applied;
}

module.exports = { CodexAgent, applyOperations, RESPONSE_SCHEMA, AGENT_INSTRUCTIONS, ensureAgentWorkspace };
