@echo off
chcp 65001 >nul
title Cloudflare Tunnel - Link Dien Thoai
echo ========================================================
echo   ⚡ CLOUDFLARE TUNNEL - TAO LINK CHO DIEN THOAI
echo ========================================================
echo.
echo * Hay chac chan ban da bat Chay_Tool.bat hoac Chay_Web_Server.bat truoc!
echo.
echo Dang khoi tao duong link Cloudflare HTTPS mien phi...
echo.
if exist "cloudflared.exe" (
    cloudflared.exe tunnel --url http://localhost:3000
) else (
    echo Khong tim thay cloudflared.exe, dang chay qua npx...
    npx --yes localtunnel --port 3000
)
pause
