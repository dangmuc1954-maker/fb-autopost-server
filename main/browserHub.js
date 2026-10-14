const { chromium } = require('playwright-core');
const path = require('path');
const fs = require('fs');
const db = require('./db');

let electronApp = null;
try {
  electronApp = require('electron').app;
} catch (e) {}

class BrowserHub {
  constructor() {
    const isPackaged = electronApp ? electronApp.isPackaged : false;
    const basePath = isPackaged 
      ? (process.env.PORTABLE_EXECUTABLE_DIR || path.dirname(process.execPath)) 
      : path.join(__dirname, '..');
    this.profilesDir = path.join(basePath, 'browser_profiles');
    if (!fs.existsSync(this.profilesDir)) {
      fs.mkdirSync(this.profilesDir, { recursive: true });
    }
    this.activeContexts = new Map(); // profileId -> { context, page }
    this.eventEmitter = null;
  }

  setEventEmitter(emitter) {
    this.eventEmitter = emitter;
  }

  log(message, type = 'info') {
    console.log(`[BrowserHub] ${message}`);
    if (this.eventEmitter) {
      this.eventEmitter.emit('log', { time: new Date().toLocaleTimeString('vi-VN'), message, type });
    }
  }

  getProfileDir(profileId) {
    const dir = path.join(this.profilesDir, profileId);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    return dir;
  }

  isBrowserOpen(profileId) {
    return this.activeContexts.has(profileId);
  }

  async openBrowser(profileId, options = {}) {
    if (this.isBrowserOpen(profileId)) {
      this.log(`Trình duyệt cho profile ${profileId} đang mở sẵn.`, 'warning');
      const item = this.activeContexts.get(profileId);
      if (item && item.page) {
        try {
          await item.page.bringToFront();
        } catch (e) {}
      }
      return { success: true, message: 'Browser already open' };
    }

    const profile = db.getProfile(profileId);
    if (!profile) {
      throw new Error(`Không tìm thấy profile ${profileId}`);
    }

    const settings = db.getSettings();
    const profileDir = this.getProfileDir(profileId);

    this.log(`Đang khởi chạy Browser Hub cho tài khoản [${profile.name}]...`, 'info');

    const isWindows = process.platform === 'win32';
    const isHeadless = (!isWindows || process.env.HEADLESS === 'true') 
      ? true 
      : (options.headless !== undefined ? options.headless : false);

    let chromeExecutable = settings.chromePath || process.env.CHROME_PATH;
    if (chromeExecutable && !isWindows && chromeExecutable.includes(':\\')) {
      chromeExecutable = null;
    }
    if (!chromeExecutable && isWindows) {
      chromeExecutable = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
    }

    const launchArgs = [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-notifications',
      '--disable-blink-features=AutomationControlled',
      '--no-first-run',
      '--no-default-browser-check'
    ];
    if (isWindows && !isHeadless) {
      launchArgs.push('--start-maximized');
    }

    const launchOptions = {
      headless: isHeadless,
      viewport: null,
      args: launchArgs
    };

    if (chromeExecutable && fs.existsSync(chromeExecutable)) {
      launchOptions.executablePath = chromeExecutable;
    }

    if (profile.proxy && profile.proxy.trim() !== '') {
      launchOptions.proxy = { server: profile.proxy.trim() };
      this.log(`Sử dụng Proxy cho [${profile.name}]: ${profile.proxy}`, 'info');
    }

    try {
      const context = await chromium.launchPersistentContext(profileDir, launchOptions);
      const pages = context.pages();
      const page = pages.length > 0 ? pages[0] : await context.newPage();

      this.activeContexts.set(profileId, { context, page });
      db.updateProfile(profileId, { status: 'open' });
      if (this.eventEmitter) {
        this.eventEmitter.emit('profile-status', { profileId, status: 'open' });
      }

      // Khi người dùng tắt cửa sổ trình duyệt bằng tay
      context.on('close', () => {
        this.log(`Cửa sổ trình duyệt của [${profile.name}] đã đóng.`, 'info');
        this.activeContexts.delete(profileId);
        db.updateProfile(profileId, { status: 'ready' });
        if (this.eventEmitter) {
          this.eventEmitter.emit('profile-status', { profileId, status: 'ready' });
        }
      });

      // Điều hướng đến Facebook nếu được yêu cầu
      if (!options.skipNavigation) {
        await page.goto('https://www.facebook.com', { waitUntil: 'domcontentloaded', timeout: 45000 }).catch(err => {
          this.log(`Không thể tải Facebook: ${err.message}`, 'warning');
        });
      }

      this.log(`Khởi chạy Browser Hub thành công cho [${profile.name}].`, 'success');
      return { success: true };
    } catch (err) {
      this.log(`Lỗi khi mở trình duyệt [${profile.name}]: ${err.message}`, 'error');
      db.updateProfile(profileId, { status: 'error' });
      if (this.eventEmitter) {
        this.eventEmitter.emit('profile-status', { profileId, status: 'error' });
      }
      throw err;
    }
  }

  async closeBrowser(profileId) {
    if (!this.activeContexts.has(profileId)) {
      return { success: true, message: 'Browser is not open' };
    }

    try {
      const { context } = this.activeContexts.get(profileId);
      await context.close();
      this.activeContexts.delete(profileId);
      db.updateProfile(profileId, { status: 'ready' });
      if (this.eventEmitter) {
        this.eventEmitter.emit('profile-status', { profileId, status: 'ready' });
      }
      return { success: true };
    } catch (err) {
      this.log(`Lỗi đóng trình duyệt: ${err.message}`, 'error');
      return { success: false, error: err.message };
    }
  }

  async closeAllBrowsers() {
    for (const profileId of this.activeContexts.keys()) {
      await this.closeBrowser(profileId).catch(() => {});
    }
  }

  getActiveContext(profileId) {
    return this.activeContexts.get(profileId);
  }

  // --- LẤY API / SESSION TOKEN TỪ BROWSER HUB ---
  async fetchApiSession(profileId) {
    const profile = db.getProfile(profileId);
    if (!profile) throw new Error('Không tìm thấy profile');

    let shouldCloseAfter = false;
    let page = null;
    let context = null;

    if (this.isBrowserOpen(profileId)) {
      const active = this.activeContexts.get(profileId);
      page = active.page;
      context = active.context;
    } else {
      this.log(`Đang mở ngầm phiên Browser Hub của [${profile.name}] để trích xuất API & Token...`, 'info');
      await this.openBrowser(profileId, { headless: true, skipNavigation: true });
      const active = this.activeContexts.get(profileId);
      page = active.page;
      context = active.context;
      shouldCloseAfter = true;
    }

    try {
      // Đọc cookies của facebook.com
      const cookies = await context.cookies(['https://www.facebook.com']);
      const cUserCookie = cookies.find(c => c.name === 'c_user');
      const xsCookie = cookies.find(c => c.name === 'xs');

      if (!cUserCookie || !xsCookie) {
        this.log(`⚠️ Tài khoản [${profile.name}] chưa đăng nhập trên Facebook. Vui lòng bấm "Mở Trình Duyệt" để đăng nhập trước.`, 'warning');
        return { success: false, isLoggedIn: false, message: 'Tài khoản chưa đăng nhập Facebook.' };
      }

      const uid = cUserCookie.value;
      this.log(`✅ Đã trích xuất UID: ${uid} và Cookie hợp lệ cho [${profile.name}]!`, 'success');

      // Điều hướng lấy tên tài khoản & avatar thật chuẩn xác
      await page.goto('https://www.facebook.com/me', { waitUntil: 'domcontentloaded', timeout: 35000 }).catch(() => {});
      await new Promise(r => setTimeout(r, 3500));
      
      const accountData = await page.evaluate((uid) => {
        let name = '';
        let avatar = '';

        // 1. Lấy trực tiếp từ CurrentUserInitialData của Facebook
        try {
          if (window.require) {
            const u = window.require('CurrentUserInitialData');
            if (u) {
              if (u.NAME) name = u.NAME;
              if (u.PROFILE_PIC_URL) avatar = u.PROFILE_PIC_URL;
            }
          }
        } catch(e) {}

        // 2. Quét các thẻ script chứa dữ liệu người dùng
        if (!name || !avatar) {
          const scripts = Array.from(document.querySelectorAll('script')).map(s => s.innerText);
          for (const s of scripts) {
            if (!name) {
              const mName = s.match(/"NAME":"([^"]+)"/);
              if (mName) name = mName[1];
            }
            if (!avatar) {
              const mPic = s.match(/"PROFILE_PIC_URL":"([^"]+)"/);
              if (mPic) avatar = mPic[1].replace(/\\/g, '');
            }
          }
        }

        // 3. Quét thẻ H1 tiêu đề profile
        if (!name) {
          const h1 = document.querySelector('h1');
          if (h1 && h1.innerText) name = h1.innerText.trim();
        }

        // 4. Quét thẻ SVG/IMG chứa avatar thật từ scontent
        if (!avatar) {
          const imgs = Array.from(document.querySelectorAll('svg image, image, img'));
          for (const img of imgs) {
            const src = img.getAttribute('xlink:href') || img.getAttribute('href') || img.src || '';
            if (src.includes('scontent') && (src.includes('dst-jpg') || src.includes('p320x320') || src.includes('s320x320') || src.includes('cstp=mx'))) {
              avatar = src;
              break;
            }
          }
          if (!avatar) {
            for (const img of imgs) {
              const src = img.getAttribute('xlink:href') || img.getAttribute('href') || img.src || '';
              if (src.includes('scontent') && src.includes('fbcdn.net')) {
                avatar = src;
                break;
              }
            }
          }
        }

        return { name, avatar };
      }, uid);

      const updates = {
        uid,
        isLoggedIn: true,
        lastSynced: new Date().toISOString()
      };
      if (accountData.name && accountData.name.trim() !== '') {
        updates.name = accountData.name.trim();
      }
      if (accountData.avatar && accountData.avatar.trim() !== '') {
        updates.avatar = accountData.avatar.trim();
      }

      db.updateProfile(profileId, updates);
      if (this.eventEmitter) {
        this.eventEmitter.emit('profile-status', { profileId, status: 'ready' });
      }

      return { success: true, isLoggedIn: true, uid, name: updates.name || profile.name, avatar: updates.avatar };
    } catch (err) {
      this.log(`Lỗi khi trích xuất Session: ${err.message}`, 'error');
      return { success: false, error: err.message };
    } finally {
      if (shouldCloseAfter) {
        await this.closeBrowser(profileId).catch(() => {});
      }
    }
  }

  // --- NẠP COOKIE FACEBOOK VÀO PHIÊN TRÌNH DUYỆT (HỖ TRỢ ĐIỆN THOẠI) ---
  async importCookieSession(profileId, rawCookie) {
    const profile = db.getProfile(profileId);
    if (!profile) throw new Error('Không tìm thấy tài khoản');
    if (!rawCookie || !rawCookie.trim()) throw new Error('Chuỗi cookie không được để trống');

    let parsedCookies = [];
    const trimmed = rawCookie.trim();

    if (trimmed.startsWith('[') && trimmed.endsWith(']')) {
      try {
        const jsonList = JSON.parse(trimmed);
        parsedCookies = jsonList.map(c => ({
          name: c.name,
          value: c.value,
          domain: c.domain || '.facebook.com',
          path: c.path || '/'
        }));
      } catch (e) {
        throw new Error('Định dạng JSON cookie không hợp lệ');
      }
    } else {
      const parts = trimmed.split(';');
      for (const part of parts) {
        const eqIdx = part.indexOf('=');
        if (eqIdx !== -1) {
          const name = part.substring(0, eqIdx).trim();
          const value = part.substring(eqIdx + 1).trim();
          if (name && value) {
            parsedCookies.push({
              name,
              value,
              domain: '.facebook.com',
              path: '/'
            });
          }
        }
      }
    }

    if (!parsedCookies.length) {
      throw new Error('Không tìm thấy cookie hợp lệ. Vui lòng kiểm tra lại định dạng c_user=...; xs=...');
    }

    this.log(`Đang nạp ${parsedCookies.length} cookie cho tài khoản [${profile.name}]...`, 'info');

    let shouldCloseAfter = false;
    let context = null;

    if (this.isBrowserOpen(profileId)) {
      const active = this.activeContexts.get(profileId);
      context = active.context;
    } else {
      await this.openBrowser(profileId, { headless: true, skipNavigation: true });
      const active = this.activeContexts.get(profileId);
      context = active.context;
      shouldCloseAfter = true;
    }

    try {
      await context.addCookies(parsedCookies);
      this.log(`Đã nạp cookie thành công. Đang kiểm tra đăng nhập Facebook...`, 'info');
      const sessionResult = await this.fetchApiSession(profileId);
      return sessionResult;
    } finally {
      if (shouldCloseAfter) {
        await this.closeBrowser(profileId).catch(() => {});
      }
    }
  }

  // --- QUÉT TOÀN BỘ NHÓM ĐÃ THAM GIA THEO ACCOUNT (KÈM ẢNH NHÓM, SỐ THÀNH VIÊN) ---
  async syncJoinedGroups(profileId) {
    const profile = db.getProfile(profileId);
    if (!profile) throw new Error('Không tìm thấy profile');

    let shouldCloseAfter = false;
    let page = null;

    if (this.isBrowserOpen(profileId)) {
      const active = this.activeContexts.get(profileId);
      page = active.page;
    } else {
      this.log(`Khởi động phiên Browser Hub [${profile.name}] để quét danh sách nhóm đã tham gia...`, 'info');
      await this.openBrowser(profileId, { headless: true, skipNavigation: true });
      const active = this.activeContexts.get(profileId);
      page = active.page;
      shouldCloseAfter = true;
    }

    try {
      this.log(`Đang điều hướng đến trang nhóm đã tham gia (facebook.com/groups/joins/)...`, 'info');
      await page.goto('https://www.facebook.com/groups/joins/', { waitUntil: 'domcontentloaded', timeout: 45000 });
      await new Promise(r => setTimeout(r, 4000));

      // Kiểm tra đăng nhập
      const isLoginRequired = await page.$('input[name="email"]');
      if (isLoginRequired) {
        this.log(`❌ Tài khoản [${profile.name}] chưa đăng nhập Facebook. Vui lòng đăng nhập trước!`, 'error');
        return { success: false, message: 'Chưa đăng nhập Facebook' };
      }

      // Cuộn trang để tải nhiều nhóm hơn
      this.log(`Đang cuộn danh sách nhóm để tải đầy đủ dữ liệu và ảnh đại diện nhóm...`, 'info');
      for (let i = 0; i < 5; i++) {
        await page.mouse.wheel(0, 1800);
        await new Promise(r => setTimeout(r, 1200));
      }

      // Trích xuất danh sách link nhóm kèm ảnh avatar/ảnh bìa và số thành viên
      const extractedGroups = await page.evaluate(() => {
        const results = [];
        const links = Array.from(document.querySelectorAll('a[href*="/groups/"]'));
        const seen = new Set();

        for (const a of links) {
          const href = a.href || '';
          if (
            href.includes('/groups/feed') ||
            href.includes('/groups/discover') ||
            href.includes('/groups/create') ||
            href.includes('/groups/joins') ||
            href.includes('/notifications') ||
            href.includes('/help')
          ) {
            continue;
          }

          const match = href.match(/facebook\.com\/groups\/([^\/?#]+)/i);
          if (match && match[1]) {
            const groupId = match[1];
            if (!seen.has(groupId)) {
              seen.add(groupId);

              // 1. Tên nhóm
              let groupName = a.innerText.trim();
              if (!groupName || groupName.length < 2) {
                groupName = a.getAttribute('aria-label') || '';
              }
              if (groupName.includes('\n')) {
                groupName = groupName.split('\n')[0].trim();
              }
              if (!groupName || groupName === 'Nhóm' || groupName === 'Group') {
                groupName = `Nhóm ${groupId}`;
              }

              // 2. Tìm ảnh đại diện/bìa của nhóm xung quanh thẻ <a>
              let avatar = '';
              let container = a.closest('div[role="listitem"]') || a.closest('div[role="article"]') || a.parentElement;
              if (container) {
                const img = container.querySelector('img[src*="scontent"], img[src*="fbcdn.net"], image[*|href*="scontent"]');
                if (img) {
                  avatar = img.src || img.getAttribute('xlink:href') || '';
                }
              }
              if (!avatar) {
                // Thử tìm thẻ img ngay trong thẻ a
                const innerImg = a.querySelector('img');
                if (innerImg && innerImg.src) avatar = innerImg.src;
              }

              // 3. Quyền riêng tư & số thành viên
              let privacy = 'Công khai';
              let members = 'Cộng đồng FB';
              if (container) {
                const text = container.innerText || '';
                if (text.includes('Riêng tư') || text.includes('Private')) {
                  privacy = 'Riêng tư';
                }
                const memMatch = text.match(/(\d+[\.,]?\d*)\s*(K|M|triệu|nghìn)?\s*(thành viên|members)/i);
                if (memMatch) {
                  members = memMatch[0].trim();
                }
              }

              results.push({
                id: groupId,
                name: groupName,
                url: `https://www.facebook.com/groups/${groupId}`,
                avatar: avatar || `https://graph.facebook.com/${groupId}/picture?type=large`,
                privacy,
                members
              });
            }
          }
        }
        return results;
      });

      this.log(`🎉 Đã quét thành công ${extractedGroups.length} nhóm kèm ảnh nền/avatar cho tài khoản [${profile.name}]!`, 'success');
      db.updateProfileGroups(profileId, extractedGroups);
      db.updateProfile(profileId, { isLoggedIn: true });

      if (this.eventEmitter) {
        this.eventEmitter.emit('profile-status', { profileId, status: 'ready' });
      }

      return { success: true, count: extractedGroups.length, groups: extractedGroups };
    } catch (err) {
      this.log(`❌ Lỗi khi quét nhóm: ${err.message}`, 'error');
      return { success: false, error: err.message };
    } finally {
      if (shouldCloseAfter) {
        await this.closeBrowser(profileId).catch(() => {});
      }
    }
  }

  // --- CẬP NHẬT TƯƠNG TÁC (LIKE, COMMENT) CỦA BÀI VIẾT ĐÃ ĐĂNG ---
  async fetchPostEngagement(profileId, postUrl) {
    if (!postUrl || !postUrl.startsWith('http')) return null;

    let shouldCloseAfter = false;
    let page = null;

    if (this.isBrowserOpen(profileId)) {
      const active = this.activeContexts.get(profileId);
      page = active.page;
    } else {
      await this.openBrowser(profileId, { headless: true, skipNavigation: true });
      const active = this.activeContexts.get(profileId);
      page = active.page;
      shouldCloseAfter = true;
    }

    try {
      this.log(`Đang kiểm tra tương tác bài viết: ${postUrl}...`, 'info');
      await page.goto(postUrl, { waitUntil: 'domcontentloaded', timeout: 35000 });
      await new Promise(r => setTimeout(r, 3000));

      const stats = await page.evaluate(() => {
        let likes = 0;
        let comments = 0;

        // Tìm số like/cảm xúc
        const reactionEl = document.querySelector('[aria-label*="cảm xúc"], [aria-label*="reaction"], [aria-label*="like"]');
        if (reactionEl) {
          const text = reactionEl.getAttribute('aria-label') || reactionEl.innerText || '';
          const numMatch = text.match(/(\d+[\.,]?\d*)/);
          if (numMatch) likes = parseInt(numMatch[1].replace(/[\.,]/g, '')) || 0;
        }

        // Tìm số comment
        const commentEl = document.querySelector('[aria-label*="bình luận"]') || 
                          Array.from(document.querySelectorAll('span, div')).find(el => {
                            const t = (el.innerText || '').toLowerCase();
                            return t.includes('bình luận') || t.includes('comment');
                          });
        if (commentEl) {
          const text = commentEl.innerText || '';
          const numMatch = text.match(/(\d+[\.,]?\d*)\s*(bình luận|comment)/i);
          if (numMatch) comments = parseInt(numMatch[1].replace(/[\.,]/g, '')) || 0;
        }

        return { likes, comments };
      });

      this.log(`📊 Kết quả: ${stats.likes} Lượt thích | ${stats.comments} Bình luận.`, 'success');
      return stats;
    } catch (err) {
      this.log(`Không thể lấy tương tác: ${err.message}`, 'warning');
      return null;
    } finally {
      if (shouldCloseAfter) {
        await this.closeBrowser(profileId).catch(() => {});
      }
    }
  }

  // --- ĐĂNG NHẬP FACEBOOK BẰNG TÀI KHOẢN & MẬT KHẨU TỰ ĐỘNG (CHO ĐIỆN THOẠI) ---
  async loginWithCredentials(profileId, username, password, twoFactorCode = null) {
    const profile = db.getProfile(profileId);
    if (!profile) throw new Error('Không tìm thấy tài khoản');

    let shouldCloseAfter = false;
    let page = null;
    let context = null;

    if (this.isBrowserOpen(profileId)) {
      const active = this.activeContexts.get(profileId);
      page = active.page;
      context = active.context;
    } else {
      this.log(`Khởi chạy Chrome cho [${profile.name}] để đăng nhập...`, 'info');
      await this.openBrowser(profileId, { headless: true, skipNavigation: true });
      const active = this.activeContexts.get(profileId);
      page = active.page;
      context = active.context;
      shouldCloseAfter = true;
    }

    try {
      // 1. Nếu có mã 2FA gửi kèm (người dùng đang ở bước nhập mã xác thực)
      if (twoFactorCode && twoFactorCode.trim() !== '') {
        this.log(`Đang nhập mã xác thực 2FA cho [${profile.name}]...`, 'info');
        
        const codeInput = await page.$('input[name="approvals_code"], #approvals_code, input[type="text"], input[type="number"], input[inputmode="numeric"]');
        if (codeInput) {
          await codeInput.fill(twoFactorCode.trim());
          await new Promise(r => setTimeout(r, 600));

          const submitBtn = await page.$('#checkpointSubmitButton, button[type="submit"], button:has-text("Tiếp tục"), button:has-text("Continue"), button:has-text("Submit")');
          if (submitBtn) {
            await submitBtn.click();
          } else {
            await codeInput.press('Enter');
          }
          await new Promise(r => setTimeout(r, 4500));
        }

        const session = await this.fetchApiSession(profileId);
        if (session.isLoggedIn) {
          this.log(`🎉 Xác thực 2FA thành công cho [${session.name}]!`, 'success');
          return { success: true, isLoggedIn: true, name: session.name, uid: session.uid };
        }
        return { success: false, requires2FA: true, message: 'Mã 2FA chưa đúng hoặc Facebook cần xác nhận thêm. Vui lòng thử lại!' };
      }

      // 2. Đăng nhập bình thường với Username & Password
      this.log(`Đang truy cập trang đăng nhập Facebook...`, 'info');
      await page.goto('https://www.facebook.com/login.php', { waitUntil: 'domcontentloaded', timeout: 35000 });
      await new Promise(r => setTimeout(r, 2000));

      // Kiểm tra xem đã đăng nhập sẵn từ trước chưa
      const initialCookies = await context.cookies(['https://www.facebook.com']);
      if (initialCookies.some(c => c.name === 'c_user')) {
        this.log(`Tài khoản đã đăng nhập từ trước! Đang trích xuất thông tin...`, 'success');
        return await this.fetchApiSession(profileId);
      }

      // Tắt banner cookie nếu có
      try {
        const cookieBtn = await page.$('button[data-cookiebanner="accept_button"], button:has-text("Cho phép"), button:has-text("Allow"), [aria-label*="cookie"] button');
        if (cookieBtn) await cookieBtn.click().catch(() => {});
      } catch (e) {}

      // Đợi ô nhập email xuất hiện
      await page.waitForSelector('input[name="email"], #email, input[type="text"]', { timeout: 12000 }).catch(() => {});

      // Điền email/sđt và mật khẩu
      const emailField = await page.$('input[name="email"], #email, input[type="text"]');
      const passField = await page.$('input[name="pass"], #pass, input[type="password"]');

      if (!emailField || !passField) {
        throw new Error('Trang đăng nhập Facebook tải quá chậm hoặc bị chặn. Vui lòng thử lại!');
      }

      await emailField.fill(username.trim());
      await new Promise(r => setTimeout(r, 400));
      await passField.fill(password.trim());
      await new Promise(r => setTimeout(r, 600));

      this.log(`Đang bấm Đăng nhập Facebook...`, 'info');
      const loginBtn = await page.$('button[name="login"], #loginbutton, button[type="submit"]');
      if (loginBtn) {
        await loginBtn.click();
      } else {
        await passField.press('Enter');
      }

      // Đợi phản hồi từ Facebook
      await new Promise(r => setTimeout(r, 5500));

      const currentUrl = page.url();

      // Kiểm tra 2FA
      if (currentUrl.includes('checkpoint') || currentUrl.includes('two_factor')) {
        this.log(`⚠️ Tài khoản có bảo mật 2 lớp (2FA). Đang đợi nhập mã xác thực...`, 'warning');
        return {
          success: false,
          requires2FA: true,
          message: 'Tài khoản có bảo mật 2 lớp (2FA). Vui lòng nhập mã xác thực 6 số gửi về điện thoại / ứng dụng Authenticator!'
        };
      }

      // Kiểm tra lỗi sai mật khẩu
      const pageText = await page.evaluate(() => document.body ? document.body.innerText : '');
      if (pageText.includes('không chính xác') || pageText.includes('incorrect password') || pageText.includes('wrong credentials')) {
        return { success: false, error: 'Mật khẩu Facebook không chính xác. Vui lòng kiểm tra lại!' };
      }

      // Kiểm tra session đăng nhập
      const session = await this.fetchApiSession(profileId);
      if (session.isLoggedIn) {
        this.log(`🎉 Đăng nhập thành công tài khoản [${session.name}]!`, 'success');
        return { success: true, isLoggedIn: true, name: session.name, uid: session.uid };
      }

      // Nếu vẫn ở checkpoint khác
      if (currentUrl.includes('checkpoint')) {
        return { success: false, error: 'Facebook yêu cầu phê duyệt trên thiết bị cũ. Bạn có thể bấm "Mở Chrome" trên máy tính để duyệt qua.' };
      }

      return { success: false, error: 'Không thể đăng nhập. Vui lòng kiểm tra lại tài khoản và mật khẩu.' };
    } catch (err) {
      this.log(`Lỗi đăng nhập: ${err.message}`, 'error');
      return { success: false, error: err.message };
    } finally {
      if (shouldCloseAfter) {
        const currentUrl = page ? page.url() : '';
        if (!currentUrl.includes('checkpoint') && !currentUrl.includes('two_factor')) {
          await this.closeBrowser(profileId).catch(() => {});
        }
      }
    }
  }
}

module.exports = new BrowserHub();
