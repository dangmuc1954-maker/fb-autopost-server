// === GLOBAL STATE ===
let currentProfiles = [];
let selectedProfileIds = new Set();
let currentPosts = [];
let uploadedMediaFiles = []; // { name, filename, path, url }
let isCampaignRunning = false;

// === HELPER AN TOÀN TRÁNH LỖI SAFARI PARSING ===
async function safeFetchJson(url, options = {}) {
  let res;
  try {
    res = await fetch(url, options);
  } catch (netErr) {
    throw new Error('Lỗi mạng: Không thể kết nối tới máy chủ. Vui lòng kiểm tra Wifi/4G hoặc đường link Cloudflare.');
  }

  const text = await res.text();
  try {
    const data = JSON.parse(text);
    return { ok: res.ok, status: res.status, data };
  } catch (parseErr) {
    if (text.includes('Cannot POST') || text.includes('Cannot GET')) {
      throw new Error('Máy chủ trên máy tính chưa được khởi động lại để nhận chức năng Đăng Nhập mới. Anh hãy tắt cửa sổ đen và chạy lại file Chay_Web_Server.bat nhé!');
    }
    if (text.includes('502 Bad Gateway') || text.includes('Cloudflare')) {
      throw new Error('Mất kết nối với máy tính qua Cloudflare. Hãy đảm bảo máy tính vẫn đang bật mạng.');
    }
    throw new Error(`Phản hồi máy chủ không hợp lệ: ${text.substring(0, 100)}`);
  }
}

// === INITIALIZATION ===
document.addEventListener('DOMContentLoaded', () => {
  setupNavigation();
  setupSSE();
  setupCampaignControls();
  setupPostEditor();
  setupMediaUploader();
  setupAccountModals();

  // Load initial data from REST API
  loadProfiles();
  loadPosts();
  loadHistory();
  checkCampaignStatus();
});

// === NAVIGATION (BOTTOM TABS) ===
function setupNavigation() {
  const tabButtons = document.querySelectorAll('.nav-tab-btn');
  const tabPanes = document.querySelectorAll('.tab-pane');

  tabButtons.forEach(btn => {
    btn.addEventListener('click', () => {
      const targetId = btn.getAttribute('data-tab');

      tabButtons.forEach(b => b.classList.remove('active'));
      tabPanes.forEach(p => p.classList.remove('active'));

      btn.classList.add('active');
      const targetPane = document.getElementById(targetId);
      if (targetPane) targetPane.classList.add('active');

      if (targetId === 'tabHistory') {
        loadHistory();
      } else if (targetId === 'tabProfiles') {
        loadProfiles();
      } else if (targetId === 'tabPosts') {
        loadPosts();
      }
    });
  });

  document.getElementById('btnClearLogs')?.addEventListener('click', () => {
    const consoleEl = document.getElementById('terminalConsole');
    if (consoleEl) consoleEl.innerHTML = '';
  });
}

// === REALTIME SSE (SERVER-SENT EVENTS) ===
function setupSSE() {
  const evtSource = new EventSource('/api/events');

  evtSource.addEventListener('log', (e) => {
    try {
      const data = JSON.parse(e.data);
      appendTerminalLog(data.message, data.type || 'info', data.time);
    } catch (err) {}
  });

  evtSource.addEventListener('tunnel-url', (e) => {
    try {
      const data = JSON.parse(e.data);
      if (data.url) {
        appendTerminalLog(`🌐 Link Cloudflare sẵn sàng: ${data.url}`, 'success');
      }
    } catch (err) {}
  });

  evtSource.addEventListener('campaign-status', (e) => {
    try {
      const data = JSON.parse(e.data);
      setCampaignState(data.isRunning);
    } catch (err) {}
  });

  evtSource.addEventListener('campaign-progress', (e) => {
    try {
      const data = JSON.parse(e.data);
      updateProgress(data.completed, data.total, data.currentAction);
    } catch (err) {}
  });

  evtSource.addEventListener('campaign-item-update', (e) => {
    try {
      const data = JSON.parse(e.data);
      appendTerminalLog(`[${data.targetId}] ${data.message}`, data.status === 'error' ? 'error' : 'success');
    } catch (err) {}
  });

  evtSource.addEventListener('campaign-completed', (e) => {
    setCampaignState(false);
    appendTerminalLog('🎉 Chiến dịch đăng bài đã hoàn tất!', 'success');
    loadHistory();
  });

  evtSource.onerror = () => {
    console.warn('[SSE] Mất kết nối SSE, tự động thử lại...');
  };
}

function appendTerminalLog(message, type = 'info', timeStr = '') {
  const consoleEl = document.getElementById('terminalConsole');
  if (!consoleEl) return;

  const line = document.createElement('div');
  line.className = `terminal-line ${type}`;
  const time = timeStr || new Date().toLocaleTimeString('vi-VN');
  line.textContent = `[${time}] ${message}`;

  consoleEl.appendChild(line);
  consoleEl.scrollTop = consoleEl.scrollHeight;
}

// === TAB 1: CAMPAIGN RUNNER ===
async function checkCampaignStatus() {
  try {
    const res = await fetch('/api/campaign/status');
    const data = await res.json();
    setCampaignState(data.isRunning);
  } catch (e) {}
}

function setCampaignState(running) {
  isCampaignRunning = running;
  const startBtn = document.getElementById('btnStartCampaign');
  const stopBtn = document.getElementById('btnStopCampaign');
  const progressCard = document.getElementById('campaignProgressCard');
  const statusDot = document.getElementById('systemStatusDot');
  const statusText = document.getElementById('systemStatusText');

  if (running) {
    if (startBtn) startBtn.style.display = 'none';
    if (stopBtn) stopBtn.style.display = 'block';
    if (progressCard) progressCard.style.display = 'block';
    if (statusDot) statusDot.className = 'status-dot busy';
    if (statusText) statusText.textContent = 'Đang đăng bài';
  } else {
    if (startBtn) startBtn.style.display = 'block';
    if (stopBtn) stopBtn.style.display = 'none';
    if (statusDot) statusDot.className = 'status-dot';
    if (statusText) statusText.textContent = 'Sẵn sàng';
  }
}

function updateProgress(completed, total, currentAction) {
  const fill = document.getElementById('campaignProgressBar');
  const percentText = document.getElementById('campaignProgressPercentage');
  const statusText = document.getElementById('campaignCurrentStatus');

  const percent = total > 0 ? Math.round((completed / total) * 100) : 0;
  if (fill) fill.style.width = `${percent}%`;
  if (percentText) percentText.textContent = `${percent}% (${completed}/${total})`;
  if (statusText && currentAction) statusText.textContent = currentAction;
}

function setupCampaignControls() {
  // Chọn tất cả tài khoản
  document.getElementById('btnSelectAllProfiles')?.addEventListener('click', () => {
    if (selectedProfileIds.size === currentProfiles.length) {
      selectedProfileIds.clear();
    } else {
      currentProfiles.forEach(p => selectedProfileIds.add(p.id));
    }
    renderCampaignAccounts();
    renderSyncedGroupsList();
  });

  // Chọn mẫu bài viết từ dropdown
  document.getElementById('selectPostTemplate')?.addEventListener('change', (e) => {
    const postId = e.target.value;
    if (!postId) return;
    const post = currentPosts.find(p => p.id === postId);
    if (post) {
      document.getElementById('campaignPostContent').value = post.content || '';
    }
  });

  // Thử Spin Syntax
  document.getElementById('btnTestSpin')?.addEventListener('click', async () => {
    const content = document.getElementById('campaignPostContent')?.value || '';
    if (!content.trim()) {
      alert('Vui lòng nhập nội dung có chứa cú pháp {A|B|C} để thử nghiệm.');
      return;
    }
    try {
      const res = await fetch('/api/spin-test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content })
      });
      const data = await res.json();
      const resEl = document.getElementById('spinTestResult');
      if (resEl) {
        resEl.textContent = `➡️ Kết quả ngẫu nhiên: "${data.result.substring(0, 80)}${data.result.length > 80 ? '...' : ''}"`;
      }
    } catch (err) {
      console.error(err);
    }
  });

  // Bắt đầu chiến dịch
  document.getElementById('btnStartCampaign')?.addEventListener('click', async () => {
    const profileIds = Array.from(selectedProfileIds);
    if (!profileIds.length) {
      alert('Vui lòng chọn ít nhất 1 tài khoản Facebook để đăng!');
      return;
    }

    const content = document.getElementById('campaignPostContent')?.value || '';
    const postToFeed = document.getElementById('checkPostToFeed')?.checked || false;

    // Gom danh sách nhóm: từ checkbox nhóm đã đồng bộ + textarea tự nhập
    const targets = [];
    const checkedGroupBoxes = document.querySelectorAll('.synced-group-checkbox:checked');
    checkedGroupBoxes.forEach(cb => {
      targets.push({
        id: cb.value,
        name: cb.getAttribute('data-name') || cb.value,
        url: cb.getAttribute('data-url') || cb.value
      });
    });

    const customTargetText = document.getElementById('customTargetList')?.value || '';
    const customLines = customTargetText.split('\n').map(l => l.trim()).filter(Boolean);
    customLines.forEach(line => {
      targets.push(line);
    });

    if (!targets.length && !postToFeed) {
      alert('Vui lòng chọn hoặc nhập ít nhất một nhóm (Group), hoặc chọn Đăng lên Trang cá nhân!');
      return;
    }

    if (!content.trim() && uploadedMediaFiles.length === 0) {
      alert('Nội dung bài viết hoặc hình ảnh/video không được để trống!');
      return;
    }

    const minDelay = parseInt(document.getElementById('minDelayInput')?.value, 10) || 15;
    const maxDelay = parseInt(document.getElementById('maxDelayInput')?.value, 10) || 35;

    const payload = {
      profileIds,
      targets,
      customContent: content,
      customMedia: uploadedMediaFiles.map(f => f.path),
      postToFeed,
      minDelay,
      maxDelay,
      headless: true
    };

    try {
      appendTerminalLog('Đang gửi lệnh bắt đầu chiến dịch tới máy chủ...', 'info');
      const res = await fetch('/api/campaign/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const data = await res.json();
      if (!res.ok) {
        alert(data.error || 'Lỗi khi khởi chạy chiến dịch');
      } else {
        setCampaignState(true);
      }
    } catch (err) {
      alert('Lỗi kết nối tới máy chủ: ' + err.message);
    }
  });

  // Dừng chiến dịch
  document.getElementById('btnStopCampaign')?.addEventListener('click', async () => {
    if (!confirm('Bạn có chắc muốn DỪNG chiến dịch hiện tại?')) return;
    try {
      await fetch('/api/campaign/stop', { method: 'POST' });
      appendTerminalLog('Đã gửi yêu cầu DỪNG chiến dịch...', 'warning');
    } catch (err) {
      console.error(err);
    }
  });
}

// === MEDIA UPLOADER (TẢI ẢNH TỪ ĐIỆN THOẠI) ===
function setupMediaUploader() {
  const input = document.getElementById('mediaFileInput');
  const statusText = document.getElementById('uploadStatusText');

  input?.addEventListener('change', async (e) => {
    const files = e.target.files;
    if (!files || !files.length) return;

    if (statusText) statusText.textContent = `Đang tải ${files.length} tệp lên...`;

    const formData = new FormData();
    for (let i = 0; i < files.length; i++) {
      formData.append('files', files[i]);
    }

    try {
      const res = await fetch('/api/upload', {
        method: 'POST',
        body: formData
      });
      const data = await res.json();

      if (res.ok && data.files) {
        uploadedMediaFiles.push(...data.files);
        renderMediaPreviews();
        if (statusText) statusText.textContent = `✅ Đã tải xong ${data.files.length} tệp!`;
      } else {
        if (statusText) statusText.textContent = `❌ Lỗi: ${data.error || 'Không thể upload'}`;
      }
    } catch (err) {
      if (statusText) statusText.textContent = `❌ Lỗi kết nối: ${err.message}`;
    }

    input.value = '';
  });
}

function renderMediaPreviews() {
  const container = document.getElementById('mediaPreviews');
  if (!container) return;

  container.innerHTML = uploadedMediaFiles.map((f, idx) => {
    const isVideo = f.filename.match(/\.(mp4|mov|avi|webm)$/i);
    return `
      <div class="media-preview-item">
        ${isVideo ? `<video src="${f.url}"></video>` : `<img src="${f.url}">`}
        <button class="media-preview-remove" onclick="removeMediaItem(${idx})">&times;</button>
      </div>
    `;
  }).join('');
}

window.removeMediaItem = function(index) {
  uploadedMediaFiles.splice(index, 1);
  renderMediaPreviews();
};

// === RENDER PROFILES & GROUPS ===
async function loadProfiles() {
  try {
    const res = await fetch('/api/profiles');
    currentProfiles = await res.json();

    if (!selectedProfileIds.size && currentProfiles.length > 0) {
      selectedProfileIds.add(currentProfiles[0].id);
    }

    renderCampaignAccounts();
    renderSyncedGroupsList();
    renderProfilesTab();
  } catch (err) {
    console.error('Lỗi tải profiles:', err);
  }
}

function renderCampaignAccounts() {
  const grid = document.getElementById('campaignAccountGrid');
  if (!grid) return;

  if (!currentProfiles.length) {
    grid.innerHTML = '<div style="color: var(--text-dim); font-size: 12px; grid-column: 1/-1;">Chưa có tài khoản nào trong hệ thống.</div>';
    return;
  }

  grid.innerHTML = currentProfiles.map(p => {
    const isSelected = selectedProfileIds.has(p.id);
    const avatar = p.avatar || 'https://via.placeholder.com/32';
    const groupCount = p.groups ? p.groups.length : 0;

    return `
      <div class="account-chip ${isSelected ? 'selected' : ''}" onclick="toggleAccountSelect('${p.id}')">
        <img src="${avatar}" onerror="this.src='https://via.placeholder.com/32'">
        <div class="account-chip-info">
          <div class="account-chip-name">${p.name}</div>
          <div class="account-chip-groups">${groupCount} nhóm</div>
        </div>
      </div>
    `;
  }).join('');
}

window.toggleAccountSelect = function(id) {
  if (selectedProfileIds.has(id)) {
    selectedProfileIds.delete(id);
  } else {
    selectedProfileIds.add(id);
  }
  renderCampaignAccounts();
  renderSyncedGroupsList();
};

function renderSyncedGroupsList() {
  const container = document.getElementById('syncedGroupsCheckboxList');
  if (!container) return;

  const allGroups = [];
  selectedProfileIds.forEach(pid => {
    const p = currentProfiles.find(item => item.id === pid);
    if (p && p.groups) {
      p.groups.forEach(g => {
        if (!allGroups.some(item => item.id === g.id)) {
          allGroups.push(g);
        }
      });
    }
  });

  if (!allGroups.length) {
    container.innerHTML = '<span style="color: var(--text-dim); font-size: 12px;">Các tài khoản đã chọn chưa đồng bộ nhóm nào.</span>';
    return;
  }

  container.innerHTML = allGroups.map(g => `
    <label style="display: flex; align-items: center; gap: 8px; margin-bottom: 6px; font-size: 12px; cursor: pointer;">
      <input type="checkbox" class="synced-group-checkbox" value="${g.id}" data-name="${g.name}" data-url="${g.url || ''}" style="accent-color: var(--accent-cyan);">
      <span>${g.name || g.id}</span>
    </label>
  `).join('');
}

function renderProfilesTab() {
  const container = document.getElementById('profilesListContainer');
  if (!container) return;

  if (!currentProfiles.length) {
    container.innerHTML = '<div style="color: var(--text-dim); font-size: 12px; padding: 10px 0;">Chưa có tài khoản Facebook nào. Bấm nút <b>"+ Thêm Tài Khoản"</b> ở trên để thêm.</div>';
    return;
  }

  container.innerHTML = currentProfiles.map(p => {
    const groupCount = p.groups ? p.groups.length : 0;
    const avatar = p.avatar || 'https://via.placeholder.com/40';
    const isLogged = p.isLoggedIn;
    const statusText = isLogged ? '🟢 Đã kết nối' : '○ Chưa đăng nhập';
    const statusColor = isLogged ? 'var(--accent-emerald)' : 'var(--text-dim)';

    return `
      <div class="card" style="margin-bottom: 12px; padding: 14px;">
        <div style="display: flex; align-items: flex-start; justify-content: space-between; margin-bottom: 10px;">
          <div style="display: flex; align-items: center; gap: 10px;">
            <img src="${avatar}" style="width: 42px; height: 42px; border-radius: 50%; object-fit: cover; border: 1px solid var(--border-color);" onerror="this.src='https://via.placeholder.com/42'">
            <div>
              <div style="font-weight: 600; font-size: 13.5px; color: var(--text-main);">${p.name}</div>
              <div style="font-size: 11px; color: ${statusColor}; font-weight: 500;">${statusText}</div>
              <div style="font-size: 10.5px; color: var(--text-dim); margin-top: 1px;">
                ${p.uid ? `UID: ${p.uid} • ` : ''}${groupCount} nhóm đã tham gia
              </div>
            </div>
          </div>
          <button class="btn btn-secondary" style="padding: 3px 8px; font-size: 11px; color: var(--accent-rose);" onclick="deleteProfile('${p.id}', '${p.name}')" title="Xóa tài khoản này">
            🗑️ Xóa
          </button>
        </div>

        <div style="display: flex; flex-wrap: wrap; gap: 6px; padding-top: 8px; border-top: 1px solid var(--border-color);">
          ${!isLogged ? `
            <button class="btn btn-primary" style="font-size: 11px; padding: 5px 12px;" onclick="openLoginForProfile('${p.id}', '${p.name}')">
              🚀 Đăng Nhập (Email/Pass)
            </button>
          ` : `
            <button class="btn btn-secondary" style="font-size: 11px; padding: 5px 10px;" onclick="syncProfileGroups('${p.id}')">
              🔄 Đồng bộ nhóm
            </button>
          `}
          <button class="btn btn-secondary" style="font-size: 11px; padding: 5px 10px;" onclick="openBrowserForProfile('${p.id}')">
            🌐 Mở Chrome trên PC
          </button>
        </div>
      </div>
    `;
  }).join('');
}

let activeLoginProfileId = null;

function setupAccountModals() {
  const addModal = document.getElementById('addAccountModal');
  const stepCredentials = document.getElementById('loginStepCredentials');
  const step2FA = document.getElementById('loginStep2FA');
  const advancedCookieBox = document.getElementById('advancedCookieBox');

  // Bật/tắt ô nhập cookie nâng cao
  document.getElementById('toggleAdvancedCookie')?.addEventListener('click', () => {
    if (advancedCookieBox) {
      advancedCookieBox.style.display = advancedCookieBox.style.display === 'none' ? 'block' : 'none';
    }
  });

  // Mở modal thêm tài khoản mới
  document.getElementById('btnOpenAddAccountModal')?.addEventListener('click', () => {
    activeLoginProfileId = null;
    document.getElementById('addAccountModalTitle').textContent = 'Thêm & Đăng Nhập Tài Khoản Facebook';
    document.getElementById('newAccountName').value = `Nick Facebook ${currentProfiles.length + 1}`;
    document.getElementById('fbLoginUser').value = '';
    document.getElementById('fbLoginPass').value = '';
    document.getElementById('fbLogin2FACode').value = '';
    if (stepCredentials) stepCredentials.style.display = 'block';
    if (step2FA) step2FA.style.display = 'none';
    if (advancedCookieBox) advancedCookieBox.style.display = 'none';
    addModal?.classList.add('open');
  });

  document.getElementById('btnCloseAddAccountModal')?.addEventListener('click', () => addModal?.classList.remove('open'));
  document.getElementById('btnCancelAddAccountModal')?.addEventListener('click', () => addModal?.classList.remove('open'));
  document.getElementById('btnBackToCredentials')?.addEventListener('click', () => {
    if (stepCredentials) stepCredentials.style.display = 'block';
    if (step2FA) step2FA.style.display = 'none';
  });

  // Bấm Đăng Nhập Tự Động bằng Email/SĐT + Mật khẩu
  document.getElementById('btnSubmitAddAccount')?.addEventListener('click', async () => {
    const name = document.getElementById('newAccountName')?.value.trim() || 'Nick Facebook';
    const username = document.getElementById('fbLoginUser')?.value.trim();
    const password = document.getElementById('fbLoginPass')?.value.trim();

    if (!username || !password) {
      alert('Vui lòng nhập Email / Số điện thoại và Mật khẩu Facebook!');
      return;
    }

    const submitBtn = document.getElementById('btnSubmitAddAccount');
    if (submitBtn) {
      submitBtn.disabled = true;
      submitBtn.textContent = '⏳ Đang đăng nhập...';
    }

    try {
      // 1. Tạo profile nếu là tài khoản mới
      let profileId = activeLoginProfileId;
      if (!profileId) {
        appendTerminalLog(`Đang tạo tài khoản [${name}]...`, 'info');
        const profRes = await safeFetchJson('/api/profiles', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name })
        });
        profileId = profRes.data.id;
        activeLoginProfileId = profileId;
      }

      appendTerminalLog(`Đang mở Chrome đăng nhập tự động cho [${username}]...`, 'info');

      // 2. Gửi lệnh đăng nhập bằng Email + Pass
      const loginRes = await safeFetchJson(`/api/profiles/${profileId}/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password })
      });
      const loginData = loginRes.data;

      if (loginData.requires2FA) {
        // Facebook yêu cầu mã 2FA
        appendTerminalLog('⚠️ Facebook yêu cầu mã 2FA. Đang chuyển sang màn hình nhập mã...', 'warning');
        if (stepCredentials) stepCredentials.style.display = 'none';
        if (step2FA) step2FA.style.display = 'block';
        document.getElementById('fbLogin2FACode').focus();
      } else if (loginData.isLoggedIn || loginData.success) {
        alert(`🎉 ĐĂNG NHẬP THÀNH CÔNG!\nTài khoản: ${loginData.name || name} (UID: ${loginData.uid || ''})`);
        addModal?.classList.remove('open');
        await loadProfiles();
      } else {
        alert('❌ ' + (loginData.error || loginData.message || 'Đăng nhập không thành công.'));
      }
    } catch (err) {
      alert('Lỗi đăng nhập: ' + err.message);
    } finally {
      if (submitBtn) {
        submitBtn.disabled = false;
        submitBtn.textContent = '🚀 Đăng Nhập Tự Động';
      }
    }
  });

  // Bấm Xác Nhận Mã 2FA (6 số)
  document.getElementById('btnSubmit2FA')?.addEventListener('click', async () => {
    const code = document.getElementById('fbLogin2FACode')?.value.trim();
    if (!code) {
      alert('Vui lòng nhập mã 6 số từ ứng dụng xác thực / SMS!');
      return;
    }

    const btn2FA = document.getElementById('btnSubmit2FA');
    if (btn2FA) {
      btn2FA.disabled = true;
      btn2FA.textContent = '⏳ Đang xác thực...';
    }

    try {
      appendTerminalLog(`Đang gửi mã 2FA [${code}] lên Facebook...`, 'info');
      const res = await safeFetchJson(`/api/profiles/${activeLoginProfileId}/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ twoFactorCode: code })
      });
      const data = res.data;

      if (data.isLoggedIn || data.success) {
        alert(`🎉 XÁC THỰC 2FA THÀNH CÔNG!\nChào mừng ${data.name || 'Facebook'} (UID: ${data.uid || ''})`);
        addModal?.classList.remove('open');
        await loadProfiles();
      } else {
        alert('❌ ' + (data.message || data.error || 'Mã 2FA chưa đúng. Vui lòng thử lại!'));
      }
    } catch (err) {
      alert('Lỗi: ' + err.message);
    } finally {
      if (btn2FA) {
        btn2FA.disabled = false;
        btn2FA.textContent = '✓ Xác Nhận Mã 2FA';
      }
    }
  });

  // Dành cho người muốn nạp cookie thủ công
  document.getElementById('btnSubmitCookieOnly')?.addEventListener('click', async () => {
    const name = document.getElementById('newAccountName')?.value.trim() || 'Nick Facebook';
    const cookie = document.getElementById('newAccountCookie')?.value.trim();

    if (!cookie) {
      alert('Vui lòng dán chuỗi cookie!');
      return;
    }

    try {
      let profileId = activeLoginProfileId;
      if (!profileId) {
        const res = await safeFetchJson('/api/profiles', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name })
        });
        profileId = res.data.id;
      }

      appendTerminalLog(`Đang nạp cookie cho profile...`, 'info');
      const res = await safeFetchJson(`/api/profiles/${profileId}/import-cookie`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cookie })
      });
      const data = res.data;

      if (data.isLoggedIn) {
        alert(`✅ Nạp cookie thành công cho [${data.name || name}]!`);
        addModal?.classList.remove('open');
        await loadProfiles();
      } else {
        alert('⚠️ ' + (data.message || data.error || 'Cookie không hợp lệ.'));
      }
    } catch (err) {
      alert('Lỗi nạp cookie: ' + err.message);
    }
  });
}

window.openLoginForProfile = function(profileId, name) {
  activeLoginProfileId = profileId;
  const addModal = document.getElementById('addAccountModal');
  document.getElementById('addAccountModalTitle').textContent = `Đăng Nhập Cho [${name}]`;
  document.getElementById('newAccountName').value = name;
  document.getElementById('fbLoginUser').value = '';
  document.getElementById('fbLoginPass').value = '';
  document.getElementById('fbLogin2FACode').value = '';
  document.getElementById('loginStepCredentials').style.display = 'block';
  document.getElementById('loginStep2FA').style.display = 'none';
  addModal?.classList.add('open');
};

window.openBrowserForProfile = async function(profileId) {
  appendTerminalLog(`Đang gửi lệnh mở trình duyệt Chrome trên máy tính...`, 'info');
  try {
    const res = await fetch(`/api/profiles/${profileId}/open-browser`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ headless: false })
    });
    alert('Đã mở cửa sổ Chrome trên máy tính! Bạn có thể đăng nhập Facebook trực tiếp trên màn hình máy tính.');
  } catch (err) {
    alert('Lỗi mở trình duyệt: ' + err.message);
  }
};

window.deleteProfile = async function(profileId, name) {
  if (!confirm(`Bạn có chắc muốn xóa tài khoản [${name}] khỏi hệ thống?`)) return;
  try {
    await fetch(`/api/profiles/${profileId}`, { method: 'DELETE' });
    await loadProfiles();
  } catch (err) {
    alert('Lỗi xóa tài khoản: ' + err.message);
  }
};

window.syncProfileGroups = async function(profileId) {
  appendTerminalLog(`Đang gửi lệnh đồng bộ nhóm cho nick...`, 'info');
  try {
    const res = await fetch(`/api/profiles/${profileId}/sync-groups`, { method: 'POST' });
    const data = await res.json();
    if (data.success) {
      alert(`Đã đồng bộ thành công ${data.count || 0} nhóm!`);
      loadProfiles();
    } else {
      alert('Đồng bộ không thành công: ' + (data.message || 'Lỗi'));
    }
  } catch (err) {
    alert('Lỗi: ' + err.message);
  }
};

// === TAB 2: POSTS TEMPLATES ===
async function loadPosts() {
  try {
    const res = await fetch('/api/posts');
    currentPosts = await res.json();
    renderPostsDropdown();
    renderPostsTab();
  } catch (err) {
    console.error('Lỗi tải bài viết:', err);
  }
}

function renderPostsDropdown() {
  const dropdown = document.getElementById('selectPostTemplate');
  if (!dropdown) return;

  dropdown.innerHTML = '<option value="">-- Dùng bài viết mẫu --</option>' +
    currentPosts.map(p => `<option value="${p.id}">${p.title || 'Bài viết #' + p.id}</option>`).join('');
}

function renderPostsTab() {
  const container = document.getElementById('postTemplateList');
  if (!container) return;

  if (!currentPosts.length) {
    container.innerHTML = '<div style="color: var(--text-dim); font-size: 12px;">Chưa có bài viết mẫu nào. Bấm nút "+ Thêm Mẫu" để tạo.</div>';
    return;
  }

  container.innerHTML = currentPosts.map(p => `
    <div class="card" style="margin-bottom: 10px; padding: 12px;">
      <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 6px;">
        <span style="font-weight: 600; font-size: 13px; color: var(--accent-cyan);">${p.title || 'Không tiêu đề'}</span>
        <div style="display: flex; gap: 6px;">
          <button class="btn btn-secondary" style="padding: 2px 6px; font-size: 11px;" onclick="editPost('${p.id}')">Sửa</button>
          <button class="btn btn-danger" style="padding: 2px 6px; font-size: 11px;" onclick="deletePost('${p.id}')">Xóa</button>
        </div>
      </div>
      <div style="font-size: 12px; color: var(--text-muted); line-height: 1.4; max-height: 60px; overflow: hidden; text-overflow: ellipsis;">
        ${p.content}
      </div>
    </div>
  `).join('');
}

function setupPostEditor() {
  const modal = document.getElementById('postModal');
  document.getElementById('btnOpenAddPostModal')?.addEventListener('click', () => {
    document.getElementById('postModalTitle').textContent = 'Tạo Mẫu Bài Viết Mới';
    document.getElementById('editPostId').value = '';
    document.getElementById('modalPostTitle').value = '';
    document.getElementById('modalPostContent').value = '';
    modal?.classList.add('open');
  });

  document.getElementById('btnClosePostModal')?.addEventListener('click', () => modal?.classList.remove('open'));
  document.getElementById('btnCancelPostModal')?.addEventListener('click', () => modal?.classList.remove('open'));

  document.getElementById('btnSavePostModal')?.addEventListener('click', async () => {
    const id = document.getElementById('editPostId').value;
    const title = document.getElementById('modalPostTitle').value.trim();
    const content = document.getElementById('modalPostContent').value.trim();

    if (!content) {
      alert('Vui lòng nhập nội dung bài viết!');
      return;
    }

    try {
      await fetch('/api/posts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: id || undefined, title, content })
      });
      modal?.classList.remove('open');
      loadPosts();
    } catch (err) {
      alert('Lỗi lưu bài viết: ' + err.message);
    }
  });
}

window.editPost = function(id) {
  const post = currentPosts.find(p => p.id === id);
  if (!post) return;
  document.getElementById('postModalTitle').textContent = 'Chỉnh Sửa Bài Viết Mẫu';
  document.getElementById('editPostId').value = post.id;
  document.getElementById('modalPostTitle').value = post.title || '';
  document.getElementById('modalPostContent').value = post.content || '';
  document.getElementById('postModal')?.classList.add('open');
};

window.deletePost = async function(id) {
  if (!confirm('Bạn có chắc muốn xóa bài viết này?')) return;
  try {
    await fetch(`/api/posts/${id}`, { method: 'DELETE' });
    loadPosts();
  } catch (err) {
    alert('Lỗi xóa bài viết: ' + err.message);
  }
};

// === TAB 4: HISTORY ===
async function loadHistory() {
  try {
    const res = await fetch('/api/history');
    const history = await res.json();
    renderHistoryTab(history);
  } catch (err) {
    console.error('Lỗi tải lịch sử:', err);
  }
}

function renderHistoryTab(history) {
  const container = document.getElementById('historyListContainer');
  if (!container) return;

  if (!history || !history.length) {
    container.innerHTML = '<div style="color: var(--text-dim); font-size: 12px;">Chưa có lịch sử đăng bài nào.</div>';
    return;
  }

  // Sắp xếp mới nhất lên đầu
  const sorted = [...history].reverse();

  container.innerHTML = sorted.map(item => {
    let badgeClass = 'success';
    let statusText = 'Thành công';

    if (item.status === 'pending_approval') {
      badgeClass = 'pending';
      statusText = 'Chờ duyệt';
    } else if (item.status === 'error') {
      badgeClass = 'error';
      statusText = 'Lỗi';
    }

    return `
      <div class="history-item">
        <div class="history-header">
          <span style="font-weight: 600; font-size: 12px; color: var(--text-main);">${item.targetName || 'Group'}</span>
          <span class="badge ${badgeClass}">${statusText}</span>
        </div>
        <div style="font-size: 11px; color: var(--text-dim);">Nick: ${item.profileName || 'Facebook'} • ${item.time || ''}</div>
        <div style="font-size: 11px; color: var(--text-muted);">${item.message || ''}</div>
        ${item.postUrl ? `<a href="${item.postUrl}" target="_blank" style="font-size: 11px; color: var(--accent-cyan); text-decoration: none;">🔗 Xem bài đăng trên FB</a>` : ''}
      </div>
    `;
  }).join('');
}

document.getElementById('btnClearHistoryBtn')?.addEventListener('click', async () => {
  if (!confirm('Bạn có chắc muốn xóa sạch toàn bộ lịch sử đăng bài?')) return;
  try {
    await fetch('/api/history/clear', { method: 'POST' });
    loadHistory();
  } catch (err) {}
});
