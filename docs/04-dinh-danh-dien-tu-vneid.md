# ĐỒNG BỘ ĐỊNH DANH ĐIỆN TỬ VNeID — PHÂN TÍCH KHẢ THI & THIẾT KẾ TÍCH HỢP

# 1. Trả lời ngắn: được hay không?

| Cấp độ | Làm được ngay? | Điều kiện |
|---|---|---|
| **Đồng bộ trực tiếp API VNeID** (tra cứu CSDL định danh Bộ Công an) | ❌ Chưa — ở mức luận văn/nguyên mẫu | Tổ chức có **pháp nhân** (Đoàn trường/trường) đăng ký dịch vụ *xác thực định danh điện tử* với Bộ Công an qua Cổng kết nối liên thông; được thẩm định nhu cầu, ký hợp đồng, trả phí theo lượt. **Không có API công khai** cho cá nhân/sinh viên |
| **Qua eKYC thương mại** (VNPT eKYC, Viettel, FPT, MobiFone...) | ⚠️ Được khi trường/công ty ký hợp đồng | Nhà cung cấp trung gian đã kết nối sẵn với Bộ Công an; theo lượt (vài trăm–vài nghìn đ/lượt); cần tài khoản + API key |
| **Mô phỏng đầy đủ luồng** (đã xây trong nguyên mẫu) | ✅ Đang chạy | Không cần gì — dùng để demo + chuẩn bị sẵn "ổ cắm" |
| **Lấy thông tin đoàn viên tự kê khai từ app VNeID** (chụp màn hình/QR định danh) | ✅ Quy trình thủ công hiện nay | Cán bộ Chi đoàn đối chiếu khi kết nạp; hệ thống lưu trạng thái xác thực |

**Kết luận:** hệ thống đã có sẵn **bộ kết nối chuẩn hóa** (`services/vneid.js` + chaincode `VerifyIdentity`) — nguyên mẫu dùng provider `mock` để demo đầy đủ 3 kịch bản (đạt/lệch/không tìm thấy). Khi đơn vị có hợp đồng dịch vụ thật, chỉ cần đổi cấu hình:

```bash
VNEID_PROVIDER=http
VNEID_BASE_URL=https://<endpoint-của-nhà-cung-cấp>
VNEID_API_KEY=<khóa>
```
→ **không phải sửa một dòng code nghiệp vụ nào.**

# 2. Luồng tích hợp đã cài đặt

```
Cán bộ Chi đoàn nhập CCCD (giao diện)
        │  POST /api/members/:id/verify-identity
        ▼
Backend ──► services/vneid.js ──► [mock | HTTP provider: eKYC/VNeID]
        │                             (chỉ gửi CCCD + họ tên + ngày sinh)
        ◄── kết quả chuẩn hóa: verified, MĐĐĐ, refCode, level, resultHash
        │
        ├─► Off-chain DB: cột idVerifyStatus / idVerifySource / idVerifyAt / idVerifyRef / mdid
        │   (CCCD vẫn chỉ nằm ở off-chain, như thiết kế mục 8.5 đề cương)
        │
        └─► Ledger: giao dịch VerifyIdentity — chỉ chứa {memberId, resultHash, provider, ref}
            → hash SHA-256 của kết quả (MĐĐĐ + mã tham chiếu + thời điểm), KHÔNG chứa CCCD
```

**Quy tắc bảo mật giữ nguyên triết lý đề cương:** blockchain chỉ là *lớp bằng chứng* — bằng chứng rằng "hồ sơ này đã được xác thực định danh điện tử mức 2 tại thời điểm X, mã tham chiếu Y". Dữ liệu cá nhân không bao giờ lên chain (đã kiểm chứng tự động: dump ledger không chứa CCCD).

# 3. Demo bằng provider mock (đang chạy trong nguyên mẫu)

Vào hồ sơ đoàn viên → nút **🇻🇳 Xác thực định danh**. Quy ước mô phỏng để trình diễn đủ kịch bản:

| CCCD nhập | Kết quả | Kịch bản trình bày khi bảo vệ |
|---|---|---|
| 12 số, đuôi khác 0/9 | ✅ Đạt — trả MĐĐĐ + mã tham chiếu, ghi vết ledger | Luồng thành công |
| Đuôi `0` | ❌ `NOT_FOUND` | CCCD sai/không tồn tại |
| Đuôi `9` | ⚠️ `MISMATCH` | Thông tin kê khai lệch với định danh mức 2 |
| Không đủ 12 số | ❌ `INVALID_INPUT` | Kiểm soát đầu vào |
| Cán bộ chi đoàn khác xác thực hộ | ❌ 403 | Phân quyền |

2 đoàn viên đầu trong dữ liệu demo đã được đánh dấu **VERIFIED** để giao diện có badge 🇻🇳 ngay khi mở.

# 4. Lộ trình lên sản phẩm thật (cho mục "hướng phát triển" của luận văn)

1. **Giai đoạn 1 — thủ công có kiểm soát (đang làm được):** đoàn viên tự cung cấp Mã định danh điện tử (MĐĐĐ) từ app VNeID khi kết nạp; cán bộ đối chiếu; hệ thống ghi trạng thái + vết ledger.
2. **Giai đoạn 2 — eKYC thương mại:** trường ký hợp đồng eKYC (VNPT/Viettel/FPT); điền `VNEID_PROVIDER=http` + endpoint; đoàn viên quét khuôn mặt/CCCD chip qua SDK của nhà cung cấp (front-end) → backend nhận kết quả → ghi vết. Chi phí theo lượt, phù hợp quy mô một trường.
3. **Giai đoạn 3 — dịch vụ xác thực định danh của Bộ Công an:** đăng ký dùng dịch vụ kết nối liên thông (theo Thông tư 58/2022/TT-BCA, Luật Định danh điện tử 18/2023/QH15, Nghị định 33/2024/NĐ-CP); tra cứu chính thức theo MĐĐĐ; là cấp độ chuẩn nhất cho liên thông toàn hệ thống Đoàn sau này.

# 5. Tuân thủ pháp lý dữ liệu cá nhân (nêu trong luận văn)

- **Luật Định danh điện tử 18/2023/QH15** (hiệu lực 01/7/2024) và **Nghị định 33/2024/NĐ-CP**: MĐĐĐ là định danh của cá nhân; việc tra cứu/xác thực phải có căn cứ, mục đích cụ thể.
- **Thông tư 58/2022/TT-BCA**: thủ tục tổ chức đăng ký sử dụng dịch vụ xác thực định danh điện tử.
- **Nghị định 13/2023/NĐ-CP**: xử lí dữ liệu cá nhân phải có sự đồng ý, mục đích rõ ràng, tối thiểu hóa — hệ thống đáp ứng bằng: chỉ gửi số lượng trường tối thiểu cho provider; không lưu phản hồi raw; chỉ ghi hash lên ledger; mọi thao tác có audit log gắn vai trò người thực hiện.

# 6. Chức năng "Nhập hồ sơ từ ảnh VNeID / CCCD" — tự tạo hồ sơ + tài khoản học sinh

Luồng kết nạp mới hoàn toàn tự động hóa, vẫn giữ bước **duyệt của cán bộ** (human-in-the-loop):
trang **📸 Nhập từ ảnh VNeID** (`#/intake`) — 3 kênh nhập, chung 1 bước xác nhận:

| Kênh | Cách hoạt động | Kỹ thuật |
|---|---|---|
| **📷 Quét QR VNeID** | Cán bộ bật camera chụp **mã QR định danh mức 2** trên app VNeID của học sinh (hoặc tải ảnh chụp lên) → trình duyệt giải mã NGAY, không gửi ảnh đi đâu | `jsQR` thuần JavaScript, chạy offline trong trình duyệt; payload demo `SDV1\|cccd\|họ tên\|ngày sinh\|giới tính` |
| **🤖 AI đọc ảnh** | Chụp màn hình VNeID/thẻ CCCD → AI Vision trích xuất JSON {họ tên, ngày sinh, giới tính, CCCD} | Chuẩn OpenAI-compatible (`AI_VISION_MODEL`); ảnh thu nhỏ trước khi gửi, **không lưu ảnh** |
| **⌨️ Nhập tay** | Form trống | Dự phòng |

Sau khi dữ liệu được điền, cán bộ **rà lại từng trường** → bấm "Tạo hồ sơ & tài khoản", hệ thống làm trọn bộ:
1. Sinh **mã đoàn viên** tự động (`DV2026xxxx`), tạo hồ sơ + `CreateMemberProfile` lên ledger;
2. Nếu nguồn là QR VNeID/AI đọc được CCCD → **tự ghi vết `VerifyIdentity`** (hồ sơ mang badge 🇻🇳 VERIFIED ngay);
3. **Tự tạo tài khoản** cho học sinh: username tự sinh từ họ tên (bỏ dấu, ví dụ `nguyenvantam`), **mật khẩu tạm ngẫu nhiên hiển thị đúng 1 lần** để cán bộ bàn giao;
4. Trả về màn kết quả kèm nút **in thẻ QR** cho học sinh.

Kiểm soát an toàn đã kiểm thử: chặn CCCD trùng, chặn CCCD thiếu/sai số chữ số, kiểm tra trùng username, ledger từ chối thì không tạo gì ở DB, CCCD không bao giờ xuất hiện trên ledger.

> Lưu ý triển khai thật: QR trên app VNeID thật được Bộ Công an **ký số/mã hóa** — khi trường có dịch vụ chính thức, payload sẽ được giải mã phía server qua bộ kết nối (`VNEID_PROVIDER=http`), luồng phía sau (duyệt → tạo hồ sơ + tài khoản) giữ nguyên.

# 7. Bảng ánh xạ vào mã nguồn

| Thành phần | File |
|---|---|
| Bộ kết nối định danh (mock + http) | `server/src/services/vneid.js` |
| Hàm chaincode ghi vết | `VerifyIdentity` trong `server/src/ledger/contract.js` (đồng bộ bản Fabric thật `chaincode/sodoanvien-contract.js` khi triển khai) |
| API | `POST /api/members/:id/verify-identity` |
| Cấu hình | `.env`: `VNEID_PROVIDER`, `VNEID_BASE_URL`, `VNEID_API_KEY` |
| Giao diện | Nút 🇻🇳 trong trang hồ sơ + badge trạng thái + chip trên thẻ đoàn viên |
| Nhập từ ảnh + tạo tài khoản | `client/src/pages/Intake.jsx` (camera + jsQR + AI), API `POST /api/intake/enroll`, `/api/intake/extract` trong `server/src/routes/intake.js` |
