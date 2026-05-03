const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('teamap', {
  slack: {
    fetchHistory: (params) => ipcRenderer.invoke('slack:history', params),
    fetchReplies: (params) => ipcRenderer.invoke('slack:replies', params),
    listChannels: (params) => ipcRenderer.invoke('slack:listChannels', params),
    channelInfo: (params) => ipcRenderer.invoke('slack:channelInfo', params),
  },
  ai: {
    analyze: (params) => ipcRenderer.invoke('ai:analyze', params),
    gemini: (params) => ipcRenderer.invoke('ai:gemini', params),
  },
});
