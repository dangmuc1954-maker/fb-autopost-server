@echo off
chcp 65001 >nul
title Tat Web Server FB AutoPost
echo ========================================================
echo   🛑 DANG TAT CAC TIEN TRINH WEB SERVER & CLOUDFLARE...
echo ========================================================
echo.
taskkill /F /IM cloudflared.exe >nul 2>&1
for /f "tokens=5" %%a in ('netstat -aon ^| find ":3000" ^| find "LISTENING"') do (
    taskkill /F /PID %%a >nul 2>&1
)
echo.
echo ✅ Da tat thanh cong toan bo Web Server va Cloudflare!
echo.
pause
