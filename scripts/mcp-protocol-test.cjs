const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { RescicleDB } = require('../src/db.cjs');
const { createMcpServer } = require('../src/mcp-server.cjs');

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'rescicle-mcp-test-'));
const research = path.join(tmp, 'research'); fs.mkdirSync(research);
fs.writeFileSync(path.join(research, 'a.csv'), 'x,y\n1,2\n');
const db = new RescicleDB(path.join(tmp, 'db.sqlite'));
const project = db.createProject('P', research);
const server = createMcpServer({ db, getCurrentProjectId: () => project.id });
(async () => {
  const q = await server.callTool('create_object', { type:'question', title:'Q?', origin:'researcher' });
  const h = await server.callTool('create_object', { type:'hypothesis', title:'H', origin:'agent' });
  await server.callTool('create_relation', { subjectId:h.id, predicate:'addresses', objectId:q.id, origin:'agent' });
  const ctx = await server.callTool('get_research_context', {});
  assert.equal(ctx.objects.length, 2);
  const files = await server.callTool('list_project_files', { limit:10 });
  assert.equal(files.length, 1);
  db.close(); fs.rmSync(tmp, { recursive:true, force:true });
  console.log('rescicle MCP tool test: PASS');
})().catch(e => { console.error(e); process.exit(1); });
