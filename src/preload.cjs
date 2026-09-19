const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('rescicle', {
  bootstrap: () => ipcRenderer.invoke('app:bootstrap'),
  chooseFolder: () => ipcRenderer.invoke('project:choose-folder'),
  createProject: payload => ipcRenderer.invoke('project:create', payload),
  openProject: projectId => ipcRenderer.invoke('project:open', projectId),
  listObjects: (projectId, type) => ipcRenderer.invoke('objects:list', { projectId, type }),
  getObject: objectId => ipcRenderer.invoke('object:get', objectId),
  setObjectStatus: (objectId, status) => ipcRenderer.invoke('object:set-status', { objectId, status }),
  scanFiles: projectId => ipcRenderer.invoke('files:scan', projectId),
  registerAsset: (projectId, relativePath) => ipcRenderer.invoke('asset:register', { projectId, relativePath }),
  messages: projectId => ipcRenderer.invoke('messages:list', projectId),
  sendMessage: payload => ipcRenderer.invoke('agent:send', payload),
  agentStatus: () => ipcRenderer.invoke('agent:status'),
  agentLogin: () => ipcRenderer.invoke('agent:login'),
  agentLogout: () => ipcRenderer.invoke('agent:logout'),
  agentRefresh: () => ipcRenderer.invoke('agent:refresh'),
  agentSetBackend: backend => ipcRenderer.invoke('agent:set-backend', backend),
  claudeSetupInfo: () => ipcRenderer.invoke('claude:setup-info'),
  copyClaudeSetup: () => ipcRenderer.invoke('claude:copy-setup')
});
