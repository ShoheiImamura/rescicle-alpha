const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { RescicleDB } = require('../src/db.cjs');
const { scanFiles } = require('../src/files.cjs');
const { applyOperations } = require('../src/agent.cjs');

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'rescicle-test-'));
const research = path.join(tmp, 'research'); fs.mkdirSync(research);
fs.writeFileSync(path.join(research, '20K.csv'), 'temperature,resistance\n20,10\n');
fs.mkdirSync(path.join(research, 'nested'));
fs.writeFileSync(path.join(research, 'nested', '25K.csv'), 'temperature,resistance\n25,8\n');
const db = new RescicleDB(path.join(tmp, 'rescicle.sqlite'));
const project = db.createProject('Low temperature study', research);

assert.equal(db.renameProject(project.id, '  Low temperature study (2026)  ').name, 'Low temperature study (2026)');
assert.equal(db.getProject(project.id).name, 'Low temperature study (2026)');
let emptyName = false;
try { db.renameProject(project.id, '   '); } catch { emptyName = true; }
assert.equal(emptyName, true);

const q = db.createObject(project.id, { type:'question', title:'How does resistance change?', body:null, origin:'researcher', status:'confirmed' }, 'researcher');
const h = db.createObject(project.id, { type:'hypothesis', title:'State change near 25 K', body:null, origin:'researcher', status:'proposed' }, 'researcher');
db.createRelation(project.id, { subjectId:h.id, predicate:'addresses', objectId:q.id, origin:'researcher', status:'proposed' }, 'researcher');
assert.equal(db.listObjects(project.id, 'hypothesis').length, 1);
assert.equal(db.getObject(h.id).outgoing[0].object_id, q.id);

const files = scanFiles(research);
assert.equal(files.length, 2);
const asset = db.registerAsset(project.id, path.join(research, '20K.csv'));
assert.equal(asset.type, 'asset');

const applied = applyOperations({
  db, project, projectId: project.id,
  operations: [
    { op:'create_object', ref:'p1', object_type:'prediction', id:null, title:'A second sample shows the same change', body:null, origin:'agent', status:'proposed', subject:null, predicate:null, object:null, path:null },
    { op:'create_relation', ref:null, object_type:null, id:null, title:null, body:null, origin:'agent', status:'proposed', subject:h.id, predicate:'predicts', object:'p1', path:null },
    { op:'register_asset', ref:'a2', object_type:null, id:null, title:null, body:null, origin:null, status:null, subject:null, predicate:null, object:null, path:'nested/25K.csv' }
  ]
});
assert.equal(applied.filter(x => x.ok).length, 3);
assert.equal(db.listObjects(project.id, 'prediction').length, 1);
assert.equal(db.listObjects(project.id, 'asset').length, 2);

// Re-pointing the research folder: the wrong one can be picked at onboarding and
// there has to be a way back. Assets hold a path relative to the root, so the call
// reports the ones the new folder does not have.
const moved = path.join(tmp, 'moved'); fs.mkdirSync(moved);
fs.writeFileSync(path.join(moved, '20K.csv'), 'temperature,resistance');
const rerooted = db.setProjectRoot(project.id, moved);
assert.equal(rerooted.project.root_path, moved);
assert.deepEqual(rerooted.missing, [path.join('nested', '25K.csv')]);
assert.equal(db.setProjectRoot(project.id, research).missing.length, 0);
let badRoot = 0;
try { db.setProjectRoot(project.id, path.join(tmp, 'nope')); } catch { badRoot += 1; }
try { db.setProjectRoot(project.id, path.join(research, '20K.csv')); } catch { badRoot += 1; }
assert.equal(badRoot, 2);

let blocked = false;
try { db.registerAsset(project.id, path.join(tmp, 'outside.txt')); } catch { blocked = true; }
assert.equal(blocked, true);

db.close();
fs.rmSync(tmp, { recursive:true, force:true });
console.log('rescicle smoke test: PASS');
