const readline = require('node:readline');
const fs = require('node:fs');
const { scanFiles, resolveProjectFile } = require('./files.cjs');

function textResult(value) {
  return { content: [{ type: 'text', text: typeof value === 'string' ? value : JSON.stringify(value, null, 2) }] };
}

function createMcpServer({ db, getCurrentProjectId }) {
  const tools = [
    { name: 'get_research_context', description: 'Get the current rescicle project context: research objects, relations, and selected project.', inputSchema: { type: 'object', properties: {}, additionalProperties: false } },
    { name: 'create_object', description: 'Create a proposed research object in the current rescicle project.', inputSchema: { type: 'object', properties: { type: { type: 'string', enum: ['question','hypothesis','prediction','measurement','note'] }, title: { type: 'string' }, body: { type: ['string','null'] }, origin: { type: 'string', enum: ['researcher','agent'] } }, required: ['type','title','origin'], additionalProperties: false } },
    { name: 'create_relation', description: 'Create a proposed relation between existing rescicle objects.', inputSchema: { type: 'object', properties: { subjectId: { type: 'string' }, predicate: { type: 'string', enum: ['addresses','predicts','tested_by','produces','references','related_to'] }, objectId: { type: 'string' }, origin: { type: 'string', enum: ['researcher','agent'] } }, required: ['subjectId','predicate','objectId','origin'], additionalProperties: false } },
    { name: 'set_object_status', description: 'Confirm or reject a rescicle research object when the researcher explicitly decides.', inputSchema: { type: 'object', properties: { objectId: { type: 'string' }, status: { type: 'string', enum: ['proposed','confirmed','rejected'] } }, required: ['objectId','status'], additionalProperties: false } },
    { name: 'list_project_files', description: 'List file names and metadata inside the current research folder. Does not return file contents.', inputSchema: { type: 'object', properties: { limit: { type: 'integer', minimum: 1, maximum: 300 } }, additionalProperties: false } },
    { name: 'register_asset', description: 'Register an existing file inside the current research folder as an Asset object.', inputSchema: { type: 'object', properties: { relativePath: { type: 'string' } }, required: ['relativePath'], additionalProperties: false } }
  ];

  async function callTool(name, args = {}) {
    const projectId = getCurrentProjectId();
    if (!projectId) throw new Error('No rescicle project is currently open. Open a project in the rescicle app first.');
    const project = db.getProject(projectId);
    if (!project) throw new Error('Current project not found');
    if (name === 'get_research_context') return db.context(projectId, null);
    if (name === 'create_object') return db.createObject(projectId, { type: args.type, title: args.title, body: args.body || null, origin: args.origin, status: 'proposed' }, args.origin === 'researcher' ? 'researcher-via-mcp' : 'agent-via-mcp');
    if (name === 'create_relation') return db.createRelation(projectId, { subjectId: args.subjectId, predicate: args.predicate, objectId: args.objectId, origin: args.origin, status: 'proposed' }, args.origin === 'researcher' ? 'researcher-via-mcp' : 'agent-via-mcp');
    if (name === 'set_object_status') return db.updateObjectStatus(args.objectId, args.status, 'researcher-via-mcp');
    if (name === 'list_project_files') return scanFiles(project.root_path, Math.min(args.limit || 120, 300));
    if (name === 'register_asset') return db.registerAsset(projectId, resolveProjectFile(project.root_path, args.relativePath));
    throw new Error(`Unknown tool: ${name}`);
  }

  return { tools, callTool };
}

// In a packaged Electron app on Windows, process.stdin is a dummy Readable that ends
// immediately, so stdio MCP clients (Claude Code) never reach the server. Reading fd 0
// directly works in both Electron and plain Node.
function stdinStream() {
  try {
    return fs.createReadStream(null, { fd: 0, autoClose: false });
  } catch {
    return process.stdin;
  }
}

function runStdioMcp({ db, getCurrentProjectId, input = stdinStream(), output = process.stdout }) {
  const server = createMcpServer({ db, getCurrentProjectId });
  const rl = readline.createInterface({ input });
  const send = msg => output.write(`${JSON.stringify(msg)}\n`);
  rl.on('line', async line => {
    let msg;
    try { msg = JSON.parse(line); } catch { return; }
    if (!Object.hasOwn(msg, 'id')) return;
    try {
      if (msg.method === 'initialize') {
        send({ jsonrpc: '2.0', id: msg.id, result: { protocolVersion: msg.params?.protocolVersion || '2025-11-25', capabilities: { tools: {} }, serverInfo: { name: 'rescicle', version: '0.0.2' }, instructions: 'Use rescicle tools to read and propose changes to the current research project. Keep agent-generated scientific objects proposed unless the researcher explicitly confirms them.' } });
      } else if (msg.method === 'tools/list') {
        send({ jsonrpc: '2.0', id: msg.id, result: { tools: server.tools } });
      } else if (msg.method === 'tools/call') {
        const result = await server.callTool(msg.params?.name, msg.params?.arguments || {});
        send({ jsonrpc: '2.0', id: msg.id, result: textResult(result) });
      } else {
        send({ jsonrpc: '2.0', id: msg.id, error: { code: -32601, message: `Method not found: ${msg.method}` } });
      }
    } catch (error) {
      send({ jsonrpc: '2.0', id: msg.id, result: { content: [{ type: 'text', text: error.message }], isError: true } });
    }
  });
  return server;
}

module.exports = { createMcpServer, runStdioMcp };
