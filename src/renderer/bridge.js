// Stands in for the old preload.cjs. src/renderer/app.js talks to window.rescicle
// and knows nothing about the runtime underneath, so keeping the same shape here is
// what let the renderer move from Electron to Tauri unchanged.
const { invoke } = window.__TAURI__.core;

// Tauri rejects with whatever the command serialised, and crate::error::Error
// serialises to a plain string. app.js reads e.message, so put it back in an Error.
const call = (name, args) =>
  invoke(name, args).catch(reason => {
    throw reason instanceof Error
      ? reason
      : new Error(typeof reason === 'string' ? reason : JSON.stringify(reason));
  });

window.rescicle = {
  bootstrap: () => call('app_bootstrap'),
  chooseFolder: () => call('project_choose_folder'),
  createProject: payload =>
    call('project_create', { name: payload?.name ?? null, rootPath: payload?.rootPath ?? null }),
  openProject: projectId => call('project_open', { projectId }),
  renameProject: (projectId, name) => call('project_rename', { projectId, name }),
  setProjectRoot: (projectId, rootPath) => call('project_set_root', { projectId, rootPath }),
  listObjects: (projectId, type) => call('objects_list', { projectId, type: type ?? null }),
  getObject: objectId => call('object_get', { objectId }),
  setObjectStatus: (objectId, status) => call('object_set_status', { objectId, status }),
  scanFiles: projectId => call('files_scan', { projectId }),
  registerAsset: (projectId, relativePath) => call('asset_register', { projectId, relativePath }),
  messages: projectId => call('messages_list', { projectId }),
  sendMessage: payload =>
    call('agent_send', {
      projectId: payload.projectId,
      text: payload.text,
      selectedObjectId: payload.selectedObjectId ?? null
    }),
  agentStatus: () => call('agent_status'),
  agentRefresh: () => call('agent_refresh'),
  claudeSetupInfo: () => call('claude_setup_info'),
  copyClaudeSetup: () => call('claude_copy_setup')
};
