// Everything the renderer is allowed to ask the Rust side for. app.js talks to
// window.rescicle and nothing else, so the surface it sees stays the same shape
// whatever is underneath; that is what let it move runtimes unchanged.
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
  // The system browser, not this webview. Reached through the plugin's own IPC
  // name rather than window.__TAURI__.opener, so it does not depend on which
  // plugin JS shims happen to be bundled -- capabilities/default.json already
  // allows exactly this one command.
  openUrl: url => call('plugin:opener|open_url', { url }),
  renameProject: (projectId, name) => call('project_rename', { projectId, name }),
  setProjectRoot: (projectId, rootPath) => call('project_set_root', { projectId, rootPath }),
  listObjects: (projectId, type) => call('objects_list', { projectId, type: type ?? null }),
  getObject: objectId => call('object_get', { objectId }),
  setObjectStatus: (objectId, status) => call('object_set_status', { objectId, status }),
  setRelationStatus: (relationId, status) => call('relation_set_status', { relationId, status }),
  setMeasurementPerformed: (objectId, performed) =>
    call('measurement_set_performed', { objectId, performed }),
  createRelation: (projectId, subjectId, predicate, objectId) =>
    call('relation_create', { projectId, subjectId, predicate, objectId }),
  deleteRelation: relationId => call('relation_delete', { relationId }),
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
  // Fires repeatedly while a turn runs, each time with the whole reply so far.
  onReply: handler =>
    window.__TAURI__.event.listen('agent:reply', event => handler(event.payload)),
  clearRecord: () => call('record_clear'),
  claudeMcpStatus: () => call('claude_mcp_status'),
  claudeMcpRegister: () => call('claude_mcp_register'),
  copyClaudeSetup: () => call('claude_copy_setup')
};
