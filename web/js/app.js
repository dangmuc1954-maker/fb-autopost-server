// ==============================================================================
// FB AutoPost Master - Unified Web & Cloud Adapter
// Cung cấp 100% chức năng, giao diện và cách vận hành giống hệt Tool Desktop App
// ==============================================================================

// === 1. TẠO TẦNG ADAPTER window.electronAPI CHO TRÌNH DUYỆT WEB ===
if (!window.electronAPI) {
  const eventListeners = {
    log: new Set(),
    'campaign-status': new Set(),
    'campaign-progress': new Set(),
    'campaign-item-update': new Set(),
    'campaign-completed': new Set(),
    'profile-status': new Set(),
    'tunnel-url': new Set()
  };

  async function apiFetch(url, options = {}) {
    let res;
    try {
      res = await fetch(url, options);
    } catch (e) {
      throw new Error(`Lỗi kết nối tới Web Server: ${e.message}`);
    }
    const text = await res.text();
    try {
      return JSON.parse(text);
    } catch (e) {
      return { success: false, raw: text, status: res.status };
    }
  }

  // Khởi tạo SSE lắng nghe realtime từ Server
  function initSSE() {
    try {
      const evtSource = new EventSource('/api/events');

      const dispatch = (eventName, data) => {
        const set = eventListeners[eventName];
        if (set) {
          set.forEach(cb => {
            try { cb(data); } catch (err) { console.error(`[SSE ${eventName} Handler Error]`, err); }
          });
        }
      };

      evtSource.addEventListener('log', (e) => {
        try { dispatch('log', JSON.parse(e.data)); } catch (err) {}
      });
      evtSource.addEventListener('campaign-status', (e) => {
        try { dispatch('campaign-status', JSON.parse(e.data)); } catch (err) {}
      });
      evtSource.addEventListener('campaign-progress', (e) => {
        try { dispatch('campaign-progress', JSON.parse(e.data)); } catch (err) {}
      });
      evtSource.addEventListener('campaign-item-update', (e) => {
        try { dispatch('campaign-item-update', JSON.parse(e.data)); } catch (err) {}
      });
      evtSource.addEventListener('campaign-completed', (e) => {
        try { dispatch('campaign-completed', JSON.parse(e.data)); } catch (err) {}
      });
      evtSource.addEventListener('profile-status', (e) => {
        try { dispatch('profile-status', JSON.parse(e.data)); } catch (err) {}
      });
      evtSource.addEventListener('tunnel-url', (e) => {
        try { dispatch('tunnel-url', JSON.parse(e.data)); } catch (err) {}
      });

      evtSource.onerror = () => {
        console.warn('[SSE] Mất kết nối, trình duyệt sẽ tự động kết nối lại...');
      };
    } catch (err) {
      console.error('[SSE Init Error]', err);
    }
  }

  initSSE();

  window.electronAPI = {
    // Profiles & Browser Hub
    getProfiles: () => apiFetch('/api/profiles'),
    addProfile: (profile) => apiFetch('/api/profiles', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(profile)
    }),
    updateProfile: (id, updates) => apiFetch(`/api/profiles/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updates)
    }),
    deleteProfile: (id) => apiFetch(`/api/profiles/${id}`, { method: 'DELETE' }),
    openBrowser: (profileId, options = {}) => apiFetch(`/api/profiles/${profileId}/open-browser`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(options)
    }),
    closeBrowser: (profileId) => apiFetch(`/api/profiles/${profileId}/close-browser`, { method: 'POST' }),
    syncJoinedGroups: (profileId) => apiFetch(`/api/profiles/${profileId}/sync-groups`, { method: 'POST' }),
    fetchApiSession: (profileId) => apiFetch(`/api/profiles/${profileId}/fetch-api`, { method: 'POST' }),
    refreshPostEngagement: (historyId) => apiFetch(`/api/history/${historyId}/refresh-engagement`, { method: 'POST' }),
    refreshAllEngagement: () => apiFetch('/api/history/refresh-all', { method: 'POST' }),

    // Hỗ trợ đăng nhập trực tiếp từ xa (Email/Pass + 2FA và Cookie)
    loginWithCredentials: (profileId, username, password, twoFactorCode = '') => apiFetch(`/api/profiles/${profileId}/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password, twoFactorCode })
    }),
    importCookieSession: (profileId, cookie) => apiFetch(`/api/profiles/${profileId}/import-cookie`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ cookie })
    }),

    // Posts (Kho bài viết)
    getPosts: () => apiFetch('/api/posts'),
    savePost: (post) => apiFetch('/api/posts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(post)
    }),
    deletePost: (id) => apiFetch(`/api/posts/${id}`, { method: 'DELETE' }),

    // History & Settings
    getHistory: () => apiFetch('/api/history'),
    clearHistory: () => apiFetch('/api/history/clear', { method: 'POST' }),
    getSettings: () => apiFetch('/api/settings'),
    updateSettings: (settings) => apiFetch('/api/settings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(settings)
    }),
    getWebServerInfo: () => apiFetch('/api/network-info'),

    // Media File Upload (Thay thế native dialog trong Electron)
    selectMediaFiles: () => {
      return new Promise((resolve) => {
        const fileInput = document.getElementById('webMediaFileInput');
        if (!fileInput) return resolve([]);

        const handleChange = async (e) => {
          fileInput.removeEventListener('change', handleChange);
          const files = e.target.files;
          if (!files || files.length === 0) return resolve([]);

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
            if (data.success && data.files) {
              // Trả về danh sách path server hoặc url
              const paths = data.files.map(f => f.path || f.url);
              resolve(paths);
            } else {
              alert('Lỗi tải file: ' + (data.error || 'Upload failed'));
              resolve([]);
            }
          } catch (err) {
            alert('Lỗi kết nối upload: ' + err.message);
            resolve([]);
          }
          fileInput.value = '';
        };

        fileInput.addEventListener('change', handleChange);
        fileInput.click();
      });
    },

    selectChromePath: () => {
      const p = prompt('Nhập đường dẫn đầy đủ đến tệp chrome.exe trên máy tính của bạn:', 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe');
      return Promise.resolve(p ? p.trim() : null);
    },

    // Campaign
    startCampaign: (config) => apiFetch('/api/campaign/start', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(config)
    }),
    stopCampaign: () => apiFetch('/api/campaign/stop', { method: 'POST' }),

    // Event Registrations
    onLog: (cb) => { eventListeners.log.add(cb); return () => eventListeners.log.delete(cb); },
    onCampaignStatus: (cb) => { eventListeners['campaign-status'].add(cb); return () => eventListeners['campaign-status'].delete(cb); },
    onCampaignProgress: (cb) => { eventListeners['campaign-progress'].add(cb); return () => eventListeners['campaign-progress'].delete(cb); },
    onCampaignItemUpdate: (cb) => { eventListeners['campaign-item-update'].add(cb); return () => eventListeners['campaign-item-update'].delete(cb); },
    onCampaignCompleted: (cb) => { eventListeners['campaign-completed'].add(cb); return () => eventListeners['campaign-completed'].delete(cb); },
    onProfileStatus: (cb) => { eventListeners['profile-status'].add(cb); return () => eventListeners['profile-status'].delete(cb); },
    onTunnelUrl: (cb) => { eventListeners['tunnel-url'].add(cb); return () => eventListeners['tunnel-url'].delete(cb); }
  };
}

// === 2. APPLICATION STATE MANAGEMENT ===
let currentProfiles = [];
let currentPosts = [];
let currentHistory = [];
let selectedProfileId = null;
let currentSelectedPost = null;
let currentMediaFiles = [];
let isCampaignRunning = false;

// === 3. INITIALIZATION ===
document.addEventListener('DOMContentLoaded', async () => {
  setupNavigation();
  setupHubControls();
  setupModals();
  setupPostEditor();
  setupCampaignRunner();
  setupSettings();
  setupEventListeners();

  // Load initial data
  await loadProfiles();
  await loadPosts();
  await loadHistory();
  await loadSettings();
  await loadWebServerInfo();
});

async function loadWebServerInfo() {
  try {
    const info = await window.electronAPI.getWebServerInfo();
    const label = document.getElementById('topbarWebUrl');
    const btn = document.getElementById('btnWebMobileLink');
    let targetUrl = info.tunnelUrl || info.lanUrl || info.localUrl || window.location.origin;

    const updateBtn = (url, isTunnel = false) => {
      targetUrl = url;
      if (label) {
        label.textContent = isTunnel ? url.replace('https://', '') : url;
      }
      if (btn) {
        btn.title = isTunnel 
          ? 'Bấm để copy link Cloud/Cloudflare (mở được ở bất kỳ đâu)' 
          : 'Bấm để copy link máy chủ';
        btn.style.borderColor = isTunnel ? 'rgba(16, 185, 129, 0.6)' : 'rgba(6, 182, 212, 0.4)';
        btn.style.background = isTunnel ? 'rgba(16, 185, 129, 0.12)' : 'rgba(6, 182, 212, 0.1)';
      }
    };

    updateBtn(targetUrl, Boolean(info.tunnelUrl));

    if (btn) {
      btn.onclick = () => {
        navigator.clipboard.writeText(targetUrl);
        alert(`Đã sao chép link Web Hub:\n${targetUrl}\n\nBạn có thể dán link này vào điện thoại hoặc gửi cho bạn bè để truy cập trực tiếp!`);
      };
    }

    if (window.electronAPI.onTunnelUrl) {
      window.electronAPI.onTunnelUrl((data) => {
        const url = (typeof data === 'object' && data.url) ? data.url : data;
        updateBtn(url, true);
      });
    }
  } catch (err) {
    console.error('Lỗi lấy thông tin Web Server:', err);
  }
}

// === 4. NAVIGATION ===
function setupNavigation() {
  const navItems = document.querySelectorAll('.nav-item');
  const tabs = document.querySelectorAll('.tab-content');
  const pageTitleText = document.getElementById('pageTitleText');
  const sidebar = document.getElementById('appSidebar');
  const backdrop = document.getElementById('mobileSidebarBackdrop');
  const toggleBtn = document.getElementById('btnToggleMobileMenu');

  const titles = {
    'tab-hub': 'Quản lý Tài khoản Trình duyệt (Browser Hub)',
    'tab-campaign': 'Chiến Dịch Đăng Bài Hàng Loạt Vào Nhóm',
    'tab-content': 'Kho Bài Viết & Spin Studio',
    'tab-logs': 'Nhật Ký & Báo Cáo Tương Tác (Like / Cmt)',
    'tab-settings': 'Cấu Hình Hệ Thống'
  };

  const closeMobileMenu = () => {
    sidebar?.classList.remove('mobile-open');
    backdrop?.classList.remove('active');
  };

  toggleBtn?.addEventListener('click', () => {
    sidebar?.classList.toggle('mobile-open');
    backdrop?.classList.toggle('active');
  });

  backdrop?.addEventListener('click', closeMobileMenu);

  navItems.forEach(item => {
    item.addEventListener('click', () => {
      const targetTab = item.getAttribute('data-tab');

      navItems.forEach(n => n.classList.remove('active'));
      tabs.forEach(t => t.classList.remove('active'));

      item.classList.add('active');
      const activeTabEl = document.getElementById(targetTab);
      if (activeTabEl) activeTabEl.classList.add('active');

      if (pageTitleText && titles[targetTab]) {
        pageTitleText.textContent = titles[targetTab];
      }

      closeMobileMenu();

      if (targetTab === 'tab-campaign') {
        renderCampaignProfiles();
        renderCampaignPostsDropdown();
        renderCampaignGroupsTable();
      } else if (targetTab === 'tab-logs') {
        loadHistory();
      }
    });
  });

  document.getElementById('btnQuickTerminal')?.addEventListener('click', () => {
    document.getElementById('navLogs')?.click();
  });

  document.getElementById('btnTopAddAccount')?.addEventListener('click', () => {
    window.openAddProfileModal();
  });
}

// === 5. TAB 1: BROWSER HUB & PLATFORM RIBBON ===
async function loadProfiles() {
  try {
    currentProfiles = await window.electronAPI.getProfiles();
    if (!selectedProfileId && currentProfiles.length > 0) {
      selectedProfileId = currentProfiles[0].id;
    }
    renderPlatformRibbon();
    renderInspector();
    renderHubGroups();
    updateSidebarStats();
  } catch (err) {
    console.error('Lỗi tải danh sách profile:', err);
  }
}

function renderPlatformRibbon() {
  const container = document.getElementById('platformRibbon');
  const countBadge = document.getElementById('profileCountBadge');
  if (!container) return;

  if (countBadge) {
    countBadge.textContent = `${currentProfiles.length} Tài khoản`;
  }

  let html = currentProfiles.map(p => {
    const isActive = p.id === selectedProfileId;
    const isLogged = p.isLoggedIn;
    const statusPillClass = isLogged ? 'logged-in' : 'not-logged';
    const statusText = isLogged ? '● Logged in' : '○ Chưa kết nối';
    const groupsCount = (p.groups || []).length;
    const avatarSrc = p.avatar || (p.uid ? `https://graph.facebook.com/${p.uid}/picture?type=large` : 'https://graph.facebook.com/4/picture?type=large');

    return `
      <div class="platform-card ${isActive ? 'active' : ''}" onclick="selectHubProfile('${p.id}')">
        <div class="platform-card-top">
          <div class="platform-card-identity">
            <div class="account-avatar-wrapper">
              <img src="${avatarSrc}" class="account-avatar-img" onerror="this.src='https://graph.facebook.com/4/picture?type=large';">
              <div class="avatar-online-dot" style="${isLogged ? 'background: var(--accent-emerald);' : 'background: #64748b;'}"></div>
            </div>
            <div style="overflow: hidden;">
              <div class="platform-card-name" title="${escapeHtml(p.name)}">${escapeHtml(p.name)}</div>
              <span class="status-pill ${statusPillClass}" style="margin-top: 2px;">${statusText}</span>
            </div>
          </div>
        </div>
        <div class="platform-card-meta">
          <span>UID: ${p.uid ? escapeHtml(p.uid) : '--'}</span>
          <span class="platform-card-groups-count">⚡ ${groupsCount} nhóm</span>
        </div>
      </div>
    `;
  }).join('');

  html += `
    <div class="platform-card" style="border: 1px dashed var(--border-subtle); display: flex; align-items: center; justify-content: center; min-width: 160px; background: rgba(255,255,255,0.02);" onclick="openAddProfileModal()">
      <span style="color: var(--accent-cyan); font-weight: 600; font-size: 13px;">+ Thêm Tài Khoản</span>
    </div>
  `;

  container.innerHTML = html;
}

window.selectHubProfile = function(profileId) {
  selectedProfileId = profileId;
  renderPlatformRibbon();
  renderInspector();
  renderHubGroups();
};

function renderInspector() {
  const p = currentProfiles.find(item => item.id === selectedProfileId);
  if (!p) return;

  const headerName = document.getElementById('currentAccountHeaderName');
  const headerStatus = document.getElementById('currentAccountHeaderStatus');
  const btnOpen = document.getElementById('btnHubOpenBrowser');
  const btnClose = document.getElementById('btnHubCloseBrowser');

  if (headerName) headerName.textContent = p.name;
  if (headerStatus) {
    if (p.status === 'open') {
      headerStatus.className = 'status-pill logged-in';
      headerStatus.textContent = '🟢 Đang mở Chrome';
      if (btnOpen) btnOpen.style.display = 'none';
      if (btnClose) btnClose.style.display = 'inline-flex';
    } else {
      headerStatus.className = p.isLoggedIn ? 'status-pill logged-in' : 'status-pill not-logged';
      headerStatus.textContent = p.isLoggedIn ? '● Logged in' : '○ Chưa kết nối';
      if (btnOpen) btnOpen.style.display = 'inline-flex';
      if (btnClose) btnClose.style.display = 'none';
    }
  }

  // Right Inspector HERO CARD
  const heroAvatar = document.getElementById('inspectorHeroAvatar');
  const avatarSrc = p.avatar || (p.uid ? `https://graph.facebook.com/${p.uid}/picture?type=large` : 'https://graph.facebook.com/4/picture?type=large');
  if (heroAvatar) {
    heroAvatar.src = avatarSrc;
    heroAvatar.onerror = () => { heroAvatar.src = 'https://graph.facebook.com/4/picture?type=large'; };
  }

  document.getElementById('inspectorName').textContent = p.name;
  const uidBadge = document.getElementById('inspectorUidBadge');
  if (uidBadge) uidBadge.textContent = p.uid ? `UID: ${p.uid}` : 'UID: Chưa đồng bộ';

  const proxyBadge = document.getElementById('inspectorProxyBadge');
  if (proxyBadge) proxyBadge.textContent = p.proxy ? `Proxy: ${p.proxy}` : 'IP Máy Tính';

  const inspPill = document.getElementById('inspectorStatusPill');
  if (inspPill) {
    inspPill.className = p.isLoggedIn ? 'status-pill logged-in' : 'status-pill not-logged';
    inspPill.textContent = p.isLoggedIn ? '● Sẵn sàng làm việc' : '○ Chưa đăng nhập';
  }

  const groupsCount = (p.groups || []).length;
  document.getElementById('statJoinedGroupsCount').textContent = `${groupsCount} nhóm`;
  document.getElementById('activeGroupCountText').textContent = groupsCount;

  // API tab inputs
  document.getElementById('hubDetailUid').value = p.uid || '';
  document.getElementById('hubDetailProxy').value = p.proxy || '';
  document.getElementById('hubDetailNote').value = p.note || '';
}

function renderHubGroups() {
  const p = currentProfiles.find(item => item.id === selectedProfileId);
  const cardsContainer = document.getElementById('hubGroupsCardsContainer');
  const tableBody = document.getElementById('hubGroupsTableBody');
  if (!cardsContainer || !tableBody) return;

  if (!p || !p.groups || p.groups.length === 0) {
    const emptyHtml = `
      <div style="grid-column: 1 / -1; text-align: center; color: var(--text-dim); padding: 50px 15px; background: rgba(0,0,0,0.2); border-radius: var(--radius-md); border: 1px dashed var(--border-subtle);">
        <div style="font-size: 32px; margin-bottom: 8px;">🌐</div>
        <p style="font-size: 14px; color: var(--text-muted); margin-bottom: 6px;">Chưa có danh sách nhóm của tài khoản <b>${escapeHtml(p ? p.name : '')}</b>.</p>
        <p style="font-size: 12px; color: var(--text-dim); margin-bottom: 14px;">Bấm <b>"⚡ Quét Nhóm Đã Tham Gia"</b> để tool tự động cào tên, ảnh đại diện và số thành viên của toàn bộ nhóm!</p>
        <button class="btn btn-cyan" onclick="document.getElementById('btnHubSyncGroups').click()">⚡ Quét Nhóm Ngay</button>
      </div>
    `;
    cardsContainer.innerHTML = emptyHtml;
    tableBody.innerHTML = `<tr><td colspan="6" style="text-align: center; color: var(--text-dim); padding: 40px;">Chưa có nhóm nào. Bấm Quét Nhóm để tải về.</td></tr>`;
    return;
  }

  const filterKeyword = (document.getElementById('inputSearchGroups')?.value || '').toLowerCase().trim();
  const filtered = p.groups.filter(g => {
    if (!filterKeyword) return true;
    return (g.name || '').toLowerCase().includes(filterKeyword) || (g.id || '').includes(filterKeyword);
  });

  // 1. RENDER CHẾ ĐỘ THẺ (CARDS GRID)
  cardsContainer.innerHTML = filtered.map(g => {
    const avatar = g.avatar || `https://graph.facebook.com/${g.id}/picture?type=large`;
    const isPrivate = g.privacy === 'Riêng tư';

    return `
      <div class="group-rich-card" id="card-group-${g.id}">
        <div class="group-card-banner">
          <img src="${avatar}" onerror="this.src='https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=400&auto=format&fit=crop&q=60';">
          <span class="badge-privacy-glass ${isPrivate ? 'private' : 'public'}">${isPrivate ? '🔒 Riêng tư' : '🌐 Công khai'}</span>
          <span class="badge-members-glass">👥 ${escapeHtml(g.members || 'Thành viên')}</span>
          <label class="group-card-checkbox-label" title="Tick chọn nhóm này để đăng">
            <input type="checkbox" class="hub-group-cb" value="${escapeHtml(g.url || g.id)}" data-name="${escapeHtml(g.name)}" checked>
          </label>
        </div>
        <div class="group-card-content">
          <div class="group-card-title" title="${escapeHtml(g.name)}">${escapeHtml(g.name)}</div>
          <div class="group-card-footer">
            <span style="font-size: 11px; color: var(--text-dim); font-family: monospace;">ID: ${escapeHtml(g.id)}</span>
            <a href="${escapeHtml(g.url)}" target="_blank" class="btn btn-secondary btn-sm" style="text-decoration: none; padding: 2px 10px; font-size: 11.5px;">Mở FB</a>
          </div>
        </div>
      </div>
    `;
  }).join('');

  // 2. RENDER CHẾ ĐỘ BẢNG (TABLE VIEW)
  tableBody.innerHTML = filtered.map(g => {
    const avatar = g.avatar || `https://graph.facebook.com/${g.id}/picture?type=large`;
    const isPrivate = g.privacy === 'Riêng tư';

    return `
      <tr>
        <td><input type="checkbox" class="hub-group-cb-table" value="${escapeHtml(g.url || g.id)}" data-name="${escapeHtml(g.name)}" checked></td>
        <td>
          <img src="${avatar}" class="group-table-thumb" onerror="this.src='https://graph.facebook.com/4/picture?type=large';">
        </td>
        <td>
          <div style="font-weight: 600; color: #fff;">${escapeHtml(g.name)}</div>
          <div style="font-size: 10.5px; color: var(--accent-cyan); font-family: monospace;">${escapeHtml(g.id)}</div>
        </td>
        <td><span class="badge-privacy ${isPrivate ? 'private' : 'public'}">${isPrivate ? '🔒 Riêng tư' : '🌐 Công khai'}</span></td>
        <td><span class="badge-members">👥 ${escapeHtml(g.members || 'Thành viên')}</span></td>
        <td>
          <a href="${escapeHtml(g.url)}" target="_blank" class="btn btn-secondary btn-sm" style="text-decoration: none; padding: 3px 8px;">Mở Nhóm</a>
        </td>
      </tr>
    `;
  }).join('');
}

function setupHubControls() {
  // Toggle View Mode
  document.getElementById('btnViewModeCards')?.addEventListener('click', () => {
    document.getElementById('btnViewModeCards')?.classList.add('active');
    document.getElementById('btnViewModeTable')?.classList.remove('active');
    document.getElementById('hubGroupsCardsContainer').style.display = 'grid';
    document.getElementById('hubGroupsTableContainer').style.display = 'none';
  });

  document.getElementById('btnViewModeTable')?.addEventListener('click', () => {
    document.getElementById('btnViewModeTable')?.classList.add('active');
    document.getElementById('btnViewModeCards')?.classList.remove('active');
    document.getElementById('hubGroupsCardsContainer').style.display = 'none';
    document.getElementById('hubGroupsTableContainer').style.display = 'block';
  });

  // Switch subtabs
  const subtabBtns = document.querySelectorAll('.hub-tab-btn');
  subtabBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      subtabBtns.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      const target = btn.getAttribute('data-subtab');
      document.getElementById('subtab-groups').style.display = target === 'subtab-groups' ? 'flex' : 'none';
      document.getElementById('subtab-api').style.display = target === 'subtab-api' ? 'block' : 'none';
    });
  });

  // Search input
  document.getElementById('inputSearchGroups')?.addEventListener('input', () => {
    renderHubGroups();
  });

  // Select / Deselect
  document.getElementById('cbHubCheckAll')?.addEventListener('change', (e) => {
    const cbs = document.querySelectorAll('.hub-group-cb, .hub-group-cb-table');
    cbs.forEach(cb => cb.checked = e.target.checked);
  });

  document.getElementById('btnSelectAllHubGroups')?.addEventListener('click', () => {
    document.querySelectorAll('.hub-group-cb, .hub-group-cb-table').forEach(cb => cb.checked = true);
  });

  document.getElementById('btnDeselectAllHubGroups')?.addEventListener('click', () => {
    document.querySelectorAll('.hub-group-cb, .hub-group-cb-table').forEach(cb => cb.checked = false);
  });

  // Mở trình duyệt Chrome
  document.getElementById('btnHubOpenBrowser')?.addEventListener('click', async () => {
    if (!selectedProfileId) return;
    try {
      appendLog({ time: new Date().toLocaleTimeString('vi-VN'), message: `Đang gửi lệnh mở trình duyệt...`, type: 'info' });
      const res = await window.electronAPI.openBrowser(selectedProfileId, { headless: false });
      alert('Đã gửi lệnh mở trình duyệt thành công!');
      await loadProfiles();
    } catch (e) {
      alert('Lỗi: ' + e.message);
    }
  });

  document.getElementById('btnInspectorOpenFB')?.addEventListener('click', async () => {
    document.getElementById('btnHubOpenBrowser')?.click();
  });

  // Đóng trình duyệt
  document.getElementById('btnHubCloseBrowser')?.addEventListener('click', async () => {
    if (!selectedProfileId) return;
    await window.electronAPI.closeBrowser(selectedProfileId);
    await loadProfiles();
  });

  // QUÉT NHÓM ĐÃ THAM GIA
  const handleSyncGroups = async () => {
    if (!selectedProfileId) {
      alert('Vui lòng chọn tài khoản Facebook để quét nhóm!');
      return;
    }
    const p = currentProfiles.find(item => item.id === selectedProfileId);
    appendLog({ time: new Date().toLocaleTimeString('vi-VN'), message: `Bắt đầu quét danh sách nhóm cho [${p.name}]...`, type: 'info' });

    try {
      const res = await window.electronAPI.syncJoinedGroups(selectedProfileId);
      if (res.success) {
        alert(`🎉 Quét thành công! Đã tìm thấy ${res.count || 0} nhóm mà nick này đã tham gia.`);
        await loadProfiles();
      } else {
        alert('Không thể quét nhóm: ' + (res.message || res.error || 'Lỗi'));
      }
    } catch (e) {
      alert('Lỗi khi quét nhóm: ' + e.message);
    }
  };

  document.getElementById('btnHubSyncGroups')?.addEventListener('click', handleSyncGroups);
  document.getElementById('btnInspectorSync')?.addEventListener('click', handleSyncGroups);

  // ĐỒNG BỘ API & SESSION (GIỐNG TOOL APP)
  document.getElementById('btnHubFetchApi')?.addEventListener('click', async () => {
    if (!selectedProfileId) return;
    try {
      appendLog({ time: new Date().toLocaleTimeString('vi-VN'), message: `Trích xuất API session và Cookie Facebook...`, type: 'info' });
      const res = await window.electronAPI.fetchApiSession(selectedProfileId);
      if (res.success && res.isLoggedIn) {
        alert(`✅ Đã đồng bộ thành công!\nUID: ${res.uid}\nTên: ${res.name}`);
        await loadProfiles();
      } else {
        alert('Lỗi trích xuất API: ' + (res.message || res.error || 'Tài khoản chưa đăng nhập Facebook.'));
      }
    } catch (e) {
      alert('Lỗi: ' + e.message);
    }
  });

  // Nút mở modal Đăng nhập nhanh
  document.getElementById('btnHubQuickLogin')?.addEventListener('click', () => {
    if (!selectedProfileId) {
      alert('Vui lòng chọn một tài khoản trước!');
      return;
    }
    openQuickLoginModal(selectedProfileId);
  });

  document.getElementById('btnHubOpenLoginModal')?.addEventListener('click', () => {
    if (!selectedProfileId) return;
    openQuickLoginModal(selectedProfileId);
  });

  // Lưu chi tiết (Proxy, Note)
  document.getElementById('btnHubSaveDetails')?.addEventListener('click', async () => {
    if (!selectedProfileId) return;
    const proxy = document.getElementById('hubDetailProxy').value.trim();
    const note = document.getElementById('hubDetailNote').value.trim();
    await window.electronAPI.updateProfile(selectedProfileId, { proxy, note });
    alert('Đã cập nhật thông tin thành công!');
    await loadProfiles();
  });

  // Xóa tài khoản
  document.getElementById('btnHubDeleteAccount')?.addEventListener('click', async () => {
    if (!selectedProfileId) return;
    if (confirm('Anh có chắc muốn xóa tài khoản này khỏi Hub không?')) {
      await window.electronAPI.deleteProfile(selectedProfileId);
      selectedProfileId = null;
      await loadProfiles();
    }
  });

  // Chuyển nhóm sang tab Chiến Dịch
  document.getElementById('btnSendGroupsToCampaign')?.addEventListener('click', () => {
    const navCampaign = document.getElementById('navCampaign');
    if (navCampaign) navCampaign.click();
  });
}

function updateSidebarStats() {
  const activeCount = currentProfiles.filter(p => p.status === 'open').length;
  const countEl = document.getElementById('activeBrowserCount');
  if (countEl) countEl.textContent = `${activeCount} Đang mở`;
}

// === 6. TAB 2: CHIẾN DỊCH ĐĂNG BÀI (CAMPAIGN RUNNER) ===
function setupCampaignRunner() {
  document.getElementById('btnSelectAllCampaignProfiles')?.addEventListener('click', () => {
    const cbs = document.querySelectorAll('.campaign-profile-cb');
    const allChecked = Array.from(cbs).every(cb => cb.checked);
    cbs.forEach(cb => cb.checked = !allChecked);
    renderCampaignGroupsTable();
  });

  document.getElementById('campaignProfileList')?.addEventListener('change', () => {
    renderCampaignGroupsTable();
  });

  document.getElementById('campaignSelectPost')?.addEventListener('change', (e) => {
    const postId = e.target.value;
    const previewEl = document.getElementById('campaignPostPreview');
    if (!postId) {
      previewEl.textContent = 'Chưa chọn bài viết.';
      return;
    }
    const post = currentPosts.find(p => p.id === postId);
    if (post) {
      previewEl.innerHTML = `
        <div style="font-weight: 600; color: #fff; margin-bottom: 4px;">${escapeHtml(post.title)}</div>
        <div style="margin-bottom: 6px;">${escapeHtml(post.content || '')}</div>
        <div style="color: var(--accent-cyan); font-size: 11px;">${(post.media || []).length} media đính kèm</div>
      `;
    }
  });

  document.getElementById('campaignGroupSearch')?.addEventListener('input', () => {
    renderCampaignGroupsTable();
  });

  document.getElementById('cbCampaignCheckAll')?.addEventListener('change', (e) => {
    document.querySelectorAll('.campaign-group-item-cb').forEach(cb => cb.checked = e.target.checked);
    updateSelectedGroupsBadge();
  });

  document.getElementById('btnCampaignSelectAllGroups')?.addEventListener('click', () => {
    document.querySelectorAll('.campaign-group-item-cb').forEach(cb => cb.checked = true);
    updateSelectedGroupsBadge();
  });

  document.getElementById('btnCampaignClearGroups')?.addEventListener('click', () => {
    document.querySelectorAll('.campaign-group-item-cb').forEach(cb => cb.checked = false);
    updateSelectedGroupsBadge();
  });

  document.getElementById('toggleManualTargets')?.addEventListener('click', () => {
    const el = document.getElementById('campaignManualTargets');
    if (el) el.style.display = el.style.display === 'none' ? 'block' : 'none';
  });

  // START CAMPAIGN
  document.getElementById('btnStartCampaign')?.addEventListener('click', async () => {
    const selectedProfileCheckboxes = document.querySelectorAll('.campaign-profile-cb:checked');
    const profileIds = Array.from(selectedProfileCheckboxes).map(cb => cb.value);

    const postId = document.getElementById('campaignSelectPost').value;

    const selectedGroupCheckboxes = document.querySelectorAll('.campaign-group-item-cb:checked');
    const targets = Array.from(selectedGroupCheckboxes).map(cb => ({
      id: cb.value,
      url: cb.getAttribute('data-url') || cb.value,
      name: cb.getAttribute('data-name') || 'Group',
      avatar: cb.getAttribute('data-avatar') || ''
    }));

    const manualText = document.getElementById('campaignManualTargets').value.trim();
    if (manualText) {
      const manualLines = manualText.split('\n').map(l => l.trim()).filter(l => l.length > 0);
      manualLines.forEach(l => targets.push({ id: l, url: l, name: l }));
    }

    const postToFeed = document.getElementById('campaignPostFeed').checked;
    const minDelay = parseInt(document.getElementById('campaignMinDelay').value) || 15;
    const maxDelay = parseInt(document.getElementById('campaignMaxDelay').value) || 35;
    const headless = document.getElementById('campaignHeadless').checked;

    if (profileIds.length === 0) {
      alert('Vui lòng chọn ít nhất 1 tài khoản Facebook để đăng bài!');
      return;
    }

    if (!postId) {
      alert('Vui lòng chọn bài viết từ kho mẫu!');
      return;
    }

    if (targets.length === 0 && !postToFeed) {
      alert('Vui lòng tick chọn ít nhất 1 nhóm hoặc nhập link nhóm!');
      return;
    }

    const config = {
      profileIds,
      postId,
      targets,
      postToFeed,
      minDelay,
      maxDelay,
      headless
    };

    // Reset trạng thái hiển thị
    document.querySelectorAll('.campaign-group-item-cb').forEach(cb => {
      const cell = document.getElementById(`target-status-${cb.value}`);
      if (cell) cell.innerHTML = `<span class="badge-post-status status-waiting">⚪ Chờ đăng</span>`;
      const row = cell ? cell.closest('tr') : null;
      if (row) row.classList.remove('row-posting-active', 'row-posting-done');
    });

    try {
      await window.electronAPI.startCampaign(config);
    } catch (err) {
      alert('Lỗi bắt đầu chiến dịch: ' + err.message);
    }
  });

  document.getElementById('btnStopCampaign')?.addEventListener('click', async () => {
    if (confirm('Anh có muốn dừng chiến dịch đăng bài không?')) {
      await window.electronAPI.stopCampaign();
    }
  });
}

function renderCampaignProfiles() {
  const container = document.getElementById('campaignProfileList');
  if (!container) return;

  if (currentProfiles.length === 0) {
    container.innerHTML = `<span style="font-size: 11px; color: var(--text-dim); padding: 8px;">Chưa có tài khoản nào.</span>`;
    return;
  }

  container.innerHTML = currentProfiles.map(p => `
    <label class="profile-select-item" style="padding: 6px 8px;">
      <input type="checkbox" class="campaign-profile-cb" value="${p.id}" checked>
      <div style="flex: 1; overflow: hidden;">
        <div style="font-weight: 600; font-size: 12px; color: #fff; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${escapeHtml(p.name)}</div>
        <div style="font-size: 10.5px; color: var(--accent-cyan);">${(p.groups || []).length} nhóm đã quét</div>
      </div>
    </label>
  `).join('');
}

function renderCampaignPostsDropdown() {
  const select = document.getElementById('campaignSelectPost');
  if (!select) return;

  const currentVal = select.value;
  select.innerHTML = `<option value="">-- Chọn bài viết từ kho --</option>` + currentPosts.map(p => `
    <option value="${p.id}">${escapeHtml(p.title)}</option>
  `).join('');

  if (currentVal) select.value = currentVal;
}

function renderCampaignGroupsTable() {
  const tbody = document.getElementById('campaignGroupsTableBody');
  if (!tbody) return;

  const checkedProfiles = Array.from(document.querySelectorAll('.campaign-profile-cb:checked')).map(cb => cb.value);
  const profilesToUse = currentProfiles.filter(p => checkedProfiles.includes(p.id));

  let allGroups = [];
  profilesToUse.forEach(p => {
    (p.groups || []).forEach(g => {
      allGroups.push({ ...g, profileName: p.name });
    });
  });

  const keyword = (document.getElementById('campaignGroupSearch')?.value || '').toLowerCase().trim();
  if (keyword) {
    allGroups = allGroups.filter(g => (g.name || '').toLowerCase().includes(keyword) || (g.id || '').includes(keyword));
  }

  if (allGroups.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="6" style="text-align: center; color: var(--text-dim); padding: 35px 10px;">
          Không có nhóm nào từ tài khoản đã chọn. Hãy vào <b>Browser Hub</b> bấm <b>"⚡ Quét Nhóm Đã Tham Gia"</b> trước nhé!
        </td>
      </tr>
    `;
    updateSelectedGroupsBadge();
    return;
  }

  tbody.innerHTML = allGroups.map(g => {
    const avatar = g.avatar || `https://graph.facebook.com/${g.id}/picture?type=large`;
    const isPrivate = g.privacy === 'Riêng tư';

    return `
      <tr>
        <td>
          <input type="checkbox" class="campaign-group-item-cb" value="${escapeHtml(g.id)}" data-url="${escapeHtml(g.url)}" data-name="${escapeHtml(g.name)}" data-avatar="${escapeHtml(avatar)}" checked onchange="updateSelectedGroupsBadge()">
        </td>
        <td>
          <img src="${avatar}" class="group-table-thumb" onerror="this.src='https://graph.facebook.com/4/picture?type=large';">
        </td>
        <td>
          <div style="font-weight: 600; color: #fff;">${escapeHtml(g.name)}</div>
          <div style="font-size: 10.5px; color: var(--accent-cyan); font-family: monospace;">${escapeHtml(g.id)}</div>
        </td>
        <td>
          <div style="display: flex; flex-direction: column; gap: 2px;">
            <span class="badge-members">👥 ${escapeHtml(g.members || 'Thành viên')}</span>
            <span class="badge-privacy ${isPrivate ? 'private' : 'public'}" style="width: fit-content;">${isPrivate ? '🔒 Riêng tư' : '🌐 Công khai'}</span>
          </div>
        </td>
        <td>
          <span style="font-size: 11.5px; color: #94a3b8; font-weight: 500;">${escapeHtml(g.profileName)}</span>
        </td>
        <td style="text-align: center;" id="target-status-${escapeHtml(g.id)}">
          <span class="badge-post-status status-waiting">⚪ Chờ đăng</span>
        </td>
      </tr>
    `;
  }).join('');

  updateSelectedGroupsBadge();
}

function updateSelectedGroupsBadge() {
  const count = document.querySelectorAll('.campaign-group-item-cb:checked').length;
  const badge = document.getElementById('campaignSelectedGroupsBadge');
  if (badge) badge.textContent = `Đã chọn ${count} nhóm`;
}

// === 7. TAB 3: KHO BÀI VIẾT (CONTENT STUDIO) ===
function setupPostEditor() {
  document.getElementById('btnNewPost')?.addEventListener('click', resetPostEditor);

  document.getElementById('btnInsertSpin')?.addEventListener('click', () => {
    insertTextAtCursor(document.getElementById('postContent'), '{Chào anh em|Hello cả nhà|Chào mọi người}');
  });

  document.getElementById('btnPreviewSpin')?.addEventListener('click', () => {
    const content = document.getElementById('postContent').value;
    if (!content.trim()) {
      alert('Vui lòng nhập nội dung bài viết trước khi test spin!');
      return;
    }
    openSpinModal(content);
  });

  document.getElementById('btnSelectMedia')?.addEventListener('click', async () => {
    const files = await window.electronAPI.selectMediaFiles();
    if (files && files.length > 0) {
      currentMediaFiles = [...currentMediaFiles, ...files];
      renderMediaThumbnails();
    }
  });

  document.getElementById('btnSavePost')?.addEventListener('click', async () => {
    const title = document.getElementById('postTitle').value.trim();
    const content = document.getElementById('postContent').value.trim();
    const postId = document.getElementById('currentPostId').value;

    if (!title && !content) {
      alert('Vui lòng nhập tiêu đề hoặc nội dung bài viết!');
      return;
    }

    const postData = {
      id: postId || null,
      title: title || 'Bài viết chưa đặt tên',
      content: content,
      media: currentMediaFiles
    };

    await window.electronAPI.savePost(postData);
    alert('Đã lưu bài viết thành công!');
    await loadPosts();
  });

  document.getElementById('btnDeletePost')?.addEventListener('click', async () => {
    const postId = document.getElementById('currentPostId').value;
    if (postId && confirm('Anh có chắc muốn xóa bài viết này không?')) {
      await window.electronAPI.deletePost(postId);
      resetPostEditor();
      await loadPosts();
    }
  });
}

async function loadPosts() {
  try {
    currentPosts = await window.electronAPI.getPosts();
    renderPostsList();
  } catch (err) {
    console.error('Lỗi tải bài viết:', err);
  }
}

function renderPostsList() {
  const container = document.getElementById('postsList');
  if (!container) return;

  if (currentPosts.length === 0) {
    container.innerHTML = `<div style="text-align: center; color: var(--text-dim); padding: 20px; font-size: 11.5px;">Chưa có bài viết mẫu nào.</div>`;
    return;
  }

  container.innerHTML = currentPosts.map(p => {
    const isActive = currentSelectedPost && currentSelectedPost.id === p.id;
    return `
      <div class="post-item ${isActive ? 'active' : ''}" onclick="selectPost('${p.id}')">
        <h5>${escapeHtml(p.title)}</h5>
        <p>${escapeHtml(p.content || '(Chỉ có hình ảnh/video)')}</p>
        <span style="font-size: 10px; color: var(--accent-cyan);">${(p.media || []).length} media</span>
      </div>
    `;
  }).join('');
}

window.selectPost = function(postId) {
  const post = currentPosts.find(p => p.id === postId);
  if (!post) return;

  currentSelectedPost = post;
  document.getElementById('currentPostId').value = post.id;
  document.getElementById('postTitle').value = post.title || '';
  document.getElementById('postContent').value = post.content || '';
  currentMediaFiles = post.media || [];
  renderMediaThumbnails();

  const deleteBtn = document.getElementById('btnDeletePost');
  if (deleteBtn) deleteBtn.style.display = 'inline-flex';
  renderPostsList();
};

function resetPostEditor() {
  currentSelectedPost = null;
  document.getElementById('currentPostId').value = '';
  document.getElementById('postTitle').value = '';
  document.getElementById('postContent').value = '';
  currentMediaFiles = [];
  renderMediaThumbnails();

  const deleteBtn = document.getElementById('btnDeletePost');
  if (deleteBtn) deleteBtn.style.display = 'none';
  renderPostsList();
}

function renderMediaThumbnails() {
  const container = document.getElementById('mediaContainer');
  if (!container) return;

  if (currentMediaFiles.length === 0) {
    container.innerHTML = `<span style="font-size: 11px; color: var(--text-dim);">Chưa có ảnh/video nào được chọn.</span>`;
    return;
  }

  container.innerHTML = currentMediaFiles.map((file, idx) => {
    const isVideo = file.toLowerCase().endsWith('.mp4') || file.toLowerCase().endsWith('.mov');
    let displaySrc = file;
    // Nếu là file upload trên server
    if (file.includes('uploads') || file.startsWith('/uploads')) {
      const parts = file.split(/[\\/]/);
      const filename = parts[parts.length - 1];
      displaySrc = `/uploads/${filename}`;
    }

    return `
      <div class="media-thumbnail-card" title="${escapeHtml(file)}">
        ${isVideo 
          ? `<div style="display: flex; align-items: center; justify-content: center; height: 100%; color: #fff; font-size: 20px;">🎬</div>`
          : `<img src="${displaySrc}" alt="Thumbnail" onerror="this.src=''; this.alt='Media';">`
        }
        <button class="media-remove-btn" onclick="removeMediaFile(${idx})">&times;</button>
      </div>
    `;
  }).join('');
}

window.removeMediaFile = function(index) {
  currentMediaFiles.splice(index, 1);
  renderMediaThumbnails();
};

// === 8. TAB 4: NHẬT KÝ & LỊCH SỬ TƯƠNG TÁC (LIKE, COMMENT) ===
function appendLog(logData) {
  const terminal = document.getElementById('terminalBody');
  if (!terminal) return;

  const line = document.createElement('div');
  line.className = 'log-line';
  const typeClass = `log-${logData.type || 'info'}`;
  line.innerHTML = `<span class="log-time">[${logData.time || new Date().toLocaleTimeString('vi-VN')}]</span> <span class="${typeClass}">${escapeHtml(logData.message)}</span>`;

  terminal.appendChild(line);
  terminal.scrollTop = terminal.scrollHeight;
}

function getHistoryGroupAvatar(item) {
  if (item.targetAvatar) return item.targetAvatar;
  for (const p of currentProfiles) {
    if (p.groups && p.groups.length > 0) {
      const match = p.groups.find(g => 
        (item.targetUrl && g.url && g.url === item.targetUrl) ||
        (item.targetName && g.name && g.name === item.targetName) ||
        (item.targetUrl && g.id && item.targetUrl.includes(g.id))
      );
      if (match && match.avatar) return match.avatar;
    }
  }
  const matchId = (item.targetUrl || '').match(/groups\/(\d+)/);
  if (matchId) {
    return `https://graph.facebook.com/${matchId[1]}/picture?type=large`;
  }
  return '';
}

window.handleCopyPostLink = function(url, btn) {
  if (!url) {
    alert('Không tìm thấy liên kết bài viết!');
    return;
  }
  const setCopied = () => {
    if (btn) {
      const origText = btn.innerHTML;
      btn.innerHTML = '✓ Đã copy';
      btn.style.color = '#10b981';
      btn.style.borderColor = '#10b981';
      setTimeout(() => {
        btn.innerHTML = origText;
        btn.style.color = '';
        btn.style.borderColor = '';
      }, 2000);
    }
  };

  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(url).then(setCopied).catch(() => setCopied());
  } else {
    setCopied();
  }
};

async function loadHistory() {
  try {
    currentHistory = await window.electronAPI.getHistory();
    const tbody = document.getElementById('historyTableBody');
    if (!tbody) return;

    if (currentHistory.length === 0) {
      tbody.innerHTML = `<tr><td colspan="9" style="text-align: center; color: var(--text-dim); padding: 30px;">Chưa có lịch sử đăng bài nào.</td></tr>`;
      return;
    }

    tbody.innerHTML = currentHistory.map(item => {
      let badgeClass = 'status-pill logged-in';
      let badgeText = 'Thành công';

      if (item.status === 'pending_approval') {
        badgeClass = 'status-pill';
        badgeText = 'Chờ duyệt';
      } else if (item.status === 'error') {
        badgeClass = 'status-pill not-logged';
        badgeText = 'Lỗi';
      }

      const likes = item.likesCount !== undefined ? item.likesCount : 0;
      const comments = item.commentsCount !== undefined ? item.commentsCount : 0;
      const cmtStatus = item.cmtStatus || 'Đã đăng';
      const groupAvatar = getHistoryGroupAvatar(item);

      return `
        <tr>
          <td><span style="color: var(--text-dim); font-size: 11.5px;">${escapeHtml(item.time)}</span></td>
          <td><b>${escapeHtml(item.profileName)}</b></td>
          <td>
            <div style="display: flex; align-items: center; gap: 8px;">
              ${groupAvatar ? `
                <img src="${escapeHtml(groupAvatar)}" alt="" onerror="this.src='https://graph.facebook.com/4/picture?type=large';" style="width: 26px; height: 26px; border-radius: 6px; object-fit: cover; border: 1px solid rgba(255,255,255,0.14); flex-shrink: 0;">
              ` : `
                <div style="width: 26px; height: 26px; border-radius: 6px; background: rgba(6,182,212,0.15); border: 1px solid rgba(6,182,212,0.3); display: flex; align-items: center; justify-content: center; font-size: 12px; flex-shrink: 0;">👥</div>
              `}
              <span style="color: var(--accent-cyan); font-weight: 500; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 170px;" title="${escapeHtml(item.targetName)}">
                ${escapeHtml(item.targetName)}
              </span>
            </div>
          </td>
          <td style="max-width: 180px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;" title="${escapeHtml(item.postContent || '')}">
            ${escapeHtml(item.postTitle || item.postContent || '-')}
          </td>
          <td><span class="${badgeClass}">${badgeText}</span></td>
          <td style="text-align: center; font-weight: 700; color: #38bdf8;">👍 ${likes}</td>
          <td style="text-align: center; font-weight: 700; color: #34d399;">💬 ${comments}</td>
          <td><span style="font-size: 11px; color: var(--text-muted);">${escapeHtml(cmtStatus)}</span></td>
          <td style="text-align: center;">
            <div style="display: flex; gap: 4px; justify-content: center; align-items: center; flex-wrap: wrap;">
              ${item.postUrl ? `<button class="btn btn-secondary btn-sm" onclick="handleRefreshEngagement('${item.id}')" title="Cập nhật like & cmt">🔄 Quét</button>` : ''}
              ${item.postUrl ? `<button class="btn btn-secondary btn-sm" onclick="handleCopyPostLink('${escapeHtml(item.postUrl)}', this)" title="Sao chép liên kết bài đăng">📋 Copy Link</button>` : ''}
              ${item.postUrl ? `<a href="${escapeHtml(item.postUrl)}" target="_blank" class="btn btn-secondary btn-sm" style="text-decoration: none;" title="Mở bài viết">Xem Link</a>` : '-'}
            </div>
          </td>
        </tr>
      `;
    }).join('');
  } catch (err) {
    console.error('Lỗi tải lịch sử:', err);
  }
}

window.handleRefreshEngagement = async function(historyId) {
  try {
    appendLog({ time: new Date().toLocaleTimeString('vi-VN'), message: `Đang quét cập nhật lượt like/comment...`, type: 'info' });
    const res = await window.electronAPI.refreshPostEngagement(historyId);
    if (res.success) {
      alert(`🎉 Cập nhật thành công! ${res.stats.likes} Likes | ${res.stats.comments} Comments`);
      await loadHistory();
    } else {
      alert('Không thể cập nhật tương tác: ' + res.message);
    }
  } catch (e) {
    alert('Lỗi: ' + e.message);
  }
};

// === 9. TAB 5: CÀI ĐẶT ===
async function loadSettings() {
  try {
    const settings = await window.electronAPI.getSettings();
    if (!settings) return;
    document.getElementById('settingChromePath').value = settings.chromePath || '';
    document.getElementById('settingMinDelay').value = settings.minDelay || 15;
    document.getElementById('settingMaxDelay').value = settings.maxDelay || 35;
  } catch (err) {
    console.error('Lỗi tải cài đặt:', err);
  }
}

function setupSettings() {
  document.getElementById('btnSaveSettings')?.addEventListener('click', async () => {
    const chromePath = document.getElementById('settingChromePath').value.trim();
    const minDelay = parseInt(document.getElementById('settingMinDelay').value) || 15;
    const maxDelay = parseInt(document.getElementById('settingMaxDelay').value) || 35;

    await window.electronAPI.updateSettings({ chromePath, minDelay, maxDelay });
    alert('Đã lưu cấu hình thành công!');
  });

  document.getElementById('btnClearTerminal')?.addEventListener('click', () => {
    const terminal = document.getElementById('terminalBody');
    if (terminal) terminal.innerHTML = '';
  });

  document.getElementById('btnClearHistory')?.addEventListener('click', async () => {
    if (confirm('Anh có chắc muốn xóa toàn bộ lịch sử đăng bài không?')) {
      await window.electronAPI.clearHistory();
      await loadHistory();
    }
  });

  document.getElementById('btnRefreshAllEngagement')?.addEventListener('click', async () => {
    if (currentHistory.length === 0) return;
    appendLog({ time: new Date().toLocaleTimeString('vi-VN'), message: `Bắt đầu quét cập nhật tương tác toàn bộ bài viết...`, type: 'info' });
    try {
      const res = await window.electronAPI.refreshAllEngagement();
      await loadHistory();
      alert(`Đã cập nhật xong tương tác cho ${res.count || 0}/${res.total || 0} bài viết!`);
    } catch (e) {
      alert('Lỗi: ' + e.message);
    }
  });
}

// === 10. MODALS & QUICK LOGIN ===
let activeQuickLoginProfileId = null;

function setupModals() {
  // Modal Add Profile
  const modalAdd = document.getElementById('modalAddProfile');
  window.openAddProfileModal = () => {
    document.getElementById('inputProfileName').value = `Nick Facebook ${currentProfiles.length + 1}`;
    document.getElementById('inputProfileProxy').value = '';
    document.getElementById('inputProfileNote').value = '';
    modalAdd?.classList.add('active');
  };

  document.getElementById('btnCloseAddProfileModal')?.addEventListener('click', () => modalAdd?.classList.remove('active'));
  document.getElementById('btnCancelAddProfile')?.addEventListener('click', () => modalAdd?.classList.remove('active'));

  document.getElementById('btnSubmitAddProfile')?.addEventListener('click', async () => {
    const name = document.getElementById('inputProfileName').value.trim();
    const proxy = document.getElementById('inputProfileProxy').value.trim();
    const note = document.getElementById('inputProfileNote').value.trim();

    if (!name) {
      alert('Vui lòng nhập tên tài khoản!');
      return;
    }

    const created = await window.electronAPI.addProfile({ name, proxy, note });
    selectedProfileId = created.id;
    modalAdd?.classList.remove('active');
    await loadProfiles();
  });

  // Modal Quick Login (Đăng nhập nhanh cho Cloud / Điện thoại)
  const modalQuick = document.getElementById('modalQuickLogin');
  window.openQuickLoginModal = (profileId) => {
    activeQuickLoginProfileId = profileId;
    document.getElementById('quickLoginProfileId').value = profileId;
    const p = currentProfiles.find(item => item.id === profileId);
    document.getElementById('modalQuickLoginTitle').textContent = `🚀 Đăng Nhập Cho [${p ? p.name : 'Facebook'}]`;
    document.getElementById('inputQuickUsername').value = '';
    document.getElementById('inputQuickPassword').value = '';
    document.getElementById('inputQuick2FA').value = '';
    document.getElementById('inputQuickCookie').value = '';
    document.getElementById('quickLoginStepCreds').style.display = 'block';
    document.getElementById('quickLoginStep2FA').style.display = 'none';
    document.getElementById('quickCookieBox').style.display = 'none';
    modalQuick?.classList.add('active');
  };

  document.getElementById('btnCloseQuickLoginModal')?.addEventListener('click', () => modalQuick?.classList.remove('active'));
  document.getElementById('btnCancelQuickLogin')?.addEventListener('click', () => modalQuick?.classList.remove('active'));
  document.getElementById('btnBackQuickCreds')?.addEventListener('click', () => {
    document.getElementById('quickLoginStepCreds').style.display = 'block';
    document.getElementById('quickLoginStep2FA').style.display = 'none';
  });

  document.getElementById('toggleQuickCookie')?.addEventListener('click', () => {
    const box = document.getElementById('quickCookieBox');
    if (box) box.style.display = box.style.display === 'none' ? 'block' : 'none';
  });

  // Submit Login Email/Pass
  document.getElementById('btnSubmitQuickLogin')?.addEventListener('click', async () => {
    const username = document.getElementById('inputQuickUsername').value.trim();
    const password = document.getElementById('inputQuickPassword').value.trim();

    if (!username || !password) {
      alert('Vui lòng nhập Email / SĐT và Mật khẩu Facebook!');
      return;
    }

    const btn = document.getElementById('btnSubmitQuickLogin');
    btn.disabled = true;
    btn.textContent = '⏳ Đang đăng nhập...';

    try {
      appendLog({ time: new Date().toLocaleTimeString('vi-VN'), message: `Đang khởi chạy Chrome đăng nhập tự động cho [${username}]...`, type: 'info' });
      const res = await window.electronAPI.loginWithCredentials(activeQuickLoginProfileId, username, password);

      if (res.requires2FA) {
        appendLog({ time: new Date().toLocaleTimeString('vi-VN'), message: `⚠️ Facebook yêu cầu mã 2FA. Đang đợi nhập mã xác thực...`, type: 'warning' });
        document.getElementById('quickLoginStepCreds').style.display = 'none';
        document.getElementById('quickLoginStep2FA').style.display = 'block';
        document.getElementById('inputQuick2FA').focus();
      } else if (res.isLoggedIn || res.success) {
        alert(`🎉 ĐĂNG NHẬP THÀNH CÔNG!\nChào mừng ${res.name || 'Facebook'} (UID: ${res.uid || ''})`);
        modalQuick?.classList.remove('active');
        await loadProfiles();
      } else {
        alert('❌ ' + (res.error || res.message || 'Đăng nhập không thành công.'));
      }
    } catch (err) {
      alert('Lỗi: ' + err.message);
    } finally {
      btn.disabled = false;
      btn.textContent = '🚀 Đăng Nhập & Đồng Bộ API';
    }
  });

  // Submit 2FA Code
  document.getElementById('btnSubmitQuick2FA')?.addEventListener('click', async () => {
    const code = document.getElementById('inputQuick2FA').value.trim();
    if (!code) {
      alert('Vui lòng nhập mã 6 số từ ứng dụng xác thực / SMS!');
      return;
    }

    const btn = document.getElementById('btnSubmitQuick2FA');
    btn.disabled = true;
    btn.textContent = '⏳ Đang xác thực...';

    try {
      appendLog({ time: new Date().toLocaleTimeString('vi-VN'), message: `Đang gửi mã xác thực 2FA [${code}] lên Facebook...`, type: 'info' });
      const res = await window.electronAPI.loginWithCredentials(activeQuickLoginProfileId, '', '', code);

      if (res.isLoggedIn || res.success) {
        alert(`🎉 XÁC THỰC 2FA THÀNH CÔNG!\nChào mừng ${res.name || 'Facebook'} (UID: ${res.uid || ''})`);
        modalQuick?.classList.remove('active');
        await loadProfiles();
      } else {
        alert('❌ ' + (res.message || res.error || 'Mã 2FA chưa đúng. Vui lòng thử lại!'));
      }
    } catch (err) {
      alert('Lỗi: ' + err.message);
    } finally {
      btn.disabled = false;
      btn.textContent = '✓ Xác Nhận Mã 2FA';
    }
  });

  // Submit Cookie
  document.getElementById('btnSubmitQuickCookie')?.addEventListener('click', async () => {
    const cookie = document.getElementById('inputQuickCookie').value.trim();
    if (!cookie) {
      alert('Vui lòng dán chuỗi cookie Facebook!');
      return;
    }

    try {
      appendLog({ time: new Date().toLocaleTimeString('vi-VN'), message: `Đang nạp cookie và kiểm tra session...`, type: 'info' });
      const res = await window.electronAPI.importCookieSession(activeQuickLoginProfileId, cookie);
      if (res.isLoggedIn) {
        alert(`✅ Nạp cookie thành công cho [${res.name || 'Facebook'}]! (UID: ${res.uid || ''})`);
        modalQuick?.classList.remove('active');
        await loadProfiles();
      } else {
        alert('⚠️ ' + (res.message || res.error || 'Cookie không hợp lệ hoặc đã hết hạn.'));
      }
    } catch (err) {
      alert('Lỗi nạp cookie: ' + err.message);
    }
  });

  // Modal Spin Preview
  const modalSpin = document.getElementById('modalSpinPreview');
  let spinOriginalText = '';

  window.openSpinModal = (text) => {
    spinOriginalText = text;
    generateSpinResult();
    modalSpin?.classList.add('active');
  };

  function generateSpinResult() {
    const result = processClientSpin(spinOriginalText);
    const box = document.getElementById('spinPreviewResult');
    if (box) box.textContent = result;
  }

  document.getElementById('btnSpinAgain')?.addEventListener('click', generateSpinResult);
  document.getElementById('btnCloseSpinModal')?.addEventListener('click', () => modalSpin?.classList.remove('active'));
  document.getElementById('btnAcceptSpin')?.addEventListener('click', () => modalSpin?.classList.remove('active'));
}

function processClientSpin(text) {
  if (!text) return '';
  const regex = /\{([^{}]+)\}/g;
  let result = text;
  let match;
  while ((match = regex.exec(result)) !== null) {
    const options = match[1].split('|');
    const chosen = options[Math.floor(Math.random() * options.length)];
    result = result.replace(match[0], chosen);
    regex.lastIndex = 0;
  }
  return result;
}

function insertTextAtCursor(textarea, text) {
  const start = textarea.selectionStart;
  const end = textarea.selectionEnd;
  const before = textarea.value.substring(0, start);
  const after = textarea.value.substring(end, textarea.value.length);
  textarea.value = before + text + after;
  textarea.selectionStart = textarea.selectionEnd = start + text.length;
  textarea.focus();
}

function escapeHtml(str) {
  if (!str) return '';
  return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#039;');
}

// === 11. EVENT LISTENERS FROM SSE (SERVER-SENT EVENTS) ===
function setupEventListeners() {
  window.electronAPI.onLog((data) => {
    appendLog(data);
  });

  window.electronAPI.onCampaignStatus((data) => {
    isCampaignRunning = data.isRunning;
    const startBtn = document.getElementById('btnStartCampaign');
    const stopBtn = document.getElementById('btnStopCampaign');
    const progressSection = document.getElementById('campaignProgressSection');
    const dot = document.getElementById('systemStatusDot');
    const text = document.getElementById('systemStatusText');

    if (data.isRunning) {
      if (startBtn) startBtn.style.display = 'none';
      if (stopBtn) stopBtn.style.display = 'inline-flex';
      if (progressSection) progressSection.style.display = 'block';
      if (dot) dot.className = 'status-dot busy';
      if (text) text.textContent = 'Đang chạy';
    } else {
      if (startBtn) startBtn.style.display = 'inline-flex';
      if (stopBtn) stopBtn.style.display = 'none';
      if (dot) dot.className = 'status-dot';
      if (text) text.textContent = 'Sẵn sàng';
      loadHistory();
    }
  });

  window.electronAPI.onCampaignProgress((data) => {
    const percent = data.total > 0 ? Math.round((data.completed / data.total) * 100) : 0;
    const bar = document.getElementById('campaignProgressBar');
    const text = document.getElementById('campaignProgressText');
    const percentEl = document.getElementById('campaignProgressPercent');

    if (bar) bar.style.width = `${percent}%`;
    if (text) text.textContent = `Đã xong ${data.completed}/${data.total} (Thành công: ${data.success || 0}, Lỗi: ${data.error || 0})`;
    if (percentEl) percentEl.textContent = `${percent}%`;
  });

  window.electronAPI.onProfileStatus(() => {
    loadProfiles();
  });

  // Cập nhật trạng thái từng dòng nhóm theo thời gian thực
  window.electronAPI.onCampaignItemUpdate((data) => {
    const statusCell = document.getElementById(`target-status-${data.targetId}`);
    if (statusCell) {
      const row = statusCell.closest('tr');
      if (data.status === 'posting') {
        statusCell.innerHTML = `<span class="badge-post-status status-posting"><span class="spinner-inline"></span> Đang đăng...</span>`;
        if (row) {
          row.classList.add('row-posting-active');
          row.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        }
      } else if (data.status === 'success') {
        statusCell.innerHTML = `<span class="badge-post-status status-success">✅ Đã đăng</span>`;
        if (row) {
          row.classList.remove('row-posting-active');
          row.classList.add('row-posting-done');
        }
      } else if (data.status === 'pending_approval') {
        statusCell.innerHTML = `<span class="badge-post-status status-pending">🟠 Chờ duyệt</span>`;
        if (row) {
          row.classList.remove('row-posting-active');
          row.classList.add('row-posting-done');
        }
      } else if (data.status === 'error') {
        statusCell.innerHTML = `<span class="badge-post-status status-error" title="${escapeHtml(data.message || '')}">❌ Lỗi</span>`;
        if (row) {
          row.classList.remove('row-posting-active');
        }
      }
    }
  });

  // Thông báo hoàn tất chiến dịch
  window.electronAPI.onCampaignCompleted((data) => {
    showCampaignCompletedToast(data);
  });
}

function showCampaignCompletedToast(data) {
  const existing = document.querySelector('.campaign-toast-notification');
  if (existing) existing.remove();

  const toast = document.createElement('div');
  toast.className = 'campaign-toast-notification';
  toast.innerHTML = `
    <div style="font-size: 28px; line-height: 1;">🎉</div>
    <div style="flex: 1;">
      <div style="font-weight: 700; font-size: 13.5px; color: #fff; margin-bottom: 2px;">HOÀN TẤT CHIẾN DỊCH!</div>
      <div style="font-size: 12px; color: #cbd5e1; line-height: 1.4;">
        Đã xử lý xong <b style="color: #38bdf8;">${data.completed}/${data.total}</b> mục tiêu hoàn toàn ngầm.<br>
        <span style="color: #34d399; font-weight: 600;">✅ Thành công: ${data.success || 0}</span> | <span style="color: #f87171; font-weight: 600;">❌ Thất bại: ${data.error || 0}</span>
      </div>
    </div>
    <button class="btn btn-secondary btn-sm" onclick="this.parentElement.remove()" style="padding: 4px 10px; font-size: 11px;">Đóng</button>
  `;
  document.body.appendChild(toast);
  setTimeout(() => {
    if (toast.parentElement) toast.remove();
  }, 12000);
}
