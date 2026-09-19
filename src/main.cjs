const path = require('node:path');
const fs = require('node:fs');
const { app, BrowserWindow, ipcMain, dialog, shell, clipboard } = require('electron');
const { RescicleDB } = require('./db.cjs');
const { scanFiles, resolveProjectFile } = require('./files.cjs');
const { ClaudeAgent } = require('./claude-agent.cjs');
const { runStdioMcp } = require('./mcp-server.cjs');

// rescicle talks to Claude Code only. The ChatGPT/Codex client is still in the
// tree (src/codex-client.cjs) but is neither wired up nor bundled.
const AGENT_BACKEND = 'claude';

let mainWindow;
let db;
let claudeAgent;
let currentProjectId = null;
let projectClaudeSessions = {};

function settingsPath() { return path.join(app.getPath('userData'), 'settings.json'); }
function loadSettings() {
  try {
    const x = JSON.parse(fs.readFileSync(settingsPath(), 'utf8'));
    currentProjectId = x.currentProjectId || null;
    projectClaudeSessions = x.projectClaudeSessions || {};
  } catch {}
}
function saveSettings() {
  fs.mkdirSync(path.dirname(settingsPath()), { recursive: true });
  fs.writeFileSync(settingsPath(), JSON.stringify({ currentProjectId, projectClaudeSessions }, null, 2));
}
function setClaudeSessionId(projectId, sessionId) {
  if (sessionId) projectClaudeSessions[projectId] = sessionId;
  else delete projectClaudeSessions[projectId];
  saveSettings();
}

function assertSender(event) {
  if (!mainWindow || event.sender.id !== mainWindow.webContents.id) throw new Error('untrusted IPC sender');
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 880,
    minWidth: 1040,
    minHeight: 700,
    backgroundColor: '#f7f7f5',
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  });
  mainWindow.loadFile(path.join(__dirname, 'renderer', 'index.html'));
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https:\/\//.test(url)) shell.openExternal(url);
    return { action: 'deny' };
  });
  mainWindow.webContents.on('will-navigate', event => event.preventDefault());
}

async function claudeStatus() {
  try { return await claudeAgent.status(); }
  catch (error) { return { available: false, provider: 'claude', error: error.message, bin: null, version: null }; }
}

async function agentStatus() {
  return { backend: AGENT_BACKEND, claude: await claudeStatus() };
}

function claudeSetupCommand() {
  const exe = process.execPath;
  return `claude mcp add --transport stdio --scope user rescicle -- "${exe}" --mcp-server`;
}

function installIpc() {
  const on = (name, handler) => ipcMain.handle(name, async (event, ...args) => { assertSender(event); return handler(...args); });

  on('app:bootstrap', async () => {
    const projects = db.listProjects();
    if (currentProjectId && !db.getProject(currentProjectId)) currentProjectId = null;
    return { projects, currentProjectId, workspace: currentProjectId ? db.workspace(currentProjectId) : null, agent: await agentStatus() };
  });
  on('project:choose-folder', async () => {
    const result = await dialog.showOpenDialog(mainWindow, { properties: ['openDirectory', 'createDirectory'] });
    return result.canceled ? null : result.filePaths[0];
  });
  on('project:create', async ({ name, rootPath }) => {
    if (!rootPath) throw new Error('研究フォルダを選択してください');
    const project = db.createProject(name || path.basename(rootPath), rootPath);
    currentProjectId = project.id;
    saveSettings();
    return db.workspace(project.id);
  });
  on('project:open', async projectId => {
    if (!db.getProject(projectId)) throw new Error('project not found');
    currentProjectId = projectId; db.touchProject(projectId); saveSettings();
    return db.workspace(projectId);
  });
  on('project:rename', async ({ projectId, name }) => {
    db.renameProject(projectId, name, 'researcher');
    return db.workspace(projectId);
  });
  on('objects:list', async ({ projectId, type }) => db.listObjects(projectId, type || null));
  on('object:get', async objectId => db.getObject(objectId));
  on('object:set-status', async ({ objectId, status }) => db.updateObjectStatus(objectId, status, 'researcher'));
  on('messages:list', async projectId => db.listMessages(projectId));
  on('files:scan', async projectId => scanFiles(db.getProject(projectId).root_path, 300));
  on('asset:register', async ({ projectId, relativePath }) => {
    const project = db.getProject(projectId);
    return db.registerAsset(projectId, resolveProjectFile(project.root_path, relativePath));
  });

  on('agent:status', agentStatus);
  on('agent:refresh', agentStatus);
  on('agent:send', async ({ projectId, text, selectedObjectId }) => {
    if (!String(text || '').trim()) return null;
    const project = db.getProject(projectId);
    if (!project) throw new Error('project not found');
    db.saveMessage(projectId, 'user', String(text).trim());
    const files = scanFiles(project.root_path, 120);
    const result = await claudeAgent.chat({ db, projectId, text: String(text).trim(), selectedObjectId, fileIndex: files });
    db.saveMessage(projectId, 'assistant', result.reply);
    return { ...result, workspace: db.workspace(projectId) };
  });

  on('claude:setup-info', async () => ({ command: claudeSetupCommand(), executable: process.execPath }));
  on('claude:copy-setup', async () => { const command = claudeSetupCommand(); clipboard.writeText(command); return command; });
}

async function initCore() {
  loadSettings();
  db = new RescicleDB(path.join(app.getPath('userData'), 'rescicle.sqlite'));
}

// Squirrel starts the app with --squirrel-install / --squirrel-updated /
// --squirrel-uninstall / --squirrel-obsolete while installing, updating or
// removing it. electron-squirrel-startup creates or removes the Start menu and
// desktop shortcuts for those runs and returns true; quitting before 'ready'
// keeps a window from opening in the middle of the installer.
if (require('electron-squirrel-startup')) {
  app.quit();
} else if (process.argv.includes('--mcp-server')) {
  app.whenReady().then(async () => {
    await initCore();
    runStdioMcp({ db, getCurrentProjectId: () => currentProjectId });
  });
} else {
  app.whenReady().then(async () => {
    await initCore();
    const workDir = path.join(app.getPath('userData'), 'agent-workspace');
    claudeAgent = new ClaudeAgent({ workDir, getSessionId: id => projectClaudeSessions[id] || null, setSessionId: setClaudeSessionId });
    installIpc();
    createWindow();
  });

  app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
  app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
}

app.on('before-quit', () => { try { db?.close(); } catch {} });
