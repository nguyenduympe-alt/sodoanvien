# LỘ TRÌNH TÍCH HỢP MÔ HÌNH AI — "Sổ Đoàn viên số"

Thiết kế từ đầu theo nguyên tắc **AI-as-a-Service**: mô hình AI là một dịch vụ bên ngoài, gọi qua REST chuẩn OpenAI-compatible, không lẫn vào logic nghiệp vụ. Nhờ vậy có thể thay mô hình (OpenAI, Azure OpenAI, Gemini, Ollama chạy máy trường, vLLM…) mà **không sửa một dòng code nghiệp vụ**.

# 1. Kiến trúc tích hợp (đã dựng sẵn trong nguyên mẫu)

```
Giao diện (Trợ lí AI)  ──POST /api/ai/chat──▶  Backend (services AI)
                                               │  1. kiểm tra JWT + phạm vi quyền
                                               │  2. dựng NGỮ CẢNH thống kê theo quyền
                                               │  3. gọi AI_BASE_URL (chuẩn /chat/completions)
                                               ▼
                                    Mô hình AI (OpenAI / Ollama / vLLM / …)
```

- **Bật ngay bằng biến môi trường** (không cần sửa code):
  `AI_API_KEY`, `AI_BASE_URL` (mặc định OpenAI; đổi thành `http://localhost:11434/v1` cho Ollama), `AI_MODEL`.
- **Nguyên tắc an toàn:** AI chỉ nhận **số liệu thống kê theo phạm vi quyền** của người hỏi (số đoàn viên, số chờ chuyển, số khóa…). Không bao giờ gửi CCCD/phone/địa chỉ cho mô hình. Mọi câu hỏi ghi audit log.
- Chưa cấu hình khóa → endpoint trả 503 kèm hướng dẫn; giao diện hiển thị trạng thái "Chưa bật" + lộ trình.

# 1b. CẤU HÌNH AI VISION CHẤT LƯỢNG CAO (đọc ảnh VNeID/CCCD)

**Pipeline đã cài trong `POST /api/intake/extract`:**
1. **Lượt 1** — system prompt chuyên sâu: mô tả đúng bố cục màn hình VNeID "Thông tin định danh" (mức 2) và thẻ CCCD song ngữ Việt–Anh; yêu cầu trả JSON {fullName, dob(YYYY-MM-DD), gender, idNumber(12 số), mdid, confidence 0–1, warnings[]}; cấm bịa dữ liệu, trường không rõ → null + cảnh báo.
2. **Tự kiểm tra** — server validate: tên ≥ 3 ký tự, dob đúng định dạng, CCCD đúng 12 số, giới tính Nam/Nữ.
3. **Lượt 2 (tự động)** — nếu lỗi: gửi lại ảnh kèm JSON cũ + danh sách lỗi, yêu cầu nhìn kỹ vùng chữ nhỏ rồi sửa. Chỉ giữ kết quả tốt hơn.
4. **Chuẩn hóa** — ngày sinh dd/mm/yyyy → YYYY-MM-DD; giới tính biến thể (Nư/Nu/female) → "Nữ"; CCCD lọc chỉ giữ số; gom cảnh báo để cán bộ rà tay.

**Chọn model (biến `AI_VISION_MODEL` trong `.env`):**

| Model | Chất lượng | Chi phí/lượt | Ghi chú |
|---|---|---|---|
| `gpt-4o-mini` | Khá — đủ dùng phổ thông | ~vài trăm đ | Mặc định, cân bằng nhất |
| `gpt-4o` | Rất tốt, chữ nhỏ/viền xám vẫn đọc được | ~3–5 lần mini | Khuyến nghị cho góc quầy tiếp nhận |
| `gemini-2.0-flash` (Google AI Studio, endpoint OpenAI-compat) | Tốt, nhanh | Rẻ | Đổi AI_BASE_URL sang Google |
| `qwen2.5-vl` qua Ollama/vLLM | Tùy bản 7B/72B | Miễn phí (chạy máy trường) | Dữ liệu không rời khỏi đơn vị |
| `llava` (Ollama) | Trung bình | Miễn phí | Demo offline |

**Mẹo chất lượng ảnh (hiển thị ngay trên giao diện nhập):** chụp thẳng màn hình (tránh chéo gây vệt sáng), đủ sáng, để chữ chiếm phần lớn khung hình, không zoom quá tay. Client tự resize về cạnh dài 1600px, JPEG 90% — đủ nét, nhẹ dung lượng.

**Bảo mật:** ảnh không được lưu; kết quả chỉ giữ 4 trường nghiệp vụ; mọi lần gọi có audit log.

# 1c. CỔNG TỰ ĐỘNG NHẬP LIỆU P2 (ĐÃ TRIỂN KHAI)

Luồng "AI nhập thay cán bộ" với điều kiện an toàn — **đủ 4 điều kiện mới tự tạo hồ sơ, thiếu 1 → nâng cán bộ**:

| Điều kiện tự động | Ý nghĩa |
|---|---|
| Đủ 4 trường bắt buộc (họ tên, ngày sinh, giới tính, CCCD) | Không hồ sơ dang dở |
| `confidence ≥ AI_AUTO_THRESHOLD` (mặc định **0,92**) | AI chắc chắn |
| **0 cảnh báo** trong `warnings[]` | Không có vùng ảnh mờ/chói |
| Không trùng CCCD trong DB | Không trùng hồ sơ |

Thành phần kèm theo:
- **Chấm chất lượng ảnh ngay trên trình duyệt** (trước khi tốn token AI): độ mờ = phương sai Laplacian trên ảnh xám + độ sáng trung bình; ảnh mờ quá (blur < 25) bị chặn với lời khuyên chụp lại.
- **Bảng `ai_jobs`**: nhật kí mỗi lần AI đọc ảnh — model, điểm tin cậy, cảnh báo, quyết định tự động + lý do, hồ sơ tạo ra (`memberId`), người gọi, thời điểm. Xem tại `GET /api/admin/ai-jobs` (Quản trị) kèm thống kê tỉ lệ tự động.
- **Dấu vết hồ sơ**: thành viên tự tạo có cờ `createdByAi=1` + `aiJobId` (off-chain), notes ghi rõ job + model + điểm; lịch sử `CreateMemberProfile`/`VerifyIdentity` trên ledger không đổi.
- **Chống sai**: quyết định tự động do SERVER tính (từ kết quả AI đã chuẩn hóa), không tin tham số client; trùng CCCD luôn nâng cán bộ; Đoàn trường chưa chọn chi đoàn tiếp nhận → nâng.
- **Chế độ DEMO**: `AI_MOCK_EXTRACT=1` → extract trả kết quả mẫu (tin cậy 0,97) không cần key — để diễn đạt luồng tự động khi thuyết trình; mặc định TẮT, không bao giờ bật ở sản xuất.

Cấu hình: `AI_AUTO_THRESHOLD=0.92` (0–1, đổi được qua `.env`). API: `POST /api/intake/extract` nhận thêm `{auto: true}` → phản hồi thêm `jobId, autoDecision{auto, reason}, autoCreated?{member, account, tx, verifyTx}`.

# 1d. ENGINE AI OFFLINE — TESSERACT OCR + QUY TẮC (ĐÃ TRIỂN KHAI)

Trích xuất định danh **không cần internet, không cần API key, không tốn phí** — ảnh không rời khỏi server:

```
Ảnh (base64) → tesseract -l vie --psm 6 (TSV, kèm độ tin cậy từng từ)
   → Bộ phân tích quy tắc: nhãn thẻ (Số/No., Họ và tên, Ngày sinh, Giới tính…)
      + biểu thức chính quy (12 số CCCD có/không dấu chấm, dd/mm/yyyy, Nam/Nữ)
      + kiểm tra chéo CCCD[3:5] ↔ 2 số cuối năm sinh (sai → cảnh báo)
   → fields{fullName, dob, gender, idNumber, confidence, warnings[]}  ← CÙNG SCHEMA cloud AI
   → đi thẳng CỔNG TỰ ĐỘNG P2 (≥0,92 + 0 cảnh báo + không trùng → tự tạo hồ sơ)
```

- **Cài đặt server**: `apt install tesseract-ocr tesseract-ocr-vie` (đã đưa vào `deploy.sh` — tự cài khi triển khai).
- **Chọn engine** bằng `AI_PROVIDER`: `auto` (mặc định — có key dùng cloud, không key dùng offline) | `cloud` | `offline`. Xem trạng thái tại `GET /api/intake/status`.
- **Điểm tin cậy** tính từ độ tin cậy OCR từng từ vùng giá trị + thưởng khớp chéo (+0,02) + phạt theo số trường thiếu; ảnh mờ → conf tụt và/hoặc warning → cổng tự động **tự nâng cán bộ** (đã kiểm chứng: ảnh mờ 2,2px → conf 0,77 → nâng).
- **Bảo mật tốt hơn cloud**: ảnh base64 chỉ ghi vào file tạm trong quá trình OCR rồi xóa ngay; không có request ra ngoài.
- **Hạn chế so với cloud**: chữ viết tay, ảnh chéo nghiêng nặng, thẻ cũ bạc màu — OCR cổ điển đọc kém hơn; khi đó hệ thống tự nâng cán bộ (không bao giờ "bịa" dữ liệu).
- **Huấn luyện riêng model cho thẻ CCCD** (`TESS_LANG=vie_cccd`): fine-tune Tesseract bằng dữ liệu tổng hợp — xem tài liệu `docs/12-du-lieu-huan-luyen-ocr-cccd-viet-tay.md` + công cụ `tools/gen-cccd-synth.py`.
- **Nâng cấp lên MÔ HÌNH NƠ-RON OFFLINE THẬT** (không đổi code): cài [Ollama](https://ollama.com) trên máy ≥8GB RAM → `ollama pull qwen2.5vl:7b` → đặt `AI_BASE_URL=http://127.0.0.1:11434/v1`, `AI_VISION_MODEL=qwen2.5vl:7b`, `AI_API_KEY=ollama` — hệ thống tự dùng model nơ-ron cục bộ thay cloud, vẫn chi phí 0đ và ảnh không rời máy. Lưu ý: VPS 1–4GB chỉ chạy được Tesseract; Ollama cần máy mạnh hơn (máy trạm/PC phòng Công tác Đoàn).

**Vị trí code**: `server/src/services/aiOffline.js` (engine) — được gọi từ `POST /api/intake/extract` khi provider = offline.

# 2. Giai đoạn 1 — Trợ lí hỏi đáp nghiệp vụ (khung đã có)

- Hỏi đáp về quy trình (tạo hồ sơ, chuyển sinh hoạt, đối soát…) dựa trên **system prompt** chứa ngữ cảnh hệ thống + dữ liệu thống kê thời gian thực.
- Mở rộng: **RAG** với tài liệu Luật Đoàn, điều lệ, quy chế đánh giá xếp loại → trả lời trích dẫn điều khoản.

# 3. Giai đoạn 2 — AI phân tích dữ liệu (gợi ý cho hướng phát triển đề cương)

| Ứng dụng | Dữ liệu đầu vào | Mô hình gợi ý | Giá trị |
|---|---|---|---|
| **Phát hiện bất thường sớm** | lịch sử UpdateMemberProfile, tần suất sửa, mẫu thời điểm | phân cụm/isolation forest hoặc LLM phân tích log | cảnh báo trước khi đối soát hash phát hiện |
| **Tóm tắt hồ sơ đoàn viên** | HISTORY trên ledger + activities | LLM (summarization) | cán bộ nắm nhanh quá trình sinh hoạt khi phê duyệt chuyển sinh hoạt |
| **Dự báo nợ hoạt động** | tham gia hoạt động theo tháng | hồi quy/chuỗi thời gian | nhắc chi đoàn chăm sóc đoàn viên ít sinh hoạt |
| **Hỗ trợ đánh giá xếp loại** | hoạt động, khen thưởng, kỉ luật | LLM + rubric | đề xuất xếp loại, cán bộ phê duyệt (human-in-the-loop) |

Kiến trúc: thêm `services/ai-analytics.js` — cùng mẫu adapter, chạy định kỳ, kết quả ghi vào bảng `alerts` (đã có sẵn) nên **tái dùng toàn bộ luồng cảnh báo** hiện tại.

# 4. Giai đoạn 3 — AI trên tài liệu & định danh

- **OCR đơn kết nạp giấy:** chụp ảnh đơn → trích trường (họ tên, ngày sinh…) → tự điền form tạo hồ sơ (dùng Tesseract hoặc LLM vision); cán bộ Chi đoàn chỉ rà và bấm ghi ledger.
- **QR + xác minh:** trang `/verify` đã có API công khai; in QR chứa `memberCode + hash` lên thẻ đoàn viên → quét là tra cứu. Có thể nâng cấp đối chiếu khuôn mặt (on-device) khi xác minh ngoài hội trường.
- **Chatbot đa kênh:** cùng endpoint `/api/ai/chat` có thể gắn vào Zalo OA/website trường.

# 5. Nguyên tắc khi triển khai AI trong luận văn

1. **Không đưa dữ liệu cá nhân nhạy cảm ra ngoài hệ thống** nếu dùng API đám mây: ẩn danh hóa hoặc chỉ gửi thống kê; hoặc dùng Ollama/vLLM chạy nội bộ.
2. **Human-in-the-loop:** AI chỉ đề xuất, cán bộ phê duyệt — mọi quyết định nghiệp vụ vẫn ghi giao dịch blockchain bằng danh tính người duyệt.
3. **Đo lường khi báo cáo:** độ chính xác phát hiện bất thường, thời gian tiết kiệm khi tóm tắt hồ sơ — đưa vào chương đánh giá.
4. Giữ ranh giới lớp: lỗi AI không được ảnh hưởng giao dịch blockchain (retry, timeout, trả thông báo thân thiện — đã xử lí trong endpoint).
