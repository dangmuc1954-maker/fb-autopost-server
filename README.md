# FB AutoPost Master ⚡ (Desktop App .EXE & Web Mobile Hub)

Phần mềm máy tính quản lý và đăng bài tự động hàng loạt lên **bất kỳ Hội nhóm (Group Facebook)**, **Trang cá nhân (Feed)** và **Fanpage**.
Hỗ trợ cả 2 chế độ: **Giao diện Desktop (cho máy tính)** và **Giao diện Web Mobile (cho bạn bè điều khiển qua điện thoại)**.

---

## 🌟 Tính Năng Nổi Bật

1. **Browser Hub (Quản Lý Tài Khoản Độc Lập):**
   - Mỗi tài khoản Facebook chạy trên 1 phiên trình duyệt Chrome cô lập (riêng Cookie, Cache, Proxy).
   - Đăng nhập Facebook trực tiếp bằng cửa sổ Chrome (hỗ trợ 2FA, giải checkpoint bằng tay).
   - **Phiên đăng nhập được lưu vĩnh viễn:** Chỉ cần đăng nhập 1 lần duy nhất, lần sau mở tool lên là sẵn sàng đăng bài.

2. **Giao Diện Web Mobile Hub (Dùng Được Trên Mọi Điện Thoại):**
   - Tối ưu cho màn hình iPhone / Android, vuốt chạm mượt mà.
   - Cho phép chọn ảnh/video trực tiếp từ thư viện ảnh điện thoại để tải lên đăng bài.
   - Cập nhật tiến trình đăng bài và nhật ký Terminal realtime qua Server-Sent Events.

3. **Đăng Bài Vào Bất Kỳ Group Nào (Không Cần Quyền Quản Trị Viên):**
   - Hỗ trợ đăng bài lên các nhóm công khai, nhóm đã tham gia mà bạn là thành viên.
   - Nhập danh sách Group ID hoặc link Group (mỗi dòng 1 nhóm).

4. **Soạn Bài & Spin Syntax Chống Quét Trùng Lặp:**
   - Trộn từ đồng nghĩa `{Chào cả nhà|Hello anh em|Chào mọi người}` để mỗi lần đăng Facebook nhận diện là một bài viết duy nhất.
   - Nút **"Test bản Spin"** xem trước các biến thể ngẫu nhiên.
   - Đính kèm hình ảnh và video từ máy tính hoặc điện thoại.

5. **Cơ Chế Chống Spam Facebook:**
   - Giãn cách ngẫu nhiên an toàn giữa các bài viết (ví dụ: nghỉ 15 - 35 giây).
   - Tùy chọn chạy ngầm (Headless) hoặc hiện cửa sổ Chrome để theo dõi bot thao tác.

---

## 🚀 Cách Sử Dụng Ngay

### 1. Dành cho anh dùng trên máy tính (Desktop App):
- Bấm đúp chuột vào file: `Chay_Tool.bat`  
*(Hoặc gõ lệnh `npm start` trong terminal)*  
Khi mở tool trên máy tính, hệ thống sẽ tự động bật luôn Web Server và hiển thị link kết nối ở thanh tiêu đề trên cùng.

### 2. Dành cho bạn của anh dùng trên điện thoại (Mobile Web):
- **Nếu ở cùng mạng Wifi:** Bấm vào nút `📱 Web Điện Thoại` trên thanh tiêu đề của app máy tính để copy link IP (VD: `http://192.168.1.15:3000`) gửi cho bạn mở trên Safari / Chrome điện thoại.
- **Nếu bạn ở xa (dùng 4G hoặc khác mạng Wifi):** Bấm đúp chuột vào file: `Mo_Link_Cho_Ban_O_Xa.bat`. Màn hình sẽ cấp một đường link HTTPS (VD: `https://xxxx.loca.lt`), copy gửi cho bạn là mở được ở bất kỳ đâu!
- **Nếu chỉ muốn chạy Web Server ngầm:** Bấm đúp chuột vào file `Chay_Web_Server.bat`.

### 3. Đóng gói ra file cài đặt `.exe`:
- Bấm đúp chuột vào file: `Dong_Goi_EXE.bat`  
*(Hoặc gõ lệnh `npm run build:win`)*  
File `.exe` sẽ được tạo ra trong thư mục `dist/`.

---

## 📁 Cấu Trúc Dự Án
```
tool quản lý đăng bài fb/
├── main/
│   ├── main.js             # Electron Main Process & điều phối IPC
│   ├── browserHub.js       # Quản lý trình duyệt Chrome & phiên đăng nhập
│   ├── automationEngine.js # Bộ máy đăng bài vào Group/Feed & Spin syntax
│   ├── db.js               # Database JSON nội bộ
│   └── preload.js          # Cầu nối bảo mật giữa UI và Electron
├── renderer/
│   ├── index.html          # Giao diện người dùng Desktop
│   ├── css/style.css       # Hệ thống Design Dark Cyber & Glassmorphism
│   └── js/app.js           # Client logic & điều khiển giao diện Desktop
├── server/
│   └── server.js           # Web Server Express + REST API + SSE
├── web/
│   ├── index.html          # Giao diện Web tối ưu riêng cho điện thoại
│   ├── css/style.css       # CSS Mobile-First Cyber Dark
│   └── js/app.js           # Client logic Web Mobile
├── data/
│   ├── database.json       # Nơi lưu trữ tài khoản, bài viết, lịch sử
│   └── uploads/            # Nơi lưu hình ảnh/video upload từ điện thoại
├── browser_profiles/       # Nơi lưu cache, cookie của từng tài khoản FB
├── package.json
├── Chay_Tool.bat           # Mở bản Desktop App (.EXE) + Tự bật Web Server
├── Chay_Web_Server.bat     # Chỉ bật Web Server ngầm (cho điện thoại)
├── Mo_Link_Cho_Ban_O_Xa.bat# Tạo link HTTPS từ xa cho bạn bè dùng qua 4G
└── Dong_Goi_EXE.bat        # Đóng gói cài đặt Desktop Windows
```
