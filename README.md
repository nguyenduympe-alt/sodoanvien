# 🎓 Sổ Đoàn viên số — Hệ thống định danh & quản lí sổ Đoàn viên trên Hyperledger Fabric

Nguyên mẫu cho đề cương luận văn thạc sĩ *"Xây dựng hệ thống định danh và quản lí sổ Đoàn viên dựa trên nền tảng Chuỗi khối"* — Trường CNTT & TT, Đại học Cần Thơ.

## ✨ Chức năng chính

- **Quản lí sổ Đoàn viên điện tử**: kết nạp (tạo hồ sơ), cập nhật, ghi hoạt động/đánh giá/khen thưởng/kỉ luật — mọi thao tác ghi đều tính hash SHA-256 (JSON canonical) và ghi giao dịch lên ledger.
- **5 vai trò, phân quyền 2 lớp** (API + chaincode): Đoàn viên (chỉ đọc hồ sơ mình) · Chi đoàn · Liên chi đoàn/Đoàn khoa · Đoàn trường · Quản trị.
- **Chuyển sinh hoạt 2 bước**: TransferRequest → TransferAccept/Reject; peer offline → yêu cầu giữ chờ, gửi lại được.
- **Đối soát on-chain/off-chain**: phát hiện sửa trái phép → khóa hồ sơ + cảnh báo + sự kiện ReportAnomaly.
- **Sao lưu/phục hồi có kiểm chứng**: DailyBackupHash lên ledger; chỉ snapshot hash khớp mới được phục hồi; ConfirmRecovery ghi bằng chứng.
- **Ledger Explorer**: xem block, giao dịch, endorsement, hash chain.
- **Xác minh công khai** (không cần đăng nhập) — sẵn sàng gắn QR code.
- **AI đọc ảnh chất lượng cao**: prompt chuyên sâu VNeID/thẻ CCCD + pipeline 2 lượt (tự kiểm tra - tự sửa) + độ tin cậy & cảnh báo; chọn model bằng `AI_VISION_MODEL` (gpt-4o-mini/gpt-4o/Gemini/Qwen-VL qua Ollama).
- **Giao diện Áo Đoàn**: 2 theme 🔴 Đoàn đỏ / 👕 Áo Đoàn xanh chuyển đổi tức thì, huy hiệu Đoàn SVG (2 bông lúa + cờ sao vàng) ở sidebar, đăng nhập và thẻ đoàn viên.
- **Nhập hồ sơ từ ảnh VNeID/CCCD + tự tạo tài khoản**: trang 📸 "Nhập từ ảnh" — quét QR định danh mức 2 bằng camera (giải mã offline trong trình duyệt bằng jsQR) hoặc AI Vision đọc ảnh chụp → cán bộ xác nhận → hệ thống tự tạo hồ sơ + tài khoản (username tự sinh, mật khẩu tạm hiện 1 lần) + tự ghi vết xác thực định danh lên ledger.
- **Định danh điện tử VNeID (ổ cắm sẵn)**: bộ kết nối chuẩn hóa `VNEID_PROVIDER=mock|http` — mock demo đủ 3 kịch bản (đạt/lệch/không tìm thấy); khi trường ký hợp đồng eKYC/Bộ Công an chỉ cần đổi cấu hình. Kết quả xác thực ghi vết `VerifyIdentity` lên ledger **không chứa CCCD** (xem `docs/04-dinh-danh-dien-tu-vneid.md`).
- **Lớp AI sẵn sàng**: `/api/ai/chat` chuẩn OpenAI-compatible — bật bằng biến môi trường (xem `docs/03-tich-hop-ai.md`).
- **Thẻ đoàn viên số + QR**: trang thẻ (khổ thẻ ATM, in được) chứa mã QR dẫn tới xác minh công khai kèm hash — quét là kiểm tra giả mạo; tải QR SVG, in thẻ có phương án QR dự phòng.
- **Dashboard thống kê nâng cao**: biểu đồ SVG thuần (không phụ thuộc thư viện ngoài) — donut loại hoạt động, xu hướng kết nạp, cấu trúc giới tính, phân bố giao dịch theo hàm chaincode, sức khỏe đối soát hash, luồng chuyển sinh hoạt, hoạt động mới nhất — tất cả theo phạm vi quyền.
- **Giao diện responsive** cho máy tính và điện thoại (sidebar ↔ bottom navigation).

## 🚀 Chạy ngay (không cần Docker)

```bash
# 1) Backend (port 3000, đồng thời phục vụ giao diện đã build)
cd server && npm install && npm start

# 2) (Tùy chọn) xây lại giao diện
cd ../client && npm install && npm run build
```

Mở `http://localhost:3000`. Dữ liệu demo tự sinh: 5 đơn vị, 7 đoàn viên, 1 yêu cầu chuyển sinh hoạt đang chờ.

**Tài khoản demo** (mật khẩu chung `123456`):

| Tài khoản | Vai trò |
|---|---|
| quantri | Quản trị hệ thống |
| doantruong | Cán bộ Đoàn trường |
| lienchicntt | Liên chi đoàn CNTT&TT |
| chidoan01 / chidoan02 / chidoan03 | Bí thư các Chi đoàn |
| doanvien01…03 | Đoàn viên (chỉ đọc) |

## ⛓️ Chạy với mạng Hyperledger Fabric thật (có Docker)

Xem `docs/02-thiet-ke-he-thong.md` mục 6 — tóm tắt:

1. Bật fabric-samples test-network, channel `sochannel`, CA bật.
2. Deploy chaincode trong `server/chaincode/` (Node.js contract cùng logic với simulator).
3. `npm i @hyperledger/fabric-gateway`, đặt connection profile + ví CA vào `server/fabric-config/` & `server/fabric-identity/`.
4. Chạy `LEDGER_MODE=fabric npm start` — tầng API/giao diện không đổi.

## 🧪 Kiểm thử 8 kịch bản của đề cương

Đăng nhập **quantri** → trang *Quản trị & Đối soát*:

1. Tạo hồ sơ (đăng nhập chidoan01) → thấy giao dịch `CreateMemberProfile` trong Ledger.
2. Cập nhật hồ sơ → hash mới lên ledger, lịch sử cũ còn nguyên.
3. Đăng nhập doanvien01 → chỉ thấy hồ sơ mình, không ghi được gì.
4. Chuyển sinh hoạt: chidoan01 lập → chidoan02 tiếp nhận.
5. Đoàn viên/chi đoàn khác cố sửa → bị chặn (403, ACL).
6. Quản trị → Đối soát → "Giả lập can thiệp dữ liệu" → chạy Đối soát → hồ sơ khóa + cảnh báo.
7. Quản trị → Peer → tắt peer OrgChiDoan → lập chuyển sinh hoạt → bị hoãn (202) → bật lại → "Gửi lại".
8. Quản trị → Sao lưu → tạo snapshot → tamper → Phục hồi → chỉ snapshot hash khớp ledger được dùng, ConfirmRecovery ghi vết.

**Thẻ & QR:** mở hồ sơ một đoàn viên → nút 🪪 *Thẻ & QR* (hoặc đăng nhập `doanvien01` → menu *Thẻ đoàn viên*) → xem thẻ, in thẻ (Ctrl+P, chỉ thẻ được in), tải QR SVG. Quét QR bằng điện thoại → trang xác minh tự chạy và đối chiếu hash với ledger.

## 🤖 Bật lớp AI

```bash
export AI_API_KEY="sk-..."          # bắt buộc
export AI_BASE_URL="https://api.openai.com/v1"   # tùy chọn (Ollama: http://localhost:11434/v1)
export AI_MODEL="gpt-4o-mini"       # tùy chọn
npm start
```

## 🚀 Deploy lên VPS (1GB RAM · 10GB SSD)

Gói release chuẩn sẵn: `bash deploy/pack.sh` → upload file `releases/so-doan-vien-release-*.tar.gz` lên VPS → chạy `sudo bash deploy/deploy.sh --nginx`. Script tự tạo swap 2GB, tự cài Node 20, chạy bằng systemd (giới hạn 700MB RAM, tự restart), tùy chọn Nginx + gzip trên port 80. **Hướng dẫn từng bước:** `deploy/README-DEPLOY.md`. Lưu ý: VPS 1GB chạy `LEDGER_MODE=simulator` (đầy đủ nghiệp vụ demo); mạng Fabric thật cần VPS ≥4GB RAM.

## 📚 Tài liệu

- `docs/01-phan-tich-de-cuong.md` — phân tích đề cương, khoảng trống & cách xử lí, ánh xạ yêu cầu → module, kết quả 8 kịch bản.
- `docs/02-thiet-ke-he-thong.md` — kiến trúc 5 lớp, mô hình dữ liệu, ACL/endorsement, luồng nghiệp vụ, hướng dẫn Fabric thật + Caliper.
- `docs/03-tich-hop-ai.md` — lộ trình tích hợp mô hình AI (3 giai đoạn).
- `docs/04-dinh-danh-dien-tu-vneid.md` — tích hợp định danh điện tử VNeID: khả thi tới đâu, luồng, pháp lý, lộ trình 3 giai đoạn.
- Tài liệu API: `server/docs-src/api-endpoints.txt` (xem luôn trong app → trang **Tài liệu**).

## ⚠️ Lưu ý

Mật khẩu demo `123456`, JWT secret mặc định — **chỉ dùng cho nguyên mẫu nghiên cứu**, không dùng production. Dữ liệu_demo sinh tự động lần đầu chạy (xóa thư mục `server/data/` để nạp lại, hoặc bấm "Nạp lại dữ liệu demo" trong trang Quản trị).

## 🐙 Đưa dự án lên GitHub

Xem **`HUONG-DAN-GITHUB.md`** — 2 cách: kéo-thả qua web (~3 phút, dùng gói `releases/so-doan-vien-github-src.zip` đã loại node_modules) hoặc dòng lệnh git chuẩn (kèm hướng dẫn PAT/SSH). Repo đã có sẵn `.gitignore`, LICENSE MIT và GitHub Actions CI (tự build + health check mỗi lần push).

## 📦 Khi sao chép dự án sang máy khác

Thư mục `node_modules/` và `client/dist/` không được lưu trong snapshot workspace. Ở máy mới (hoặc phiên làm việc mới) chạy:

```bash
cd server && npm install && npm start     # server tự phục vụ API + giao diện ở port 3000
cd client && npm install && npm run build # chỉ cần khi chưa có client/dist
```
