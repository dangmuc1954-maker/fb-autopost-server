@echo off
chcp 65001 >nul
title Đóng Gói FB AutoPost Master Ra File .EXE
cd /d "%~dp0"
echo ========================================================
echo   📦 ĐANG ĐÓNG GÓI TOOL THÀNH FILE CÀI ĐẶT .EXE (WINDOWS)
echo ========================================================
echo.
npm run build:win
echo.
echo ========================================================
echo   ✅ HOÀN TẤT! File .exe đã được xuất ra trong thư mục: dist\
echo ========================================================
pause
