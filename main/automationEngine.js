const fs = require('fs');
const db = require('./db');
const browserHub = require('./browserHub');

class AutomationEngine {
  constructor() {
    this.isRunning = false;
    this.shouldStop = false;
    this.eventEmitter = null;
  }

  setEventEmitter(emitter) {
    this.eventEmitter = emitter;
  }

  log(message, type = 'info') {
    console.log(`[Automation] ${message}`);
    if (this.eventEmitter) {
      this.eventEmitter.emit('log', { time: new Date().toLocaleTimeString('vi-VN'), message, type });
    }
  }

  // --- Spin Syntax Engine ---
  // Hỗ trợ cấu trúc {A|B|C} và lồng nhau {A|{B1|B2}|C}
  processSpin(text) {
    if (!text) return '';
    const regex = /\{([^{}]+)\}/g;
    let result = text;
    let match;
    while ((match = regex.exec(result)) !== null) {
      const options = match[1].split('|');
      const chosen = options[Math.floor(Math.random() * options.length)];
      result = result.replace(match[0], chosen);
      regex.lastIndex = 0; // reset regex index to catch nested
    }
    return result;
  }

  // Sleep with stop checking
  async sleep(ms) {
    const step = 500;
    let elapsed = 0;
    while (elapsed < ms && !this.shouldStop) {
      await new Promise(r => setTimeout(r, step));
      elapsed += step;
    }
  }

  // Chuẩn hóa đường dẫn Facebook Group / Page
  normalizeGroupUrl(target) {
    let t = target.trim();
    if (!t) return null;
    if (t.startsWith('http://') || t.startsWith('https://')) {
      return t;
    }
    // Nếu chỉ nhập ID hoặc username
    if (/^\d+$/.test(t)) {
      return `https://www.facebook.com/groups/${t}`;
    }
    return `https://www.facebook.com/groups/${t}`;
  }

  async stopCampaign() {
    this.shouldStop = true;
    this.log('Đã gửi tín hiệu DỪNG chiến dịch. Đang đợi hoàn thành tác vụ hiện tại...', 'warning');
  }

  async startCampaign(config) {
    if (this.isRunning) {
      throw new Error('Một chiến dịch khác đang chạy. Vui lòng dừng hoặc đợi hoàn tất.');
    }

    const {
      profileIds = [],
      postId,
      customContent,
      customMedia = [],
      targets = [], // list of group URLs or IDs
      postToFeed = false,
      minDelay = 15,
      maxDelay = 35,
      headless = true
    } = config;

    if (!profileIds.length) throw new Error('Vui lòng chọn ít nhất một tài khoản Facebook!');
    if (!targets.length && !postToFeed) throw new Error('Vui lòng nhập ít nhất một nhóm (Group) hoặc chọn đăng Trang cá nhân!');

    let basePost = null;
    if (postId) {
      const posts = db.getPosts();
      basePost = posts.find(p => p.id === postId);
    }
    const rawContent = basePost ? basePost.content : (customContent || '');
    const mediaFiles = (basePost && basePost.media) ? basePost.media : customMedia;

    if (!rawContent.trim() && (!mediaFiles || !mediaFiles.length)) {
      throw new Error('Nội dung bài viết hoặc hình ảnh/video không được để trống!');
    }

    this.isRunning = true;
    this.shouldStop = false;
    this.log(`🚀 BẮT ĐẦU CHIẾN DỊCH ĐĂNG BÀI NGẦM TỰ ĐỘNG`, 'success');
    this.log(`Số tài khoản: ${profileIds.length} | Số mục tiêu: ${targets.length} Group ${postToFeed ? '+ Trang cá nhân' : ''}`);

    if (this.eventEmitter) {
      this.eventEmitter.emit('campaign-status', { isRunning: true });
    }

    let totalTasks = 0;
    let completedTasks = 0;
    let successCount = 0;
    let errorCount = 0;

    // Chuẩn bị danh sách nhiệm vụ với ID chính xác
    const tasks = [];
    for (const target of targets) {
      if (typeof target === 'object' && target !== null) {
        tasks.push({ 
          id: String(target.id || target.url || ('target_' + tasks.length)),
          type: 'group', 
          target: this.normalizeGroupUrl(target.url || target.id), 
          rawTarget: target.name || target.id || 'Group',
          avatar: target.avatar || ''
        });
      } else {
        tasks.push({ 
          id: String(target),
          type: 'group', 
          target: this.normalizeGroupUrl(target), 
          rawTarget: target,
          avatar: ''
        });
      }
    }
    if (postToFeed) {
      tasks.push({ id: 'feed', type: 'feed', target: 'https://www.facebook.com', rawTarget: 'Trang cá nhân', avatar: '' });
    }
    totalTasks = tasks.length;

    try {
      let profileIndex = 0;

      for (let i = 0; i < tasks.length; i++) {
        if (this.shouldStop) {
          this.log('🛑 Chiến dịch đã dừng theo yêu cầu của bạn.', 'warning');
          break;
        }

        const task = tasks[i];
        const currentProfileId = profileIds[profileIndex % profileIds.length];
        profileIndex++;

        const profile = db.getProfile(currentProfileId);
        const profileName = profile ? profile.name : currentProfileId;

        this.log(`----------------------------------------`);
        this.log(`[${i + 1}/${totalTasks}] Đang đăng bài lên: [${task.rawTarget}] (Nick: ${profileName})...`, 'info');

        // Bắn sự kiện cập nhật trạng thái dòng mục tiêu sang "Đang đăng..."
        if (this.eventEmitter) {
          this.eventEmitter.emit('campaign-item-update', {
            targetId: task.id,
            status: 'posting',
            message: `Đang đăng bài lên [${task.rawTarget}]...`
          });
        }

        // Mở trình duyệt ẩn hoàn toàn (headless: true)
        let page = null;
        try {
          if (!browserHub.isBrowserOpen(currentProfileId)) {
            await browserHub.openBrowser(currentProfileId, { headless: true, skipNavigation: true });
          }
          const active = browserHub.getActiveContext(currentProfileId);
          if (!active) throw new Error('Không thể khởi tạo phiên trình duyệt.');
          page = active.page;
        } catch (launchErr) {
          this.log(`❌ Lỗi khởi động trình duyệt cho [${profileName}]: ${launchErr.message}`, 'error');
          db.addHistory({
            profileId: currentProfileId,
            profileName,
            targetName: task.rawTarget,
            targetUrl: task.target,
            postTitle: basePost ? basePost.title : 'Bài viết tùy chỉnh',
            postContent: rawContent,
            status: 'error',
            message: `Không mở được trình duyệt: ${launchErr.message}`
          });
          errorCount++;
          completedTasks++;
          if (this.eventEmitter) {
            this.eventEmitter.emit('campaign-item-update', {
              targetId: task.id,
              status: 'error',
              message: launchErr.message
            });
          }
          continue;
        }

        // Xử lý Spin nội dung riêng cho bài này
        const finalContent = this.processSpin(rawContent);

        // Tiến hành đăng bài bằng Code Execution ngầm
        let postResult = null;
        try {
          if (task.type === 'group') {
            postResult = await this.postToFacebookGroup(page, task.target, finalContent, mediaFiles, profileName);
          } else {
            postResult = await this.postToFacebookFeed(page, finalContent, mediaFiles, profileName);
          }

          if (postResult.success) {
            successCount++;
            this.log(`✅ [THÀNH CÔNG] Đã đăng lên ${task.rawTarget}! ${postResult.status === 'pending_approval' ? '(Chờ duyệt)' : ''}`, 'success');
            db.addHistory({
              profileId: currentProfileId,
              profileName,
              targetName: task.rawTarget,
              targetUrl: task.target,
              targetAvatar: task.avatar || '',
              postTitle: basePost ? basePost.title : 'Bài viết',
              postContent: finalContent,
              status: postResult.status,
              message: postResult.message || 'Đăng thành công',
              postUrl: postResult.postUrl || task.target,
              likesCount: 0,
              commentsCount: 0,
              cmtStatus: postResult.status === 'pending_approval' ? 'Chờ duyệt' : 'Đã đăng'
            });

            if (this.eventEmitter) {
              this.eventEmitter.emit('campaign-item-update', {
                targetId: task.id,
                status: postResult.status || 'success',
                message: postResult.message || 'Đăng thành công'
              });
            }
          } else {
            errorCount++;
            this.log(`⚠️ [THẤT BẠI] ${task.rawTarget}: ${postResult.message}`, 'error');
            db.addHistory({
              profileId: currentProfileId,
              profileName,
              targetName: task.rawTarget,
              targetUrl: task.target,
              targetAvatar: task.avatar || '',
              postTitle: basePost ? basePost.title : 'Bài viết',
              postContent: finalContent,
              status: 'error',
              message: postResult.message,
              likesCount: 0,
              commentsCount: 0,
              cmtStatus: 'Lỗi đăng'
            });

            if (this.eventEmitter) {
              this.eventEmitter.emit('campaign-item-update', {
                targetId: task.id,
                status: 'error',
                message: postResult.message || 'Lỗi khi đăng bài'
              });
            }
          }
        } catch (execErr) {
          errorCount++;
          this.log(`❌ Lỗi ngoại lệ khi đăng [${task.rawTarget}]: ${execErr.message}`, 'error');
          db.addHistory({
            profileId: currentProfileId,
            profileName,
            targetName: task.rawTarget,
            targetUrl: task.target,
            targetAvatar: task.avatar || '',
            postTitle: basePost ? basePost.title : 'Bài viết',
            postContent: finalContent,
            status: 'error',
            message: execErr.message,
            likesCount: 0,
            commentsCount: 0,
            cmtStatus: 'Lỗi'
          });

          if (this.eventEmitter) {
            this.eventEmitter.emit('campaign-item-update', {
              targetId: task.id,
              status: 'error',
              message: execErr.message
            });
          }
        }

        completedTasks++;
        if (this.eventEmitter) {
          this.eventEmitter.emit('campaign-progress', {
            total: totalTasks,
            completed: completedTasks,
            success: successCount,
            error: errorCount
          });
        }

        // Delay an toàn giữa các bài đăng
        if (i < tasks.length - 1 && !this.shouldStop) {
          const delaySec = Math.floor(Math.random() * (maxDelay - minDelay + 1)) + minDelay;
          this.log(`⏳ Nghỉ an toàn ${delaySec} giây trước khi đăng mục tiêu tiếp theo...`, 'info');
          await this.sleep(delaySec * 1000);
        }
      }

      this.log(`========================================`);
      this.log(`🎉 CHIẾN DỊCH HOÀN TẤT! Thành công: ${successCount} | Thất bại: ${errorCount} | Tổng: ${completedTasks}`, 'success');

      if (this.eventEmitter) {
        this.eventEmitter.emit('campaign-completed', {
          total: totalTasks,
          completed: completedTasks,
          success: successCount,
          error: errorCount
        });
      }
    } finally {
      this.isRunning = false;
      this.shouldStop = false;
      if (this.eventEmitter) {
        this.eventEmitter.emit('campaign-status', { isRunning: false });
      }
    }
  }

  // --- HÀM ĐÍNH KÈM HÌNH ẢNH / VIDEO VÀO COMPOSER CHUẨN XÁC 100% ---
  async attachMediaToComposer(page, dialog, mediaFiles) {
    if (!mediaFiles || mediaFiles.length === 0) return true;

    // Lọc ra các file có tồn tại thật trên ổ đĩa máy tính
    const validFiles = mediaFiles.filter(f => {
      try {
        return fs.existsSync(f);
      } catch (e) {
        return false;
      }
    });

    if (validFiles.length === 0) {
      this.log(`⚠️ Các tệp đính kèm không tồn tại trên ổ đĩa máy tính!`, 'warning');
      return false;
    }

    this.log(`Bắt đầu đính kèm ${validFiles.length} tệp hình ảnh/video vào bài viết...`, 'info');

    let uploaded = false;

    // 1. Kiểm tra xem trong dialog đã có sẵn input[type="file"] chưa
    let fileInput = dialog ? await dialog.$('input[type="file"]') : await page.$('div[role="dialog"] input[type="file"]');

    if (!fileInput) {
      // 2. Bấm nút Ảnh/video trong dialog để mở vùng tải ảnh (Dropzone)
      this.log('Kích hoạt nút Ảnh/video trong hộp thoại tạo bài viết...', 'info');

      const [fileChooser] = await Promise.all([
        page.waitForEvent('filechooser', { timeout: 3500 }).catch(() => null),
        page.evaluate(() => {
          const d = document.querySelector('div[role="dialog"]') || document;
          const buttons = Array.from(d.querySelectorAll('div[role="button"], div[aria-label]'));
          for (const btn of buttons) {
            const label = (btn.getAttribute('aria-label') || btn.innerText || '').toLowerCase();
            if ((label.includes('ảnh/video') || label.includes('photo/video') || label.includes('ảnh / video') || label === 'ảnh') && !label.includes('chỉnh sửa') && !label.includes('gỡ')) {
              btn.click();
              return true;
            }
          }
          return false;
        })
      ]);

      if (fileChooser) {
        this.log('Đã bắt cổng chọn tệp của trình duyệt, đang nạp dữ liệu media...', 'info');
        await fileChooser.setFiles(validFiles);
        uploaded = true;
      } else {
        await this.sleep(1200);
        fileInput = dialog ? await dialog.$('input[type="file"]') : await page.$('div[role="dialog"] input[type="file"]');
      }
    }

    // 3. Nếu chưa qua fileChooser mà tìm thấy input[type="file"] trong dialog:
    if (!uploaded && fileInput) {
      this.log('Nạp tệp trực tiếp vào cổng upload của hộp thoại...', 'info');
      await fileInput.setInputFiles(validFiles);
      uploaded = true;
    }

    // 4. Nếu vẫn chưa nạp được, thử tìm nút to "Thêm ảnh/video" trong dropzone
    if (!uploaded) {
      this.log('Tìm kiếm vùng nhấn thêm ảnh trong dropzone...', 'info');
      const dropzoneBtn = dialog ? await dialog.$('div[role="button"]:has-text("Thêm ảnh/video"), span:has-text("Thêm ảnh/video"), div[role="button"]:has-text("Add Photos"), div[role="button"]:has-text("Add photos/videos")') : null;
      if (dropzoneBtn) {
        const [fileChooser] = await Promise.all([
          page.waitForEvent('filechooser', { timeout: 5000 }).catch(() => null),
          dropzoneBtn.click()
        ]);
        if (fileChooser) {
          await fileChooser.setFiles(validFiles);
          uploaded = true;
        }
      }
    }

    if (!uploaded) {
      this.log('⚠️ Không thể kích hoạt cổng upload media của Facebook.', 'warning');
      return false;
    }

    // 5. ĐỢI FACEBOOK XỬ LÝ UPLOAD VÀ HIỂN THỊ PREVIEW MEDIA ĐẦY ĐỦ
    this.log(`Đã nạp ${validFiles.length} tệp, đang chờ Facebook render preview & tải lên Cloud...`, 'info');
    let mediaConfirmed = false;

    for (let w = 0; w < 30; w++) { // Chờ tối đa 15 giây
      await this.sleep(500);

      const check = await page.evaluate(() => {
        const d = document.querySelector('div[role="dialog"]') || document;
        const previewImgs = Array.from(d.querySelectorAll('img')).filter(img => {
          const s = img.src || '';
          const isLarge = img.naturalWidth > 70 || img.offsetWidth > 70;
          return (s.includes('blob:') || s.includes('scontent') || s.includes('fbcdn')) && isLarge;
        });

        const hasControls = Boolean(
          d.querySelector('video') ||
          d.querySelector('div[aria-label*="Chỉnh sửa tất cả"], div[aria-label*="Edit all"], div[aria-label*="Gỡ"], div[aria-label*="xóa"], div[aria-label*="remove"]')
        );

        const isUploading = Boolean(
          d.querySelector('[role="progressbar"]') ||
          d.querySelector('circle') ||
          (d.innerText || '').includes('Đang tải lên') ||
          (d.innerText || '').includes('Uploading')
        );

        return {
          hasPreview: previewImgs.length > 0 || hasControls,
          isUploading,
          count: previewImgs.length
        };
      });

      if (check.hasPreview && !check.isUploading) {
        mediaConfirmed = true;
        this.log(`✅ Facebook đã tiếp nhận và hiển thị xem trước media hoàn tất!`, 'success');
        break;
      }
    }

    if (!mediaConfirmed) {
      this.log(`⚠️ Đang hoàn thiện các bước cuối cùng của tệp đính kèm...`, 'warning');
      await this.sleep(2000);
    }

    return true;
  }

  // --- KỊCH BẢN ĐĂNG BÀI NHÓM CHẠY NGẦM HOÀN TOÀN (DIRECT INJECTION) ---
  async postToFacebookGroup(page, groupUrl, content, mediaFiles, profileName) {
    this.log(`Điều hướng ngầm đến nhóm: ${groupUrl}...`, 'info');
    await page.goto(groupUrl, { waitUntil: 'domcontentloaded', timeout: 35000 });
    await this.sleep(2000);

    // 1. Kiểm tra màn hình "Tiếp tục" nếu có
    const continueBtn = await page.$('div[role="button"]:has-text("Tiếp tục"), button:has-text("Tiếp tục"), div[aria-label="Tiếp tục"]');
    if (continueBtn && await continueBtn.isVisible()) {
      this.log(`Tự động xác nhận phiên đăng nhập [${profileName}]...`, 'info');
      await continueBtn.click();
      await this.sleep(3000);
    }

    // Kiểm tra nhóm có tồn tại
    const pageTitle = await page.title();
    if (pageTitle.includes('Không tìm thấy') || pageTitle.includes('Content Not Found')) {
      return { success: false, message: 'Nhóm không tồn tại hoặc đã bị khóa.' };
    }

    // 2. Kích hoạt ô soạn thảo bài viết bằng Direct DOM Script
    this.log(`Kích hoạt khung soạn bài viết ngầm...`, 'info');
    const activated = await page.evaluate(() => {
      // Kích hoạt ô soạn thảo inline
      const composer = document.querySelector('div[data-pagelet="GroupInlineComposer"]') ||
                       document.querySelector('div[data-pagelet*="Composer"]');
      if (composer) {
        const btn = composer.querySelector('div[role="button"]') || composer.querySelector('span');
        if (btn) {
          btn.click();
          return true;
        }
      }

      // Quét DOM tìm các nút tạo bài
      const buttons = Array.from(document.querySelectorAll('div[role="button"], span'));
      for (const b of buttons) {
        const t = (b.innerText || '').toLowerCase().trim();
        if (
          t.includes('bạn viết gì') ||
          t.includes('viết gì đó') ||
          t.includes('tạo bài viết') ||
          t.includes('write something') ||
          t.includes('create a public post')
        ) {
          b.click();
          return true;
        }
      }
      return false;
    });

    if (!activated) {
      // Thử cuộn nhẹ trang nếu phần tử nằm dưới ảnh bìa
      await page.evaluate(() => window.scrollBy(0, 350));
      await this.sleep(1000);
      const retryActivated = await page.evaluate(() => {
        const composer = document.querySelector('div[data-pagelet*="Composer"]');
        if (composer) {
          const btn = composer.querySelector('div[role="button"]') || composer.querySelector('span');
          if (btn) { btn.click(); return true; }
        }
        return false;
      });
      if (!retryActivated) {
        return { success: false, message: 'Không tìm thấy khung soạn bài (Có thể bạn chưa được duyệt vào nhóm kín).' };
      }
    }

    // 3. Đợi cửa sổ soạn bài (Dialog) xuất hiện
    let dialog = null;
    try {
      dialog = await page.waitForSelector('div[role="dialog"]', { timeout: 8000 });
    } catch (e) {
      // Tiếp tục nếu dạng inline
    }

    // 4. BƯỚC 1: BƠM NỘI DUNG VĂN BẢN TRƯỚC (Tránh ghi đè media)
    if (content) {
      this.log(`Bơm nội dung bài viết vào trình soạn thảo...`, 'info');
      const editorEl = dialog ? await dialog.$('div[role="textbox"][contenteditable="true"]') : await page.$('div[role="textbox"][contenteditable="true"]');
      if (editorEl) {
        await editorEl.click();
        await this.sleep(300);
        await page.keyboard.insertText(content);
        await this.sleep(500);
      } else {
        await page.evaluate((text) => {
          const editor = document.querySelector('div[role="dialog"] div[role="textbox"][contenteditable="true"]') ||
                         document.querySelector('div[role="textbox"][contenteditable="true"]');
          if (!editor) return false;
          editor.focus();
          document.execCommand('insertText', false, text);
          editor.dispatchEvent(new InputEvent('beforeinput', { bubbles: true, cancelable: true, inputType: 'insertText', data: text }));
          editor.dispatchEvent(new InputEvent('input', { bubbles: true, cancelable: true, inputType: 'insertText', data: text }));
          editor.dispatchEvent(new Event('change', { bubbles: true }));
          return true;
        }, content);
        await this.sleep(500);
      }
    }

    // 5. BƯỚC 2: ĐÍNH KÈM HÌNH ẢNH / VIDEO VÀO BÀI VIẾT
    if (mediaFiles && mediaFiles.length > 0) {
      await this.attachMediaToComposer(page, dialog, mediaFiles);
    }

    // 6. BƯỚC 3: KÍCH HOẠT NÚT ĐĂNG BÀI & LẮNG NGHE PHẢN HỒI
    this.log(`Bấm nút Đăng bài viết...`, 'info');
    let graphqlConfirmed = false;
    const onResponse = (res) => {
      const u = res.url();
      if (u.includes('/api/graphql/') && res.status() === 200) {
        graphqlConfirmed = true;
      }
    };
    page.on('response', onResponse);

    // Tìm và bấm nút Đăng (Post)
    let submitClicked = false;
    for (let attempt = 0; attempt < 12; attempt++) {
      submitClicked = await page.evaluate(() => {
        const dialog = document.querySelector('div[role="dialog"]') || document;
        const candidates = Array.from(dialog.querySelectorAll('div[role="button"], button'));
        for (const btn of candidates) {
          const label = (btn.getAttribute('aria-label') || btn.innerText || '').trim().toLowerCase();
          const disabled = btn.getAttribute('aria-disabled') === 'true' || btn.disabled;
          if ((label === 'đăng' || label === 'post' || label === 'gửi' || label === 'submit') && !disabled) {
            btn.click();
            return true;
          }
        }
        return false;
      });
      if (submitClicked) break;
      await this.sleep(800);
    }

    if (!submitClicked) {
      page.off('response', onResponse);
      return { success: false, message: 'Nút Đăng bài không thể bấm hoặc bị vô hiệu hóa.' };
    }

    this.log(`Đã gửi lệnh ĐĂNG! Đang đợi Facebook xác nhận ngầm...`, 'info');

    // Chờ phản hồi xác nhận (tối đa 10 giây)
    for (let w = 0; w < 20; w++) {
      await this.sleep(500);
      const dialogDetached = await page.evaluate(() => !document.querySelector('div[role="dialog"]'));
      if (dialogDetached || graphqlConfirmed) {
        break;
      }
    }
    page.off('response', onResponse);

    // Kiểm tra thông điệp phản hồi
    const pageText = await page.evaluate(() => document.body.innerText).catch(() => '');
    if (pageText.includes('phê duyệt') || pageText.includes('pending') || pageText.includes('quản trị viên') || pageText.includes('chờ xét duyệt')) {
      return { success: true, status: 'pending_approval', message: 'Bài viết đã gửi và đang chờ Quản trị viên nhóm phê duyệt.', postUrl: groupUrl };
    }
    if (pageText.includes('Đã xảy ra lỗi') || pageText.includes('Không thể chia sẻ') || pageText.includes('bị chặn')) {
      return { success: false, message: 'Facebook từ chối: Bị hạn chế tính năng hoặc vi phạm nội quy nhóm.' };
    }

    // 7. CỐ GẮNG BẮT LINK BÀI VIẾT (PERMALINK) VỪA ĐĂNG THÀNH CÔNG
    let finalPostUrl = groupUrl;
    try {
      await this.sleep(1500);
      // Tìm thông báo toast xem bài viết hoặc thẻ link bài viết vừa đăng
      const postLinkFound = await page.evaluate(() => {
        // Kiểm tra thông báo toast xem bài viết
        const toast = Array.from(document.querySelectorAll('a')).find(a => {
          const t = (a.innerText || '').toLowerCase();
          const h = a.href || '';
          return (t.includes('xem bài') || t.includes('view post')) && (h.includes('/posts/') || h.includes('/permalink/'));
        });
        if (toast && toast.href) return toast.href;

        // Tìm link bài viết mới nhất trên nhóm
        const links = Array.from(document.querySelectorAll('a[href*="/posts/"], a[href*="/permalink/"]'));
        for (const l of links) {
          const t = (l.innerText || '').toLowerCase();
          if (t.includes('vừa xong') || t.includes('just now') || t.includes('1 phút') || t.includes('1 min') || t.includes('vài giây')) {
            return l.href;
          }
        }
        return null;
      });

      if (postLinkFound) {
        finalPostUrl = postLinkFound;
        this.log(`🔗 Đã lấy được link bài viết cụ thể: ${finalPostUrl}`, 'info');
      }
    } catch (errLink) {}

    return { 
      success: true, 
      status: 'success', 
      message: 'Bài viết kèm ảnh/video đã được đăng ngầm thành công lên nhóm.',
      postUrl: finalPostUrl
    };
  }

  // --- KỊCH BẢN ĐĂNG LÊN TRANG CÁ NHÂN CHẠY NGẦM HOÀN TOÀN ---
  async postToFacebookFeed(page, content, mediaFiles, profileName) {
    this.log(`Truy cập Trang chủ Facebook ngầm...`, 'info');
    await page.goto('https://www.facebook.com', { waitUntil: 'domcontentloaded', timeout: 35000 });
    await this.sleep(2000);

    // Kiểm tra nút Tiếp tục
    const continueBtn = await page.$('div[role="button"]:has-text("Tiếp tục"), button:has-text("Tiếp tục"), div[aria-label="Tiếp tục"]');
    if (continueBtn && await continueBtn.isVisible()) {
      await continueBtn.click();
      await this.sleep(3000);
    }

    // Kích hoạt ô soạn bài Feed
    this.log(`Kích hoạt khung soạn bài trên Feed...`, 'info');
    const activated = await page.evaluate(() => {
      const composer = document.querySelector('div[data-pagelet="FeedInlineComposer"]') || 
                       document.querySelector('div[data-pagelet*="Composer"]');
      if (composer) {
        const btn = composer.querySelector('div[role="button"]') || composer.querySelector('span');
        if (btn) { btn.click(); return true; }
      }
      const buttons = Array.from(document.querySelectorAll('div[role="button"], span'));
      for (const b of buttons) {
        const t = (b.innerText || '').toLowerCase();
        if (t.includes('nghĩ gì') || t.includes('mind')) {
          b.click();
          return true;
        }
      }
      return false;
    });

    if (!activated) {
      return { success: false, message: 'Không mở được khung soạn bài trên Trang cá nhân.' };
    }

    let dialog = null;
    try {
      dialog = await page.waitForSelector('div[role="dialog"]', { timeout: 8000 });
    } catch (e) {}

    // Bơm nội dung text trước
    if (content) {
      const editor = dialog ? await dialog.$('div[role="textbox"][contenteditable="true"]') : await page.$('div[role="textbox"][contenteditable="true"]');
      if (editor) {
        await editor.click();
        await this.sleep(300);
        await page.keyboard.insertText(content);
        await this.sleep(500);
      }
    }

    // Đính kèm hình ảnh/video
    if (mediaFiles && mediaFiles.length > 0) {
      await this.attachMediaToComposer(page, dialog, mediaFiles);
    }

    // Bấm nút Đăng
    let submitted = false;
    for (let attempt = 0; attempt < 12; attempt++) {
      submitted = await page.evaluate(() => {
        const dialog = document.querySelector('div[role="dialog"]') || document;
        const candidates = Array.from(dialog.querySelectorAll('div[role="button"], button'));
        for (const btn of candidates) {
          const label = (btn.getAttribute('aria-label') || btn.innerText || '').trim().toLowerCase();
          const disabled = btn.getAttribute('aria-disabled') === 'true' || btn.disabled;
          if ((label === 'đăng' || label === 'post') && !disabled) {
            btn.click();
            return true;
          }
        }
        return false;
      });
      if (submitted) break;
      await this.sleep(800);
    }

    if (!submitted) {
      return { success: false, message: 'Không bấm được nút Đăng bài trên Trang cá nhân.' };
    }

    await this.sleep(4000);
    return { success: true, status: 'success', message: 'Đã đăng thành công lên Trang cá nhân.', postUrl: 'https://www.facebook.com' };
  }
}

module.exports = new AutomationEngine();

