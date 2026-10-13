@echo off
chcp 65001 >nul
title FB AutoPost - Web Server (Cho Dien Thoai)
echo ========================================================
echo   🚀 DANG KHOI CHAY FB AUTOPOST WEB SERVER
echo ========================================================
echo.
echo - Dang khoi dong Web Server tren cong 3000...
echo - Ban co the mo tren dien thoai bang dia chi IP mang Wifi
echo - Hoac dung file Mo_Link_Cho_Ban_O_Xa.bat de gui cho ban o xa
echo.
node server/server.js
pause
