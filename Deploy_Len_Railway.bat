@echo off
chcp 65001 >nul
title Deploy Tool Len Railway.app (Chay 24/7)
echo ===================================================================
echo   🚀 HUONG DAN DEPLOY TOOL FB AUTOPOST LEN CLOUD RAILWAY.APP
echo ===================================================================
echo.
echo [1/3] Đang kiểm tra đăng nhập tài khoản Railway...
echo (Trình duyệt sẽ mở trang Railway, bạn chỉ cần bấm đăng nhập bằng Google hoặc GitHub)
echo.
call railway login
if %errorlevel% neq 0 (
    echo.
    echo ❌ Đăng nhập chưa thành công hoặc bạn đã hủy. Vui lòng thử lại!
    pause
    exit /b
)

echo.
echo ===================================================================
echo [2/3] Đang khởi tạo dự án trên Railway...
echo ===================================================================
call railway init

echo.
echo ===================================================================
echo [3/3] Đang tải mã nguồn và build Docker trên máy chủ Railway...
echo (Quá trình này mất khoảng 2-3 phút, bạn vui lòng đợi nhé)
echo ===================================================================
call railway up --detach

echo.
echo ===================================================================
echo 🌐 Đang tạo tên miền công khai (Domain) để mở trên điện thoại...
echo ===================================================================
call railway domain

echo.
echo ===================================================================
echo 🎉 CHÚC MỪNG BẠN! TOOL ĐÃ ĐƯỢC ĐƯA LÊN CLOUD RAILWAY THÀNH CÔNG!
echo Bây giờ bạn có thể TẮT MÁY TÍNH, web vẫn chạy 24/7 trên điện thoại.
echo ===================================================================
echo.
pause
