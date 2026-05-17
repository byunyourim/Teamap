const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('teamap', {
  slack: {
    fetchHistory: (params) => ipcRenderer.invoke('slack:history', params),
    fetchReplies: (params) => ipcRenderer.invoke('slack:replies', params),
    listChannels: (params) => ipcRenderer.invoke('slack:listChannels', params),
    channelInfo: (params) => ipcRenderer.invoke('slack:channelInfo', params),
    postMessage: (params) => ipcRenderer.invoke('slack:postMessage', params),
  },
  ai: {
    analyze: (params) => ipcRenderer.invoke('ai:analyze', params),
    gemini: (params) => ipcRenderer.invoke('ai:gemini', params),
    claudeReview: (params) => ipcRenderer.invoke('ai:claudeReview', params),
  },
  rpc: {
    getTx: (params) => ipcRenderer.invoke('rpc:getTx', params),
  },
  notifications: {
    show: (params) => ipcRenderer.invoke('notifications:show', params),
  },
  onNavigate: (callback) => {
    const listener = (_e, target) => callback(target);
    ipcRenderer.on('app:navigate', listener);
    return () => ipcRenderer.removeListener('app:navigate', listener);
  },
});
