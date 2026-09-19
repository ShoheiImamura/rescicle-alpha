const assert = require('node:assert/strict');
const os = require('node:os');
const fs = require('node:fs');
const path = require('node:path');
const { PassThrough, Writable } = require('node:stream');
const { EventEmitter } = require('node:events');
const { CodexAppServer } = require('../src/codex-client.cjs');

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'rescicle-codex-test-'));
function fakeSpawn() {
  const proc = new EventEmitter();
  proc.stdout = new PassThrough();
  proc.stderr = new PassThrough();
  proc.killed = false;
  proc.kill = () => { proc.killed = true; proc.emit('exit', 0, null); };
  let buf = '';
  proc.stdin = new Writable({
    write(chunk, enc, cb) {
      buf += chunk.toString();
      let i;
      while ((i = buf.indexOf('\n')) >= 0) {
        const line = buf.slice(0, i); buf = buf.slice(i + 1);
        if (!line) continue;
        const msg = JSON.parse(line);
        if (!Object.hasOwn(msg, 'id')) continue;
        const reply = result => proc.stdout.write(JSON.stringify({ id: msg.id, result }) + '\n');
        if (msg.method === 'initialize') reply({});
        else if (msg.method === 'account/read') reply({ account: { type:'chatgpt', email:'x@example.test', planType:'plus' }, requiresOpenaiAuth:true });
        else if (msg.method === 'thread/start') reply({ thread:{ id:'thr_1' } });
        else if (msg.method === 'turn/start') {
          reply({ turn:{ id:'turn_1', status:'inProgress', items:[] } });
          setImmediate(() => {
            proc.stdout.write(JSON.stringify({ method:'item/completed', params:{ turnId:'turn_1', item:{ type:'agentMessage', phase:'final_answer', text:'{"reply":"ok","operations":[]}' } } })+'\n');
            proc.stdout.write(JSON.stringify({ method:'turn/completed', params:{ turn:{ id:'turn_1', status:'completed', items:[], error:null } } })+'\n');
          });
        } else reply({});
      }
      cb();
    }
  });
  return proc;
}

(async () => {
  const codex = new CodexAppServer({ workDir: tmp, codexBin: '/fake/codex', spawnImpl: fakeSpawn });
  const account = await codex.account();
  assert.equal(account.account.planType, 'plus');
  const thread = await codex.startThread({ cwd: tmp });
  assert.equal(thread.id, 'thr_1');
  const out = await codex.runStructuredTurn({ threadId:'thr_1', text:'hello', outputSchema:{type:'object'}, cwd:tmp });
  assert.equal(JSON.parse(out).reply, 'ok');
  await codex.stop();
  fs.rmSync(tmp, { recursive:true, force:true });
  console.log('codex app-server protocol test: PASS');
})().catch(e => { console.error(e); process.exit(1); });
