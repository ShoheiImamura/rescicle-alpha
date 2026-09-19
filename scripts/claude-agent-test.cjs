const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { EventEmitter } = require('node:events');
const { PassThrough } = require('node:stream');
const { RescicleDB } = require('../src/db.cjs');
const { ClaudeAgent, parseStructured } = require('../src/claude-agent.cjs');

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'rescicle-claude-test-'));
const research = path.join(tmp, 'research');
fs.mkdirSync(research);
fs.writeFileSync(path.join(research, 'a.csv'), 'x,y\n1,2\n');
const db = new RescicleDB(path.join(tmp, 'db.sqlite'));
const project = db.createProject('P', research);

const calls = [];
function fakeSpawn(reply) {
  return (bin, args) => {
    const child = new EventEmitter();
    child.stdout = new PassThrough();
    child.stderr = new PassThrough();
    child.stdin = {
      end: chunk => {
        calls.push({ bin, args, stdin: chunk || '' });
        const envelope = JSON.stringify({ type: 'result', is_error: false, result: reply, session_id: 'sess-1' });
        setImmediate(() => {
          child.stdout.end(envelope);
          child.stderr.end();
          setImmediate(() => child.emit('exit', 0));
        });
      }
    };
    return child;
  };
}

const STRUCTURED = JSON.stringify({
  reply: 'まずビルド時間の内訳を測りましょう。',
  operations: [
    { op: 'create_object', ref: 'h1', object_type: 'hypothesis', id: null, title: '型チェックが律速', body: null, origin: 'agent', status: 'proposed', subject: null, predicate: null, object: null, path: null }
  ]
});

(async () => {
  // fenced output must still parse
  assert.equal(parseStructured('```json\n{"reply":"x","operations":[]}\n```').reply, 'x');
  assert.equal(parseStructured('no json here'), null);

  let sessionId = null;
  const agent = new ClaudeAgent({
    workDir: path.join(tmp, 'agent-workspace'),
    getSessionId: () => sessionId,
    setSessionId: (_projectId, id) => { sessionId = id; },
    spawnImpl: fakeSpawn(STRUCTURED),
    bin: 'claude-stub'
  });

  const first = await agent.chat({ db, projectId: project.id, text: 'ビルドが遅い', selectedObjectId: null, fileIndex: [] });
  assert.equal(first.reply, 'まずビルド時間の内訳を測りましょう。');
  assert.equal(first.operations.length, 1);
  assert.equal(first.operations[0].ok, true);
  assert.equal(db.listObjects(project.id, 'hypothesis').length, 1);
  assert.equal(sessionId, 'sess-1');

  const firstArgs = calls[0].args;
  assert.ok(firstArgs.includes('-p'), '-p is required for headless mode');
  assert.deepEqual(firstArgs.slice(firstArgs.indexOf('--output-format'), firstArgs.indexOf('--output-format') + 2), ['--output-format', 'json']);
  assert.ok(firstArgs.includes('--strict-mcp-config'), 'rescicle MCP server must not load back into the child');
  assert.equal(firstArgs[firstArgs.indexOf('--allowedTools') + 1], '', 'the chat turn must not get tools');
  assert.ok(firstArgs.includes('--session-id'), 'first turn opens a new session');
  assert.ok(!firstArgs.includes('--resume'));
  // the researcher prompt travels on stdin, not argv (Windows argv limit)
  assert.ok(calls[0].stdin.includes('ビルドが遅い'));
  assert.ok(calls[0].stdin.includes('FILE INDEX'));

  await agent.chat({ db, projectId: project.id, text: '続き', selectedObjectId: null, fileIndex: [] });
  const secondArgs = calls[1].args;
  assert.ok(secondArgs.includes('--resume'), 'later turns resume the stored session');
  assert.equal(secondArgs[secondArgs.indexOf('--resume') + 1], 'sess-1');

  db.close();
  fs.rmSync(tmp, { recursive: true, force: true });
  console.log('rescicle Claude agent test: PASS');
})().catch(e => { console.error(e); process.exit(1); });
