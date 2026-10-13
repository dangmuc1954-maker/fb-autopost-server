const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  // Profiles & Browser Hub
  getProfiles: () => ipcRenderer.invoke('get-profiles'),
  addProfile: (profile) => ipcRenderer.invoke('add-profile', profile),
  updateProfile: (id, updates) => ipcRenderer.invoke('update-profile', id, updates),
  deleteProfile: (id) => ipcRenderer.invoke('delete-profile', id),
  openBrowser: (profileId, options) => ipcRenderer.invoke('open-browser', profileId, options),
  closeBrowser: (profileId) => ipcRenderer.invoke('close-browser', profileId),
  syncJoinedGroups: (profileId) => ipcRenderer.invoke('sync-joined-groups', profileId),
  fetchApiSession: (profileId) => ipcRenderer.invoke('fetch-api-session', profileId),
  refreshPostEngagement: (historyId) => ipcRenderer.invoke('refresh-post-engagement', historyId),

  // Posts
  getPosts: () => ipcRenderer.invoke('get-posts'),
  savePost: (post) => ipcRenderer.invoke('save-post', post),
  deletePost: (id) => ipcRenderer.invoke('delete-post', id),

  // History & Settings
  getHistory: () => ipcRenderer.invoke('get-history'),
  clearHistory: () => ipcRenderer.invoke('clear-history'),
  getSettings: () => ipcRenderer.invoke('get-settings'),
  updateSettings: (settings) => ipcRenderer.invoke('update-settings', settings),
  getWebServerInfo: () => ipcRenderer.invoke('get-web-server-info'),

  // Dialogs
  selectMediaFiles: () => ipcRenderer.invoke('select-media-files'),
  selectChromePath: () => ipcRenderer.invoke('select-chrome-path'),

  // Campaign
  startCampaign: (config) => ipcRenderer.invoke('start-campaign', config),
  stopCampaign: () => ipcRenderer.invoke('stop-campaign'),

  // Events
  onLog: (callback) => {
    const handler = (event, data) => callback(data);
    ipcRenderer.on('log', handler);
    return () => ipcRenderer.removeListener('log', handler);
  },
  onCampaignStatus: (callback) => {
    const handler = (event, data) => callback(data);
    ipcRenderer.on('campaign-status', handler);
    return () => ipcRenderer.removeListener('campaign-status', handler);
  },
  onCampaignProgress: (callback) => {
    const handler = (event, data) => callback(data);
    ipcRenderer.on('campaign-progress', handler);
    return () => ipcRenderer.removeListener('campaign-progress', handler);
  },
  onCampaignItemUpdate: (callback) => {
    const handler = (event, data) => callback(data);
    ipcRenderer.on('campaign-item-update', handler);
    return () => ipcRenderer.removeListener('campaign-item-update', handler);
  },
  onCampaignCompleted: (callback) => {
    const handler = (event, data) => callback(data);
    ipcRenderer.on('campaign-completed', handler);
    return () => ipcRenderer.removeListener('campaign-completed', handler);
  },
  onProfileStatus: (callback) => {
    const handler = (event, data) => callback(data);
    ipcRenderer.on('profile-status', handler);
    return () => ipcRenderer.removeListener('profile-status', handler);
  },
  onTunnelUrl: (callback) => {
    const handler = (event, data) => callback(data);
    ipcRenderer.on('tunnel-url', handler);
    return () => ipcRenderer.removeListener('tunnel-url', handler);
  }
});
