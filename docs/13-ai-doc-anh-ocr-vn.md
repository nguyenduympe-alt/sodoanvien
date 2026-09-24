# 13. AI ĐỌC ẢNH OFFLINE — OCR-VN (PP-OCR + VietOCR)

Cài đặt ngày 24/09/2026 trên VPS `edugiaovien` (4 vCPU, 3,8 GB RAM, không GPU).

## 1. Vì sao chọn mô hình này

| Phương án | Kết quả trên VPS này | Kết luận |
|---|---|---|
| Qwen2-VL-2B / Qwen2.5-VL-3B (vision LLM, GGUF) | Cần ~2–3,5 GB RAM, 30–60 giây/ảnh trên CPU; VPS chỉ còn ~2,2 GB trống vì EduAssist LLM đang dùng ~1,2–2 GB | Không khả thi — dễ tràn RAM làm sập dịch vụ khác |
| Tesseract `vie` (engine cũ) | 209/288 trường đúng (72,6%) | Yếu với ảnh chụp nghiêng, mờ, chói |
| **PP-OCR + VietOCR (đã cài)** | **276/288 trường đúng (95,8%)**, ~1,5–2,5 giây/ảnh, ~770 MB RAM khi nạp | **Chọn** |

Bộ đo: 72 ảnh (288 trường: số CCCD, họ tên, ngày sinh, giới tính) gồm thẻ CCCD mẫu cũ, thẻ Căn cước 2024, màn hình VNeID và bản "chụp xấu" (nghiêng phối cảnh, mờ, vệt chói, nhiễu, JPEG nén 35–60%). Dữ liệu tổng hợp, không có ảnh cá nhân thật. Dữ liệu và script đo ở `/root/ocrtest/`.

**Cổng tự động P2:** 31/72 ảnh đủ điều kiện tự tạo hồ sơ; **0 trường hợp tự tạo khi sai dữ liệu**. Mọi ảnh đọc sai đều bị chuyển cán bộ rà.

## 2. Kiến trúc

```
Trình duyệt ──► Node /api/intake/extract ──► services/aiOffline.js
                                              │ 1) POST http://127.0.0.1:8031/ocr  (dịch vụ ocr-vn)
                                              │      PP-OCR DBNet (ONNX): dò vùng chữ + hướng chữ
                                              │      VietOCR vgg_seq2seq: đọc chữ tiếng Việt có dấu
                                              │      PP-OCR CRNN: đọc vùng SỐ/NGÀY (CCCD 24/24 đúng trên ảnh xấu)
                                              │ 2) Tesseract vie: dự phòng nếu ocr-vn lỗi/tắt
                                              ▼
                        Bộ phân tích quy tắc: nhãn CCCD cũ + Căn cước 2024 + VNeID,
                        kiểm tra chéo CCCD ↔ năm sinh ↔ mã thế kỉ/giới tính,
                        từ điển họ/tên đệm sửa lỗi sai dấu ("Trấn" → "Trần"),
                        điểm tin cậy = trung bình + phạt theo trường yếu nhất
```

Ảnh không rời khỏi máy chủ và không được lưu.

## 3. Vận hành

| Việc | Lệnh |
|---|---|
| Trạng thái | `systemctl status ocr-vn` · `curl 127.0.0.1:8031/health` |
| Khởi động lại | `systemctl restart ocr-vn` |
| Log | `journalctl -u ocr-vn -f` |
| Tắt AI, dùng Tesseract | thêm `OCR_VN_DISABLE=1` vào `server/.env` rồi `systemctl restart sodoanvien` |

- Mã nguồn: `/opt/ai-models/ocr-vn/ocr_server.py`, mô hình trong `/opt/ai-models/ocr-vn/models/`, venv trong `/opt/ai-models/ocr-vn/venv`.
- Unit systemd: `/etc/systemd/system/ocr-vn.service` (user `ocrvn`, chỉ nghe 127.0.0.1, `MemoryMax=1500M`, `Nice=5`).
- **Chính sách RAM:** nạp mô hình khi có ảnh đầu tiên (~5 giây). Rảnh 15 phút (`OCR_IDLE_UNLOAD_S=900`) thì tiến trình tự thoát để trả RAM; systemd khởi động lại ở trạng thái nhẹ (~60 MB).
- Đổi sang VietOCR `vgg_transformer`: sửa `OCR_REC_MODEL` trong unit. Model này chậm hơn ~2,5 lần và không chính xác hơn trên ảnh chụp xấu.
- Ngưỡng tự động: `AI_AUTO_THRESHOLD=0.93` trong `server/.env` (mặc định của code là 0.92, nâng lên sau khi đo).

## 4. Nâng cấp khi có tài nguyên

- **VPS ≥ 8 GB RAM hoặc có GPU:** chạy Qwen2.5-VL-7B qua Ollama, đặt `AI_PROVIDER=cloud`, `AI_BASE_URL=http://127.0.0.1:11434/v1`, `AI_VISION_MODEL=qwen2.5vl:7b`, `AI_API_KEY=ollama`. Không cần sửa code.
- **Chấp nhận gửi ảnh ra ngoài:** điền `AI_API_KEY` (gpt-4o / gemini-2.0-flash). Cân nhắc Nghị định 13/2023 về dữ liệu cá nhân.
- **Tinh chỉnh VietOCR** bằng dữ liệu `tools/gen-cccd-synth.py --mode lines` để tăng độ chính xác trên font thẻ thật.

Bản sao lưu trước khi thay đổi: `/root/sodoanvien-before-ocrvn-20260924-2048.tgz`.
