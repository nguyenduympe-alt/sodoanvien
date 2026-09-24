#!/usr/bin/env bash
# =====================================================================
# TẠO GÓI TRIỂN KHAI (chạy trên máy bạn / sandbox, KHÔNG chạy trên VPS)
# Kết quả: releases/so-doan-vien-release-<ngay>-<gio>.tar.gz
# Gói đã chứa sẵn node_modules (server) + client/dist (giao diện đã build)
# → trên VPS KHÔNG cần build, KHÔNG cần cài gì ngoài Node.js
# =====================================================================
set -euo pipefail
cd "$(dirname "$0")/.."   # về thư mục gốc dự án

VERSION=$(date +%Y%m%d-%H%M)
OUTDIR="releases"
OUT="${OUTDIR}/so-doan-vien-release-${VERSION}.tar.gz"
mkdir -p "${OUTDIR}"

# Kiểm tra giao diện đã build
if [ ! -f client/dist/index.html ]; then
  echo "❌ Chưa có client/dist — hãy chạy: cd client && npm install && npm run build"
  exit 1
fi

tar -czf "${OUT}" \
  --exclude='server/data' \
  --exclude='server/fabric-identity' \
  --exclude='server/fabric-config' \
  --exclude='client/node_modules' \
  --exclude='client/.vite' \
  --exclude='releases' \
  server/src \
  server/chaincode \
  server/docs-src \
  server/node_modules \
  server/package.json \
  server/package-lock.json \
  client/dist \
  client/src \
  client/index.html \
  client/vite.config.js \
  client/package.json \
  docs \
  deploy \
  .gitignore \
  .github \
  LICENSE \
  HUONG-DAN-GITHUB.md \
  README.md

SIZE=$(du -h "${OUT}" | cut -f1)
echo "✅ Đã tạo gói: ${OUT} (${SIZE})"
echo "   → Tải về máy rồi upload lên VPS:  scp ${OUT} root@<IP-VPS>:/root/"
