# Sử dụng base image chính thức của Microsoft Playwright đã có sẵn Ubuntu, Node.js và các thư viện cần thiết
FROM mcr.microsoft.com/playwright:v1.41.0-jammy

# Thiết lập thư mục làm việc
WORKDIR /app

# Copy package.json và cài đặt dependencies
COPY package*.json ./
RUN npm install --production

# Cài đặt Chromium cho Playwright
RUN npx playwright install chromium

# Copy toàn bộ mã nguồn
COPY . .

# Đảm bảo các thư mục lưu trữ dữ liệu tồn tại
RUN mkdir -p data/uploads data/browser_profiles

# Khai báo cổng
ENV PORT=3000
EXPOSE 3000

# Khởi chạy máy chủ Web Server
CMD ["node", "server/server.js"]
