#!/usr/bin/env bash
# ============================================================
# CÀI OCR-VN — AI đọc ảnh tiếng Việt offline (PP-OCR + VietOCR) cho Sổ Đoàn viên số
# Chạy bằng root trên Ubuntu 22.04/24.04:   sudo bash ai/ocr-vn/install.sh
# Kết quả: dịch vụ systemd "ocr-vn" nghe 127.0.0.1:8031; backend tự dùng (không cần sửa .env)
# Yêu cầu: ≥ 1,5 GB RAM trống, ~2 GB đĩa. Không cần GPU.
# ============================================================
set -euo pipefail
SRC="$(cd "$(dirname "$0")" && pwd)"
DST=/opt/ai-models/ocr-vn
PY=python3

apt-get install -y -q python3-venv >/dev/null
mkdir -p "$DST/models" "$DST/cache"
cp "$SRC/ocr_server.py" "$DST/"

[ -d "$DST/venv" ] || $PY -m venv "$DST/venv"
"$DST/venv/bin/pip" install -q --upgrade pip
"$DST/venv/bin/pip" install -q torch torchvision --index-url https://download.pytorch.org/whl/cpu
"$DST/venv/bin/pip" install -q -r "$SRC/requirements.txt"
"$DST/venv/bin/pip" install -q --no-deps vietocr==0.3.13
# rapidocr kéo opencv-python (cần libGL) → thay bằng bản headless cho server
"$DST/venv/bin/pip" uninstall -y -q opencv-python 2>/dev/null || true
"$DST/venv/bin/pip" install -q --force-reinstall --no-deps opencv-python-headless

cd "$DST/models"
for f in base.yml vgg-seq2seq.yml vgg-transformer.yml; do
  [ -s "$f" ] || curl -sfL -o "$f" "https://vocr.vn/data/vietocr/config/$f"
done
[ -s vgg_seq2seq.pth ] || curl -sfL -o vgg_seq2seq.pth https://vocr.vn/data/vietocr/vgg_seq2seq.pth
# (tùy chọn) bản transformer: curl -sfL -o vgg_transformer.pth https://vocr.vn/data/vietocr/vgg_transformer.pth

id ocrvn >/dev/null 2>&1 || useradd --system --no-create-home --shell /usr/sbin/nologin ocrvn
chown -R ocrvn:ocrvn "$DST/cache"
cp "$SRC/ocr-vn.service" /etc/systemd/system/ocr-vn.service
systemctl daemon-reload
systemctl enable --now ocr-vn
sleep 3
curl -s http://127.0.0.1:8031/health && echo && echo "✅ OCR-VN đã chạy. Khởi động lại backend: systemctl restart sodoanvien"
