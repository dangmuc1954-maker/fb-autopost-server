const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('path');
const os = require('os');
const EventEmitter = require('events');
const db = require('./db');
const browserHub = require('./browserHub');
const automationEngine = require('./automationEngine');
const webServer = require('../server/server');

// Tạo event emitter chung để truyền log và trạng thái ra giao diện
const appEvents = new EventEmitter();
browserHub.setEventEmitter(appEvents);
automationEngine.setEventEmitter(appEvents);

let mainWindow = null;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1300,
    height: 840,
    minWidth: 1050,
    minHeight: 680,
    title: 'FB AutoPost Master - Quản Lý & Đăng Bài Hàng Loạt',
    backgroundColor: '#0b0f19',
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true
    }
  });

  mainWindow.loadFile(path.join(__dirname, '..', 'renderer', 'index.html'));

  // Lắng nghe sự kiện để bắn về renderer
  appEvents.on('log', (data) => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('log', data);
    }
  });

  appEvents.on('campaign-status', (data) => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('campaign-status', data);
    }
  });

  appEvents.on('campaign-progress', (data) => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('campaign-progress', data);
    }
  });

  appEvents.on('campaign-item-update', (data) => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('campaign-item-update', data);
    }
  });

  appEvents.on('campaign-completed', (data) => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('campaign-completed', data);
    }
  });

  appEvents.on('profile-status', (data) => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('profile-status', data);
    }
  });

  appEvents.on('tunnel-url', (url) => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('tunnel-url', url);
    }
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

// IPC Handlers
ipcMain.handle('get-profiles', async () => db.getProfiles());
ipcMain.handle('add-profile', async (event, profile) => db.addProfile(profile));
ipcMain.handle('update-profile', async (event, id, updates) => db.updateProfile(id, updates));
ipcMain.handle('delete-profile', async (event, id) => {
  await browserHub.closeBrowser(id);
  db.deleteProfile(id);
  return { success: true };
});

ipcMain.handle('open-browser', async (event, profileId, options) => {
  return await browserHub.openBrowser(profileId, options);
});

ipcMain.handle('close-browser', async (event, profileId) => {
  return await browserHub.closeBrowser(profileId);
});

ipcMain.handle('get-posts', async () => db.getPosts());
ipcMain.handle('save-post', async (event, post) => db.savePost(post));
ipcMain.handle('delete-post', async (event, id) => {
  db.deletePost(id);
  return { success: true };
});

ipcMain.handle('sync-joined-groups', async (event, profileId) => {
  return await browserHub.syncJoinedGroups(profileId);
});

ipcMain.handle('fetch-api-session', async (event, profileId) => {
  return await browserHub.fetchApiSession(profileId);
});

ipcMain.handle('refresh-post-engagement', async (event, historyId) => {
  const history = db.getHistory();
  const item = history.find(h => h.id === historyId);
  if (!item || !item.postUrl) return { success: false, message: 'Không có link bài viết' };

  const profileId = item.profileId || (db.getProfiles()[0] ? db.getProfiles()[0].id : null);
  if (!profileId) return { success: false, message: 'Không tìm thấy tài khoản phù hợp' };

  const stats = await browserHub.fetchPostEngagement(profileId, item.postUrl);
  if (stats) {
    db.updateHistoryItem(historyId, {
      likesCount: stats.likes,
      commentsCount: stats.comments
    });
    return { success: true, stats };
  }
  return { success: false, message: 'Không thể đọc tương tác' };
});

ipcMain.handle('get-history', async () => db.getHistory());
ipcMain.handle('clear-history', async () => {
  db.clearHistory();
  return { success: true };
});

ipcMain.handle('get-settings', async () => db.getSettings());
ipcMain.handle('update-settings', async (event, settings) => db.updateSettings(settings));

ipcMain.handle('select-media-files', async () => {
  if (!mainWindow) return [];
  const result = await dialog.showOpenDialog(mainWindow, {
    title: 'Chọn hình ảnh hoặc video đính kèm bài viết',
    properties: ['openFile', 'multiSelections'],
    filters: [
      { name: 'Media Files', extensions: ['jpg', 'jpeg', 'png', 'gif', 'webp', 'mp4', 'mov', 'avi'] }
    ]
  });
  return result.filePaths || [];
});

ipcMain.handle('select-chrome-path', async () => {
  if (!mainWindow) return null;
  const result = await dialog.showOpenDialog(mainWindow, {
    title: 'Chọn tệp chrome.exe trên máy tính',
    properties: ['openFile'],
    filters: [
      { name: 'Executable Files', extensions: ['exe'] }
    ]
  });
  if (result.filePaths && result.filePaths.length > 0) {
    return result.filePaths[0];
  }
  return null;
});

ipcMain.handle('start-campaign', async (event, config) => {
  // Chạy background không block IPC
  automationEngine.startCampaign(config).catch(err => {
    console.error('[Main] Lỗi chiến dịch:', err);
  });
  return { success: true };
});

ipcMain.handle('stop-campaign', async () => {
  await automationEngine.stopCampaign();
  return { success: true };
});

const tunnel = require('../server/tunnel');

ipcMain.handle('get-web-server-info', async () => {
  const interfaces = os.networkInterfaces();
  const addresses = [];
  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name]) {
      if (iface.family === 'IPv4' && !iface.internal) {
        addresses.push(iface.address);
      }
    }
  }
  const tunnelUrl = tunnel.getTunnelUrl();
  return {
    port: 3000,
    localIps: addresses,
    localUrl: 'http://localhost:3000',
    lanUrl: addresses.length > 0 ? `http://${addresses[0]}:3000` : 'http://localhost:3000',
    tunnelUrl: tunnelUrl || null
  };
});

// App Lifecycle
app.whenReady().then(() => {
  createWindow();
  try {
    webServer.startServer(3000, appEvents);
  } catch (err) {
    console.error('[Web Server Error]', err);
  }
});

app.on('window-all-closed', async () => {
  await browserHub.closeAllBrowsers();
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});
