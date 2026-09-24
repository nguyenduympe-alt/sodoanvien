#!/usr/bin/env bash
# =====================================================================
# CÀI ĐẶT TRÊN VPS (Ubuntu 20.04+/Debian 11+, chạy với sudo/root)
#   sudo bash deploy/deploy.sh            # chỉ chạy ứng dụng (port 3000)
#   sudo bash deploy/deploy.sh --nginx    # kèm cài Nginx reverse proxy port 80
#
# Kịch bản tối ưu cho VPS 1GB RAM / 10GB SSD:
#   • Tạo swap 2GB nếu RAM < 2GB (chống OOM khi npm install / hoạt động tải cao)
#   • Cài Node.js 20 nếu chưa có (chấp nhận cả node >= 18)
#   • Chạy bằng systemd (không dùng pm2 để tiết kiệm RAM), user riêng không đăng nhập
#   • Giới hạn bộ nhớ Node 384MB heap, systemd MemoryMax 700M
#   • Giữ nguyên .env + dữ liệu (server/data) khi chạy lại để cập nhật phiên bản
# =====================================================================
set -euo pipefail

APP_DIR="/opt/so-doan-vien"
SERVICE="sodoanvien"
APP_USER="sovan"
WITH_NGINX=false
for arg in "$@"; do
  case "$arg" in
    --nginx) WITH_NGINX=true ;;
  esac
done

[ "$(id -u)" -eq 0 ] || { echo "❌ Hãy chạy với sudo hoặc root"; exit 1; }
cd "$(dirname "$0")/.."  # thư mục gốc đã giải nén của gói release

echo "═══ 1/7 Cập nhật hệ thống & công cụ cơ bản ═══"
export DEBIAN_FRONTEND=noninteractive
apt-get update -qq
apt-get install -y -qq curl ca-certificates rsync tesseract-ocr tesseract-ocr-vie >/dev/null  # tesseract: engine AI offline (P2b)

echo "═══ 2/7 Tạo swap nếu RAM thấp ═══"
RAM_KB=$(awk '/MemTotal/ {print $2}' /proc/meminfo)
SWAP_ON=$(swapon --noheadings 2>/dev/null | wc -l || true)
if [ "${RAM_KB}" -lt 2000000 ] && [ "${SWAP_ON}" -eq 0 ]; then
  echo "→ RAM < 2GB và chưa có swap: tạo swap 2GB..."
  fallocate -l 2G /swapfile || dd if=/dev/zero of=/swapfile bs=1M count=2048 status=none
  chmod 600 /swapfile && mkswap /swapfile >/dev/null && swapon /swapfile
  grep -q '/swapfile' /etc/fstab || echo '/swapfile none swap sw 0 0' >> /etc/fstab
  sysctl -qw vm.swappiness=10
  echo "→ Swap đã bật (vm.swappiness=10)."
else
  echo "→ Bỏ qua (RAM đủ hoặc đã có swap)."
fi

echo "═══ 3/7 Kiểm tra/cài Node.js (>=18) ═══"
NEED_NODE=1
if command -v node >/dev/null 2>&1; then
  MAJOR=$(node -v | sed 's/v\([0-9]*\).*/\1/')
  if [ "${MAJOR}" -ge 18 ]; then NEED_NODE=0; echo "→ Đã có Node $(node -v)"; fi
fi
if [ "${NEED_NODE}" -eq 1 ]; then
  echo "→ Cài Node.js 20 từ NodeSource..."
  curl -fsSL https://deb.nodesource.com/setup_20.x | bash - >/dev/null
  apt-get install -y -qq nodejs >/dev/null
  echo "→ Node $(node -v) đã cài."
fi

echo "═══ 4/7 Sao chép ứng dụng vào ${APP_DIR} ═══"
mkdir -p "${APP_DIR}"
# -R (--relative) giữ nguyên đường dẫn tương đối → client/dist về đúng chỗ
rsync -a --delete -R \
  --exclude 'server/data' --exclude 'server/.env' \
  ./server ./docs ./deploy ./README.md ./LICENSE ./client/dist "${APP_DIR}/"
# npm install ngay trên VPS nếu node_modules lỗi kiến trúc (VD: VPS ARM)
if [ -d server/node_modules ]; then rsync -a --delete server/node_modules "${APP_DIR}/server/node_modules/"; fi
[ -f server/.env.example ] || cp deploy/.env.example "${APP_DIR}/server/.env.example"

echo "═══ 5/7 Tài khoản hệ thống & môi trường ═══"
id -u "${APP_USER}" >/dev/null 2>&1 || useradd --system --no-create-home --shell /usr/sbin/nologin "${APP_USER}"
if [ ! -f "${APP_DIR}/server/.env" ]; then
  SECRET=$(openssl rand -hex 32)
  sed "s/change-me-*/${SECRET}/" "${APP_DIR}/server/.env.example" > "${APP_DIR}/server/.env"
  echo "→ Đã sinh .env với JWT_SECRET ngẫu nhiên."
else
  echo "→ Giữ nguyên .env hiện có."
fi
mkdir -p "${APP_DIR}/server/data"
chown -R "${APP_USER}:${APP_USER}" "${APP_DIR}"

echo "═══ 6/7 Kiểm tra native module & cài lại nếu cần ═══"
cd "${APP_DIR}/server"
if ! sudo -u "${APP_USER}" node -e "require('better-sqlite3')" >/dev/null 2>&1; then
  echo "→ Node module không tương thích kiến trúc máy — cài lại (npm install)..."
  apt-get install -y -qq build-essential python3 make g++ >/dev/null 2>&1 || true
  rm -rf node_modules
  npm install --omit=dev --no-audit --no-fund
  chown -R "${APP_USER}:${APP_USER}" node_modules
fi

echo "═══ 7/7 Dịch vụ systemd ═══"
sed "s|/usr/bin/node|$(command -v node)|" "${APP_DIR}/deploy/sodoanvien.service" > /etc/systemd/system/${SERVICE}.service
systemctl daemon-reload
systemctl enable "${SERVICE}" >/dev/null
systemctl restart "${SERVICE}"
sleep 2
if curl -sf http://127.0.0.1:3000/api/health >/dev/null; then
  echo "✅ Ứng dụng đang chạy: $(curl -s http://127.0.0.1:3000/api/health)"
else
  echo "⚠️  Chưa ping được ứng dụng — xem log: journalctl -u ${SERVICE} -n 50 --no-pager"
  journalctl -u "${SERVICE}" -n 20 --no-pager || true
  exit 1
fi

if [ "${WITH_NGINX}" = true ]; then
  echo "═══ (Tùy chọn) Nginx + port 80 ═══"
  apt-get install -y -qq nginx >/dev/null
  cp "${APP_DIR}/deploy/nginx-sodoanvien.conf" /etc/nginx/sites-available/${SERVICE}
  ln -sf /etc/nginx/sites-available/${SERVICE} /etc/nginx/sites-enabled/${SERVICE}
  rm -f /etc/nginx/sites-enabled/default
  nginx -t && systemctl reload nginx
  command -v ufw >/dev/null && ufw allow 80/tcp 2>/dev/null || true
  echo "✅ Nginx đã chạy trên port 80."
fi

IP=$(curl -s --max-time 4 ifconfig.me || echo "<IP-VPS>")
cat <<KET

╔════════════════════════════════════════════════════════════╗
║  TRIỂN KHAI HOÀN TẤT                                       ║
╠════════════════════════════════════════════════════════════╣
║  Ứng dụng : http://${IP}  (nếu có Nginx)          ║
║  Port trực tiếp : 3000                                     ║
║  Tài khoản demo : quantri / 123456  ← ĐỔI MẬT KHẨU NGAY!   ║
║                                                            ║
║  Lệnh hữu ích:                                             ║
║   systemctl status ${SERVICE}                              ║
║   journalctl -u ${SERVICE} -f        (xem log trực tiếp)   ║
║   systemctl restart ${SERVICE}       (khởi động lại)       ║
║   nano ${APP_DIR}/server/.env        (cấu hình/AI key)     ║
╚════════════════════════════════════════════════════════════╝
KET
