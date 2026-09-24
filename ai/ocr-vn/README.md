# OCR-VN — AI đọc ảnh tiếng Việt offline

Dịch vụ nội bộ để `server/src/services/aiOffline.js` trích xuất số CCCD, họ tên, ngày sinh và giới tính từ ảnh thẻ CCCD, thẻ Căn cước 2024 hoặc màn hình VNeID. Chạy hoàn toàn trên CPU; ảnh không rời máy chủ.

| Tầng | Mô hình | Vai trò |
|---|---|---|
| Dò chữ | PP-OCR DBNet (RapidOCR, ONNX Runtime) | tìm vùng chữ, phân loại hướng |
| Đọc chữ | VietOCR `vgg_seq2seq` | tiếng Việt có dấu (họ tên, địa chỉ) |
| Đọc số | PP-OCR CRNN | số CCCD, ngày tháng (chính xác hơn trên ảnh xấu) |

## Cài đặt

```bash
sudo bash ai/ocr-vn/install.sh
sudo systemctl restart sodoanvien
curl 127.0.0.1:8031/health
```

Backend tự nhận dịch vụ ở `OCR_VN_URL` (mặc định `http://127.0.0.1:8031`). Nếu dịch vụ tắt, backend quay về Tesseract `vie`.

## Kết quả đo (VPS 4 vCPU, 4 GB RAM)

72 ảnh tổng hợp (288 trường), gồm ảnh sạch và ảnh "chụp xấu" (nghiêng, mờ, chói, JPEG 35–60%):

| Engine | Trường đúng | Thời gian/ảnh |
|---|---|---|
| Tesseract vie | 209/288 (72,6%) | 0,3 giây |
| **OCR-VN** | **276/288 (95,8%)** | ~1,5–2,5 giây |

Cổng tự động P2 (`AI_AUTO_THRESHOLD=0.93`): 0 trường hợp tự tạo hồ sơ khi dữ liệu sai. Script đo nằm trong `bench/`: `gen_real.py`, `make_hard*.py` sinh ảnh; `e2e.py` gọi `/api/intake/extract`.

Chi tiết vận hành và chính sách RAM: `docs/13-ai-doc-anh-ocr-vn.md`.
