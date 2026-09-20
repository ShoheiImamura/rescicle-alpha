PRAGMA foreign_keys = ON;
PRAGMA journal_mode = WAL;

CREATE TABLE IF NOT EXISTS projects (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  root_path TEXT NOT NULL,
  created_at TEXT NOT NULL,
  last_opened_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS objects (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  type TEXT NOT NULL,
  title TEXT NOT NULL,
  body TEXT,
  -- A remark about this object, kept beside it rather than as an object of its
  -- own. It used to be a `note` type joined on by a relation, which made a side
  -- remark something that exists independently and can be attached to several
  -- things at once. It is not: it belongs to one thing, and a column is what
  -- belonging to one thing looks like.
  note TEXT,
  origin TEXT NOT NULL,
  status TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_objects_project_type
ON objects(project_id, type, updated_at DESC);

CREATE TABLE IF NOT EXISTS relations (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  subject_id TEXT NOT NULL,
  predicate TEXT NOT NULL,
  object_id TEXT NOT NULL,
  origin TEXT NOT NULL,
  status TEXT NOT NULL,
  created_at TEXT NOT NULL,
  FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
  FOREIGN KEY (subject_id) REFERENCES objects(id) ON DELETE CASCADE,
  FOREIGN KEY (object_id) REFERENCES objects(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_relations_subject ON relations(subject_id);
CREATE INDEX IF NOT EXISTS idx_relations_object ON relations(object_id);

CREATE TABLE IF NOT EXISTS assets (
  object_id TEXT PRIMARY KEY,
  relative_path TEXT NOT NULL,
  size_bytes INTEGER NOT NULL,
  modified_at TEXT NOT NULL,
  -- Neither is written yet: register_asset puts NULL in both and nothing reads
  -- them. They are here so the shape does not have to change when a checksum or
  -- a media type is worth having. Do not read them as data.
  sha256 TEXT,
  media_type TEXT,
  FOREIGN KEY (object_id) REFERENCES objects(id) ON DELETE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_assets_project_path
ON assets(relative_path, object_id);

-- Whether a measurement has actually been run, and when. This is a second
-- axis, not another status: status says whether the researcher has decided to
-- do it, and most confirmed measurements have not been done yet. A date rather
-- than a flag, because "when did we measure this" is the thing a research
-- record gets asked for, and it costs no extra input -- the button stamps it.
CREATE TABLE IF NOT EXISTS measurements (
  object_id TEXT PRIMARY KEY,
  performed_at TEXT,
  FOREIGN KEY (object_id) REFERENCES objects(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS messages (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  role TEXT NOT NULL,
  content TEXT NOT NULL,
  created_at TEXT NOT NULL,
  FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_messages_project_time
ON messages(project_id, created_at DESC);

CREATE TABLE IF NOT EXISTS events (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  object_id TEXT,
  relation_id TEXT,
  action TEXT NOT NULL,
  actor TEXT NOT NULL,
  detail_json TEXT,
  created_at TEXT NOT NULL,
  FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
);

-- Reading is the agent's to decide and rescicle's to do, so there is no table
-- of permissions any more. Every read is written to events as file_read, which
-- is what the file list shows and the only record of what left the folder.
-- An older database still has a shared_files table; nothing reads it.
