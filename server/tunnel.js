const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

let tunnelProcess = null;
let currentTunnelUrl = null;

function startCloudflareTunnel(port = 3000, onUrlFound = null) {
  if (currentTunnelUrl && tunnelProcess) {
    if (onUrlFound) onUrlFound(currentTunnelUrl);
    return currentTunnelUrl;
  }

  const cloudflaredPath = path.join(__dirname, '..', 'cloudflared.exe');
  if (!fs.existsSync(cloudflaredPath)) {
    console.warn('[Tunnel] Không tìm thấy file cloudflared.exe');
    return null;
  }

  console.log(`[Cloudflare Tunnel] Đang khởi tạo đường link HTTPS bảo mật cho cổng ${port}...`);

  tunnelProcess = spawn(cloudflaredPath, ['tunnel', '--url', `http://localhost:${port}`]);

  tunnelProcess.stderr.on('data', (data) => {
    const output = data.toString();
    const match = output.match(/https:\/\/[a-zA-Z0-9-]+\.trycloudflare\.com/);
    if (match && !currentTunnelUrl) {
      currentTunnelUrl = match[0];
      console.log(`\n======================================================`);
      console.log(`🎉 [CLOUDFLARE TUNNEL SẴN SÀNG]`);
      console.log(`📱 Link mở trên điện thoại ở bất kỳ đâu (4G/Wifi):`);
      console.log(`👉 ${currentTunnelUrl}`);
      console.log(`======================================================\n`);
      if (onUrlFound) {
        onUrlFound(currentTunnelUrl);
      }
    }
  });

  tunnelProcess.on('close', () => {
    currentTunnelUrl = null;
    tunnelProcess = null;
  });

  return tunnelProcess;
}

function stopCloudflareTunnel() {
  if (tunnelProcess) {
    try {
      tunnelProcess.kill();
    } catch (e) {}
    tunnelProcess = null;
    currentTunnelUrl = null;
  }
}

function getTunnelUrl() {
  return currentTunnelUrl;
}

module.exports = {
  startCloudflareTunnel,
  stopCloudflareTunnel,
  getTunnelUrl
};
