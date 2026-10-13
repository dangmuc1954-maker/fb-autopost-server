const fs = require('fs');
const path = require('path');
let electronApp = null;
try {
  electronApp = require('electron').app;
} catch (e) {}

class JSONDatabase {
  constructor() {
    const isPackaged = electronApp ? electronApp.isPackaged : false;
    const basePath = isPackaged 
      ? (process.env.PORTABLE_EXECUTABLE_DIR || path.dirname(process.execPath)) 
      : path.join(__dirname, '..');
    this.dataDir = path.join(basePath, 'data');
    this.dbFile = path.join(this.dataDir, 'database.json');
    this.defaultData = {
      profiles: [],
      posts: [],
      history: [],
      settings: {
        chromePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
        minDelay: 15,
        maxDelay: 35,
        headless: true,
        maxThreads: 1
      }
    };
    this.data = this.load();
  }

  load() {
    try {
      if (!fs.existsSync(this.dataDir)) {
        fs.mkdirSync(this.dataDir, { recursive: true });
      }
      if (!fs.existsSync(this.dbFile)) {
        fs.writeFileSync(this.dbFile, JSON.stringify(this.defaultData, null, 2), 'utf-8');
        return JSON.parse(JSON.stringify(this.defaultData));
      }
      const raw = fs.readFileSync(this.dbFile, 'utf-8');
      const parsed = JSON.parse(raw);
      return { ...this.defaultData, ...parsed, settings: { ...this.defaultData.settings, ...(parsed.settings || {}) } };
    } catch (err) {
      console.error('[DB] Error loading database:', err);
      return JSON.parse(JSON.stringify(this.defaultData));
    }
  }

  save() {
    try {
      if (!fs.existsSync(this.dataDir)) {
        fs.mkdirSync(this.dataDir, { recursive: true });
      }
      fs.writeFileSync(this.dbFile, JSON.stringify(this.data, null, 2), 'utf-8');
    } catch (err) {
      console.error('[DB] Error saving database:', err);
    }
  }

  // --- Profiles (Browser Hub Accounts) ---
  getProfiles() {
    return this.data.profiles || [];
  }

  getProfile(id) {
    return (this.data.profiles || []).find(p => p.id === id) || null;
  }

  addProfile(profile) {
    const newProfile = {
      id: 'prof_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5),
      name: profile.name || 'Tài khoản Facebook',
      uid: profile.uid || '',
      avatar: profile.avatar || '',
      proxy: profile.proxy || '',
      note: profile.note || '',
      status: 'ready', // 'ready', 'open', 'posting', 'error'
      isLoggedIn: false,
      groups: [], // Danh sách nhóm đã tham gia: [{ id, name, url, privacy }]
      lastSynced: null,
      createdAt: new Date().toISOString()
    };
    this.data.profiles.push(newProfile);
    this.save();
    return newProfile;
  }

  updateProfile(id, updates) {
    const idx = this.data.profiles.findIndex(p => p.id === id);
    if (idx !== -1) {
      this.data.profiles[idx] = { ...this.data.profiles[idx], ...updates };
      this.save();
      return this.data.profiles[idx];
    }
    return null;
  }

  updateProfileGroups(id, groups) {
    const idx = this.data.profiles.findIndex(p => p.id === id);
    if (idx !== -1) {
      this.data.profiles[idx].groups = groups;
      this.data.profiles[idx].lastSynced = new Date().toISOString();
      this.save();
      return this.data.profiles[idx];
    }
    return null;
  }

  deleteProfile(id) {
    this.data.profiles = this.data.profiles.filter(p => p.id !== id);
    this.save();
  }

  // --- Posts ---
  getPosts() {
    return this.data.posts || [];
  }

  savePost(post) {
    if (post.id) {
      const idx = this.data.posts.findIndex(p => p.id === post.id);
      if (idx !== -1) {
        this.data.posts[idx] = { ...this.data.posts[idx], ...post, updatedAt: new Date().toISOString() };
        this.save();
        return this.data.posts[idx];
      }
    }
    const newPost = {
      id: 'post_' + Date.now(),
      title: post.title || 'Bài viết không tên',
      content: post.content || '',
      media: post.media || [],
      createdAt: new Date().toISOString()
    };
    this.data.posts.push(newPost);
    this.save();
    return newPost;
  }

  deletePost(id) {
    this.data.posts = this.data.posts.filter(p => p.id !== id);
    this.save();
  }

  // --- History & Logs ---
  getHistory() {
    return this.data.history || [];
  }

  addHistory(item) {
    const record = {
      id: 'hist_' + Date.now() + '_' + Math.random().toString(36).substr(2, 4),
      time: new Date().toLocaleString('vi-VN'),
      profileId: item.profileId || '',
      profileName: item.profileName || 'Unknown',
      targetName: item.targetName || 'Group',
      targetUrl: item.targetUrl || '',
      targetAvatar: item.targetAvatar || '',
      postTitle: item.postTitle || '',
      postContent: item.postContent || '',
      status: item.status || 'success', // 'success', 'pending_approval', 'error'
      message: item.message || '',
      postUrl: item.postUrl || '',
      likesCount: item.likesCount || 0,
      commentsCount: item.commentsCount || 0,
      cmtStatus: item.cmtStatus || 'Sẵn sàng' // 'Chưa cmt', 'Đã cmt mồi', 'Đang theo dõi'
    };
    if (!this.data.history) this.data.history = [];
    this.data.history.unshift(record);
    if (this.data.history.length > 1000) {
      this.data.history = this.data.history.slice(0, 1000);
    }
    this.save();
    return record;
  }

  updateHistoryItem(id, updates) {
    if (!this.data.history) return null;
    const idx = this.data.history.findIndex(h => h.id === id);
    if (idx !== -1) {
      this.data.history[idx] = { ...this.data.history[idx], ...updates };
      this.save();
      return this.data.history[idx];
    }
    return null;
  }

  clearHistory() {
    this.data.history = [];
    this.save();
  }

  // --- Settings ---
  getSettings() {
    return this.data.settings;
  }

  updateSettings(settings) {
    this.data.settings = { ...this.data.settings, ...settings };
    this.save();
    return this.data.settings;
  }
}

module.exports = new JSONDatabase();
