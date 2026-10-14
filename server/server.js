const express = require('express');
const cors = require('cors');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const os = require('os');
const EventEmitter = require('events');

const db = require('../main/db');
const browserHub = require('../main/browserHub');
const automationEngine = require('../main/automationEngine');
const tunnel = require('./tunnel');

// Tạo event emitter dùng chung nếu chưa có
let sharedEvents = new EventEmitter();
browserHub.setEventEmitter(sharedEvents);
automationEngine.setEventEmitter(sharedEvents);

const app = express();
app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Thư mục lưu media upload từ điện thoại
const isPackaged = false;
const basePath = path.join(__dirname, '..');
const uploadsDir = path.join(basePath, 'data', 'uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

// Cấu hình Multer lưu file đính kèm từ điện thoại
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadsDir),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname) || '.jpg';
    const cleanName = path.basename(file.originalname, ext).replace(/[^a-zA-Z0-9_-]/g, '_');
    cb(null, `${Date.now()}_${cleanName}${ext}`);
  }
});
const upload = multer({ storage });

// Phục vụ thư mục static của Web UI và Media uploads
const webStaticDir = path.join(__dirname, '..', 'web');
app.use(express.static(webStaticDir));
app.use('/uploads', express.static(uploadsDir));

// --- SERVER-SENT EVENTS (SSE) CHO LOGS VÀ TIẾN TRÌNH REALTIME ---
const sseClients = new Set();

function broadcastSSE(event, data) {
  const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
  for (const res of sseClients) {
    try {
      res.write(payload);
    } catch (e) {
      sseClients.delete(res);
    }
  }
}

// Đăng ký nhận sự kiện từ automationEngine và browserHub
function hookEvents(emitter) {
  if (!emitter) return;
  emitter.on('log', (data) => broadcastSSE('log', data));
  emitter.on('campaign-status', (data) => broadcastSSE('campaign-status', data));
  emitter.on('campaign-progress', (data) => broadcastSSE('campaign-progress', data));
  emitter.on('campaign-item-update', (data) => broadcastSSE('campaign-item-update', data));
  emitter.on('campaign-completed', (data) => broadcastSSE('campaign-completed', data));
  emitter.on('profile-status', (data) => broadcastSSE('profile-status', data));
  emitter.on('tunnel-url', (url) => broadcastSSE('tunnel-url', { url }));
}
hookEvents(sharedEvents);

app.get('/api/events', (req, res) => {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
    'X-Accel-Buffering': 'no' // Chống buffering proxy Nginx / Render
  });
  res.write('\n');
  sseClients.add(res);

  // Gửi ngay ping khởi tạo
  res.write(': keepalive\n\n');

  req.on('close', () => {
    sseClients.delete(res);
  });
});

// Giữ kết nối SSE không bị ngắt trên Render / Cloudflare / Safari
setInterval(() => {
  for (const res of sseClients) {
    try {
      res.write(': keepalive\n\n');
    } catch (e) {
      sseClients.delete(res);
    }
  }
}, 15000);

// --- API ENDPOINTS ---

// Lấy thông tin mạng (Localhost, IP LAN Wifi, port, Cloudflare link)
app.get('/api/network-info', (req, res) => {
  const interfaces = os.networkInterfaces();
  const addresses = [];
  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name]) {
      if (iface.family === 'IPv4' && !iface.internal) {
        addresses.push(iface.address);
      }
    }
  }
  res.json({
    port: currentPort,
    localIps: addresses,
    tunnelUrl: tunnel.getTunnelUrl() || globalTunnelUrl || null
  });
});

// 1. Quản lý Profiles (Tài khoản)
app.get('/api/profiles', (req, res) => {
  res.json(db.getProfiles());
});

app.post('/api/profiles', (req, res) => {
  const profile = db.addProfile(req.body);
  res.json(profile);
});

app.put('/api/profiles/:id', (req, res) => {
  const updated = db.updateProfile(req.params.id, req.body);
  res.json(updated || { error: 'Not found' });
});

app.delete('/api/profiles/:id', async (req, res) => {
  try {
    await browserHub.closeBrowser(req.params.id);
    db.deleteProfile(req.params.id);
    res.json({ success: true });
  } catch (err) {
    res.json({ success: false, error: err.message });
  }
});

// Mở trình duyệt đăng nhập (chạy trên máy tính chủ)
app.post('/api/profiles/:id/open-browser', async (req, res) => {
  try {
    const result = await browserHub.openBrowser(req.params.id, req.body || {});
    res.json(result);
  } catch (err) {
    res.json({ success: false, error: err.message });
  }
});

// Đóng trình duyệt
app.post('/api/profiles/:id/close-browser', async (req, res) => {
  try {
    const result = await browserHub.closeBrowser(req.params.id);
    res.json(result);
  } catch (err) {
    res.json({ success: false, error: err.message });
  }
});

// Đồng bộ danh sách nhóm đã tham gia
app.post('/api/profiles/:id/sync-groups', async (req, res) => {
  try {
    const result = await browserHub.syncJoinedGroups(req.params.id);
    res.json(result);
  } catch (err) {
    res.json({ success: false, error: err.message });
  }
});

// Trích xuất API Session & Cookie Facebook cho tài khoản (Đồng bộ API giống Tool Desktop)
app.post('/api/profiles/:id/fetch-api', async (req, res) => {
  try {
    const result = await browserHub.fetchApiSession(req.params.id);
    res.json(result);
  } catch (err) {
    res.json({ success: false, error: err.message });
  }
});

// Nạp Cookie Facebook cho tài khoản (cho điện thoại)
app.post('/api/profiles/:id/import-cookie', async (req, res) => {
  try {
    const result = await browserHub.importCookieSession(req.params.id, req.body.cookie);
    res.json(result);
  } catch (err) {
    res.json({ success: false, error: err.message });
  }
});

// Đăng nhập tự động bằng Email/SĐT + Mật khẩu Facebook (+ Mã 2FA)
app.post('/api/profiles/:id/login', async (req, res) => {
  try {
    const { username = '', password = '', twoFactorCode = '' } = req.body || {};
    const result = await browserHub.loginWithCredentials(req.params.id, username, password, twoFactorCode);
    res.json(result);
  } catch (err) {
    res.json({ success: false, error: err.message });
  }
});

// Chụp ảnh màn hình trực tiếp của trình duyệt (xem trên điện thoại)
app.get('/api/profiles/:id/screenshot', async (req, res) => {
  try {
    let active = browserHub.getActiveContext(req.params.id);
    let shouldClose = false;
    if (!active || !active.page) {
      await browserHub.openBrowser(req.params.id, { headless: true, skipNavigation: true });
      active = browserHub.getActiveContext(req.params.id);
      shouldClose = true;
    }
    if (!active || !active.page) {
      return res.status(404).json({ success: false, message: 'Trình duyệt chưa mở' });
    }
    const buffer = await active.page.screenshot({ type: 'jpeg', quality: 75 });
    if (shouldClose) {
      await browserHub.closeBrowser(req.params.id).catch(() => {});
    }
    res.set('Content-Type', 'image/jpeg');
    res.set('Cache-Control', 'no-store, no-cache, must-revalidate, max-age=0');
    res.send(buffer);
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 2. Quản lý Kho bài viết (Posts)
app.get('/api/posts', (req, res) => {
  res.json(db.getPosts());
});

app.post('/api/posts', (req, res) => {
  const post = db.savePost(req.body);
  res.json(post);
});

app.delete('/api/posts/:id', (req, res) => {
  db.deletePost(req.params.id);
  res.json({ success: true });
});

// Test spin syntax
app.post('/api/spin-test', (req, res) => {
  const content = req.body.content || '';
  const result = automationEngine.processSpin(content);
  res.json({ original: content, result });
});

// Upload media từ điện thoại
app.post('/api/upload', upload.array('files', 10), (req, res) => {
  if (!req.files || req.files.length === 0) {
    return res.status(400).json({ error: 'Không có tệp nào được tải lên.' });
  }
  const files = req.files.map(f => ({
    name: f.originalname,
    filename: f.filename,
    path: f.path, // Đường dẫn tuyệt đối trên máy chủ để Playwright sử dụng
    url: `/uploads/${f.filename}`,
    size: f.size
  }));
  res.json({ success: true, files });
});

// 3. Lịch sử & Thống kê
app.get('/api/history', (req, res) => {
  res.json(db.getHistory());
});

app.post('/api/history/clear', (req, res) => {
  db.clearHistory();
  res.json({ success: true });
});

// Cập nhật tương tác (Like, Comment) của 1 bài viết trong lịch sử
app.post('/api/history/:id/refresh-engagement', async (req, res) => {
  try {
    const history = db.getHistory();
    const item = history.find(h => h.id === req.params.id);
    if (!item || !item.postUrl) return res.json({ success: false, message: 'Không có link bài viết' });

    const profileId = item.profileId || (db.getProfiles()[0] ? db.getProfiles()[0].id : null);
    if (!profileId) return res.json({ success: false, message: 'Không tìm thấy tài khoản phù hợp' });

    const stats = await browserHub.fetchPostEngagement(profileId, item.postUrl);
    if (stats) {
      db.updateHistoryItem(req.params.id, {
        likesCount: stats.likes,
        commentsCount: stats.comments
      });
      return res.json({ success: true, stats });
    }
    res.json({ success: false, message: 'Không thể đọc tương tác' });
  } catch (err) {
    res.json({ success: false, error: err.message });
  }
});

// Cập nhật tương tác tất cả bài viết trong lịch sử
app.post('/api/history/refresh-all', async (req, res) => {
  try {
    const history = db.getHistory();
    const postsWithUrl = history.filter(h => h.postUrl && h.postUrl.startsWith('http'));
    let updatedCount = 0;

    for (const item of postsWithUrl) {
      const profileId = item.profileId || (db.getProfiles()[0] ? db.getProfiles()[0].id : null);
      if (!profileId) continue;
      try {
        const stats = await browserHub.fetchPostEngagement(profileId, item.postUrl);
        if (stats) {
          db.updateHistoryItem(item.id, {
            likesCount: stats.likes,
            commentsCount: stats.comments
          });
          updatedCount++;
        }
      } catch (e) {}
    }
    res.json({ success: true, count: updatedCount, total: postsWithUrl.length });
  } catch (err) {
    res.json({ success: false, error: err.message });
  }
});

// 4. Cài đặt hệ thống
app.get('/api/settings', (req, res) => {
  res.json(db.getSettings());
});

app.post('/api/settings', (req, res) => {
  const updated = db.updateSettings(req.body);
  res.json(updated);
});

// 5. Điều khiển Chiến dịch Đăng bài
app.get('/api/campaign/status', (req, res) => {
  res.json({ isRunning: automationEngine.isRunning });
});

app.post('/api/campaign/start', async (req, res) => {
  try {
    if (automationEngine.isRunning) {
      return res.status(400).json({ error: 'Chiến dịch đang chạy!' });
    }
    // Chạy ngầm trong background
    automationEngine.startCampaign(req.body).catch(err => {
      console.error('[Web Campaign Error]', err);
    });
    res.json({ success: true, message: 'Chiến dịch đã bắt đầu!' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/campaign/stop', async (req, res) => {
  try {
    await automationEngine.stopCampaign();
    res.json({ success: true, message: 'Đã gửi tín hiệu dừng chiến dịch.' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Trang chính fallback về index.html của Web UI
app.use((req, res) => {
  const indexPath = path.join(webStaticDir, 'index.html');
  if (fs.existsSync(indexPath)) {
    res.sendFile(indexPath);
  } else {
    res.send('<h3>FB AutoPost Master Web Server đang khởi động...</h3>');
  }
});

let currentPort = 3000;
let globalTunnelUrl = null;
let serverInstance = null;

function startServer(port = 3000, parentEvents = null) {
  if (parentEvents && parentEvents !== sharedEvents) {
    hookEvents(parentEvents);
    sharedEvents = parentEvents;
  }

  currentPort = port;
  if (serverInstance) return serverInstance;

  serverInstance = app.listen(port, '0.0.0.0', () => {
    console.log(`\n======================================================`);
    console.log(`🚀 [FB AutoPost Web Server] ĐÃ KHỞI CHẠY THÀNH CÔNG!`);
    console.log(`💻 Truy cập trên máy tính: http://localhost:${port}`);

    const interfaces = os.networkInterfaces();
    console.log(`📱 Truy cập trên Điện Thoại (cùng mạng Wifi):`);
    for (const name of Object.keys(interfaces)) {
      for (const iface of interfaces[name]) {
        if (iface.family === 'IPv4' && !iface.internal) {
          console.log(`   👉 http://${iface.address}:${port}`);
        }
      }
    }
    console.log(`======================================================\n`);

    if (process.env.RENDER_EXTERNAL_URL) {
      globalTunnelUrl = process.env.RENDER_EXTERNAL_URL;
      console.log(`🌐 Link Cloud Render cho Điện Thoại: ${globalTunnelUrl}`);
    } else {
      // Tự động khởi chạy Cloudflare Tunnel tạo link HTTPS cho điện thoại
      tunnel.startCloudflareTunnel(port, (url) => {
        globalTunnelUrl = url;
        if (sharedEvents) {
          sharedEvents.emit('tunnel-url', url);
          sharedEvents.emit('log', {
            time: new Date().toLocaleTimeString('vi-VN'),
            message: `🌐 Link Cloudflare cho Điện Thoại: ${url}`,
            type: 'success'
          });
        }
      });
    }
  });

  return serverInstance;
}

// Nếu chạy trực tiếp file bằng lệnh `node server/server.js`
if (require.main === module) {
  const port = process.env.PORT || 3000;
  startServer(port);
}

module.exports = {
  app,
  startServer,
  setTunnelUrl: (url) => { globalTunnelUrl = url; }
};
