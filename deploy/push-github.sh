#!/usr/bin/env bash
# ============================================================
# PUSH DỰ ÁN LÊN GITHUB — một lệnh duy nhất
# Remote đã cấu hình sẵn:
#   https://github.com/nguyenduympe-alt/sodoanvien
# Cách dùng (chạy trong thư mục dự án, nơi có file này tại deploy/):
#   bash deploy/push-github.sh
# Lần đầu push GitHub sẽ hỏi đăng nhập:
#   Username: nguyenduympe-alt
#   Password: DÁN PERSONAL ACCESS TOKEN (không phải mật khẩu GitHub!)
#   → Tạo token: GitHub → Settings → Developer settings →
#     Personal access tokens → Tokens (classic) → Generate new token (classic)
#     → tick quyền "repo" → copy dán vào.
# ============================================================
set -euo pipefail

REMOTE_URL="https://github.com/nguyenduympe-alt/sodoanvien.git"

command -v git >/dev/null 2>&1 || { echo "❌ Chưa cài git — Windows: https://git-scm.com/download/win"; exit 1; }
cd "$(dirname "$0")/.."

[ -f .gitignore ] || { echo "❌ Không thấy .gitignore — hãy chạy trong thư mục dự án gốc"; exit 1; }

MSG="${1:-Nguyen mau he thong dinh danh & quan li so Doan vien tren Hyperledger Fabric}"

if [ ! -d .git ]; then
  git init -q
  echo "→ Đã khởi tạo git repository"
fi

git add -A
if git diff --cached --quiet 2>/dev/null; then
  echo "→ Không có thay đổi mới để commit"
else
  git commit -qm "$MSG" && echo "→ Đã commit: $MSG"
fi

git branch -M main

if git remote get-url origin >/dev/null 2>&1; then
  git remote set-url origin "${REMOTE_URL}"
else
  git remote add origin "${REMOTE_URL}"
fi
echo "→ Remote origin = ${REMOTE_URL}"

echo "→ Đang push lên GitHub (lần đầu sẽ hỏi Username + Password/TOKEN)…"
if git push -u origin main; then
  echo ""
  echo "✅ HOÀN TẤT! Xem repo tại: https://github.com/nguyenduympe-alt/sodoanvien"
  echo "   → Vào tab 'Actions' để xem CI tự build & kiểm tra (đợi ~1 phút)."
  echo "   → Sau này cập nhật code: chỉ cần chạy lại 'bash deploy/push-github.sh'"
else
  echo ""
  echo "⚠️ Push thất bại — thường do xác thực. Kiểm tra:"
  echo "   1. Username: nguyenduympe-alt"
  echo "   2. Password phải là TOKEN, không phải mật khẩu GitHub:"
  echo "      https://github.com/settings/tokens → Generate new token (classic) → tick 'repo'"
  exit 1
fi
