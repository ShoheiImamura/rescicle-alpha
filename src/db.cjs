const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { DatabaseSync } = require('node:sqlite');
const { validateObjectInput, validateRelationInput, allowedRelation } = require('./domain.cjs');

const id = (prefix) => `${prefix}_${crypto.randomUUID().replaceAll('-', '').slice(0, 16)}`;
const now = () => new Date().toISOString();
const plain = (value) => value ? { ...value } : null;

class RescicleDB {
  constructor(dbPath) {
    this.db = new DatabaseSync(dbPath, { timeout: 5000 });
    const schema = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8');
    this.db.exec(schema);
  }

  close() { if (this.db.isOpen) this.db.close(); }

  createProject(name, rootPath) {
    const project = { id: id('proj'), name: name.trim(), root_path: path.resolve(rootPath), created_at: now(), last_opened_at: now() };
    this.db.prepare('INSERT INTO projects(id,name,root_path,created_at,last_opened_at) VALUES(?,?,?,?,?)')
      .run(project.id, project.name, project.root_path, project.created_at, project.last_opened_at);
    return project;
  }

  listProjects() {
    return this.db.prepare('SELECT * FROM projects ORDER BY last_opened_at DESC').all().map(plain);
  }

  getProject(projectId) {
    return plain(this.db.prepare('SELECT * FROM projects WHERE id=?').get(projectId));
  }

  renameProject(projectId, name, actor = 'researcher') {
    const project = this.getProject(projectId);
    if (!project) throw new Error('project not found');
    const next = String(name ?? '').trim();
    if (!next) throw new Error('project name is required');
    if (next === project.name) return project;
    this.db.prepare('UPDATE projects SET name=? WHERE id=?').run(next, projectId);
    this.event(projectId, 'project_renamed', actor, { detail: { from: project.name, to: next } });
    return this.getProject(projectId);
  }

  touchProject(projectId) {
    this.db.prepare('UPDATE projects SET last_opened_at=? WHERE id=?').run(now(), projectId);
  }

  createObject(projectId, input, actor = 'agent') {
    validateObjectInput(input);
    if (!this.getProject(projectId)) throw new Error('project not found');
    const obj = {
      id: id(input.type.slice(0, 4)), project_id: projectId, type: input.type,
      title: input.title.trim(), body: input.body || null, origin: input.origin,
      status: input.status, created_at: now(), updated_at: now()
    };
    this.db.prepare(`INSERT INTO objects(id,project_id,type,title,body,origin,status,created_at,updated_at)
      VALUES(?,?,?,?,?,?,?,?,?)`).run(obj.id, obj.project_id, obj.type, obj.title, obj.body, obj.origin, obj.status, obj.created_at, obj.updated_at);
    this.event(projectId, 'object_created', actor, { objectId: obj.id, detail: { type: obj.type, status: obj.status } });
    return obj;
  }

  updateObjectStatus(objectId, status, actor = 'researcher') {
    if (!['proposed', 'confirmed', 'rejected'].includes(status)) throw new Error('invalid status');
    const obj = this.getObject(objectId);
    if (!obj) throw new Error('object not found');
    this.db.prepare('UPDATE objects SET status=?, updated_at=? WHERE id=?').run(status, now(), objectId);
    this.event(obj.project_id, `object_${status}`, actor, { objectId, detail: { from: obj.status, to: status } });
    return this.getObject(objectId);
  }

  listObjects(projectId, type = null) {
    const rows = type
      ? this.db.prepare('SELECT * FROM objects WHERE project_id=? AND type=? ORDER BY updated_at DESC').all(projectId, type)
      : this.db.prepare('SELECT * FROM objects WHERE project_id=? ORDER BY updated_at DESC').all(projectId);
    return rows.map(plain);
  }

  getObject(objectId) {
    const obj = plain(this.db.prepare('SELECT * FROM objects WHERE id=?').get(objectId));
    if (!obj) return null;
    const outgoing = this.db.prepare(`SELECT r.*, o.type object_type, o.title object_title, o.status object_status
      FROM relations r JOIN objects o ON o.id=r.object_id WHERE r.subject_id=? ORDER BY r.created_at`).all(objectId).map(plain);
    const incoming = this.db.prepare(`SELECT r.*, o.type subject_type, o.title subject_title, o.status subject_status
      FROM relations r JOIN objects o ON o.id=r.subject_id WHERE r.object_id=? ORDER BY r.created_at`).all(objectId).map(plain);
    obj.outgoing = outgoing;
    obj.incoming = incoming;
    if (obj.type === 'asset') obj.asset = plain(this.db.prepare('SELECT * FROM assets WHERE object_id=?').get(objectId));
    return obj;
  }

  createRelation(projectId, input, actor = 'agent') {
    validateRelationInput(input);
    const subject = this.getObject(input.subjectId);
    const object = this.getObject(input.objectId);
    if (!subject || !object) throw new Error('relation object not found');
    if (subject.project_id !== projectId || object.project_id !== projectId) throw new Error('cross-project relation not allowed');
    if (!allowedRelation(subject.type, input.predicate, object.type)) {
      throw new Error(`relation not allowed: ${subject.type} ${input.predicate} ${object.type}`);
    }
    const existing = this.db.prepare(`SELECT * FROM relations WHERE project_id=? AND subject_id=? AND predicate=? AND object_id=? LIMIT 1`)
      .get(projectId, input.subjectId, input.predicate, input.objectId);
    if (existing) return plain(existing);
    const rel = { id: id('rel'), project_id: projectId, subject_id: input.subjectId, predicate: input.predicate, object_id: input.objectId,
      origin: input.origin, status: input.status, created_at: now() };
    this.db.prepare(`INSERT INTO relations(id,project_id,subject_id,predicate,object_id,origin,status,created_at) VALUES(?,?,?,?,?,?,?,?)`)
      .run(rel.id, rel.project_id, rel.subject_id, rel.predicate, rel.object_id, rel.origin, rel.status, rel.created_at);
    this.event(projectId, 'relation_created', actor, { relationId: rel.id, detail: { predicate: rel.predicate, status: rel.status } });
    return rel;
  }

  listRelations(projectId) {
    return this.db.prepare('SELECT * FROM relations WHERE project_id=? ORDER BY created_at').all(projectId).map(plain);
  }

  registerAsset(projectId, absolutePath) {
    const project = this.getProject(projectId);
    if (!project) throw new Error('project not found');
    const root = path.resolve(project.root_path);
    const abs = path.resolve(absolutePath);
    const rel = path.relative(root, abs);
    if (!rel || rel.startsWith('..') || path.isAbsolute(rel)) throw new Error('asset path must be inside project root');
    const stat = fs.statSync(abs);
    if (!stat.isFile()) throw new Error('asset must be a file');
    const existing = this.db.prepare(`SELECT o.id FROM objects o JOIN assets a ON a.object_id=o.id WHERE o.project_id=? AND a.relative_path=? LIMIT 1`)
      .get(projectId, rel);
    if (existing) return this.getObject(existing.id);
    const obj = this.createObject(projectId, { type: 'asset', title: path.basename(abs), body: null, origin: 'system', status: 'confirmed' }, 'system');
    this.db.prepare(`INSERT INTO assets(object_id,relative_path,size_bytes,modified_at,sha256,media_type) VALUES(?,?,?,?,?,?)`)
      .run(obj.id, rel, stat.size, stat.mtime.toISOString(), null, null);
    return this.getObject(obj.id);
  }

  saveMessage(projectId, role, content) {
    if (!['user', 'assistant'].includes(role)) throw new Error('invalid message role');
    const message = { id: id('msg'), project_id: projectId, role, content: String(content), created_at: now() };
    this.db.prepare('INSERT INTO messages(id,project_id,role,content,created_at) VALUES(?,?,?,?,?)')
      .run(message.id, message.project_id, message.role, message.content, message.created_at);
    return message;
  }

  listMessages(projectId, limit = 40) {
    return this.db.prepare(`SELECT * FROM (SELECT * FROM messages WHERE project_id=? ORDER BY created_at DESC LIMIT ?) x ORDER BY created_at ASC`)
      .all(projectId, Math.max(1, Math.min(limit, 200))).map(plain);
  }

  workspace(projectId) {
    const project = this.getProject(projectId);
    if (!project) throw new Error('project not found');
    const objects = this.listObjects(projectId);
    const counts = {};
    for (const obj of objects) counts[obj.type] = (counts[obj.type] || 0) + 1;
    return { project, objects, relations: this.listRelations(projectId), counts, messages: this.listMessages(projectId) };
  }

  context(projectId, selectedObjectId = null) {
    const objects = this.listObjects(projectId).slice(0, 120).map(({ id, type, title, body, origin, status }) => ({ id, type, title, body, origin, status }));
    const relations = this.listRelations(projectId).slice(-200).map(({ subject_id, predicate, object_id, status }) => ({ subject_id, predicate, object_id, status }));
    return { objects, relations, selectedObject: selectedObjectId ? this.getObject(selectedObjectId) : null };
  }

  event(projectId, action, actor, { objectId = null, relationId = null, detail = null } = {}) {
    this.db.prepare(`INSERT INTO events(id,project_id,object_id,relation_id,action,actor,detail_json,created_at) VALUES(?,?,?,?,?,?,?,?)`)
      .run(id('evt'), projectId, objectId, relationId, action, actor, detail ? JSON.stringify(detail) : null, now());
  }
}

module.exports = { RescicleDB };
