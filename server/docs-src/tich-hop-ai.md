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
