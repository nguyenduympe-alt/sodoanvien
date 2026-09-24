# THIẾT KẾ HỆ THỐNG — Nguyên mẫu "Sổ Đoàn viên số"

# 1. Kiến trúc 5 lớp (đề cương mục 8.3)

```
┌───────────────────────────────────────────────────────────────┐
│ Lớp 1 · GIAO DIỆN (React + Vite, responsive PC/mobile)        │
│   Login · Dashboard · Đoàn viên · Chuyển sinh hoạt ·           │
│   Ledger Explorer · Quản trị/Đối soát · Xác minh · Trợ lí AI   │
├───────────────────────────────────────────────────────────────┤
│ Lớp 2 · BACKEND/API (Node.js + Express)                       │
│   JWT + row-level security · kiểm tra vai trò · audit log      │
│   /api/*  (xem docs-src/api-endpoints.txt)                     │
├──────────────────────────────┬────────────────────────────────┤
│ Lớp 3 · OFF-CHAIN DB         │ Lớp 4 · FABRIC LEDGER          │
│ SQLite (đổi PostgreSQL dễ)   │ LEDGER_MODE=simulator          │
│ users, units, members,       │  → mô phỏng block/hash-chain/  │
│ activities, transfers,       │    MSP/endorsement, chạy mọi nơi│
│ alerts, audit, meta          │ LEDGER_MODE=fabric             │
│                              │  → Fabric Gateway + test-network│
├──────────────────────────────┴────────────────────────────────┤
│ Lớp 5 · KHO SNAPSHOT (data/snapshots/*.json + manifest hash)   │
└───────────────────────────────────────────────────────────────┘
        (Tùy chọn) Lớp AI: POST /api/ai/chat → OpenAI-compatible
```

**Quy tắc ghi kép (tất-hay-không-có-gì):** API cập nhật off-chain DB → tính `profileHash` (SHA-256 trên JSON canonical) → submit giao dịch lên ledger. Ledger từ chối (sai quyền, peer offline, hồ sơ khóa) → hoàn tác, không ghi DB.

# 2. Mô hình dữ liệu

**Off-chain (SQLite):**
- `units(id, name, type CHI_DOAN|LIEN_CHI, parentId)`
- `users(id, username, passwordHash, displayName, role, unitId, memberId, active)` — role ∈ {DOAN_VIEN, CHI_DOAN, LIEN_CHI, DOAN_TRUONG, QUAN_TRI}
- `members(id DV-2026-xxxx, memberCode, fullName, dob, gender, cccd?, phone?, email?, className, unitId, joinDate, joinPlace, homeAddress, status, profileHash, lastTxId, …)`
- `activities(id, memberId, type, title, detail, activityDate, hash, txId, createdBy)`
- `transfers(id CCH-xxx, memberId, fromUnit, toUnit, reason, status, requestedBy, decidedBy, txId, decidedTxId, …)`
- `alerts(id, type TAMPER|SYNC, severity, memberId, message, status)`
- `audit(id, username, role, action, detail, ip, createdAt)` + `meta(key,value)`

**On-chain (world state của ledger — KHÔNG có dữ liệu cá nhân):**
- `MEMBER::<id>` → { memberCode, unitId, unitName, profileHash, status, createdBy, lastTxId }
- `HISTORY::<memberId>` → [{ txId, type, hash, actor, actorMsp, ts, note }]
- `TRANSFER::<id>` → { memberId, fromUnit, toUnit, reason, status PENDING|ACCEPTED|REJECTED, … }
- `BACKUP::<snapshotId>` → { snapshotHash, manifestHash, stats, status RECORDED|USED }
- `RECOVERY::<id>` → bằng chứng ConfirmRecovery · `ANOMALY::<memberId>` → bằng chứng ReportAnomaly

**Nội dung băm hồ sơ (`profileCore`)** — bộ trường cố định, dùng chung mọi nơi:
`{id, memberCode, fullName, dob, gender, className, unitId, joinDate, joinPlace, phone, email, homeAddress}`
— loại: `status` (theo dõi qua loại giao dịch), `unitName` (dẫn xuất từ unitId), `notes`, trường kỹ thuật.

# 3. Chính sách ACL & endorsement theo hàm chaincode

| Hàm | Ai được gọi (vai trò) | Endorsement bắt buộc |
|---|---|---|
| CreateMemberProfile | CHI_DOAN (đơn vị mình), DOAN_TRUONG | Org của người gọi |
| UpdateMemberProfile | CHI_DOAN (đơn vị đang quản lí), DOAN_TRUONG | Org của người gọi |
| RecordActivity | CHI_DOAN, DOAN_TRUONG | Org của người gọi |
| TransferRequest | CHI_DOAN (đơn vị chuyển đi), DOAN_TRUONG | Org của người gọi |
| TransferAccept/Reject | CHI_DOAN (đơn vị tiếp nhận), LIEN_CHI, DOAN_TRUONG | Org người gọi + OrgDoanTruong |
| ReportAnomaly / UnlockMember | QUAN_TRI | OrgQuanTri |
| RecordDailyBackupHash / ConfirmRecovery | QUAN_TRI | OrgQuanTri |
| QueryMember / GetMemberHistory / VerifyProfileHash / QueryBackup | mọi định danh đã xác thực (phạm vi do API kiểm soát) | đọc — không cần endorsement |

Không hàm nào yêu cầu AND đồng thời 2 tổ chức (trừ ngày chuyển sinh hoạt tách 2 bước — đề cương mục 8.7).

# 4. Luồng nghiệp vụ chính

**Tạo hồ sơ:** Cán bộ Chi đoàn nhập form → API validate (mã không trùng, đơn vị hợp lệ) → `CreateMemberProfile` → DB insert + block mới.

**Chuyển sinh hoạt 2 bước:**
1. Chi đoàn A lập `TransferRequest` → trạng thái hồ sơ `TRANSFER_PENDING` (peer A offline → giữ chờ, gửi lại sau).
2. Chi đoàn B (hoặc Liên chi/Đoàn trường) `TransferAccept` → ledger đổi unit + trạng thái ACTIVE → API cập nhật DB + hash mới (`UpdateMemberProfile`). `TransferReject` → trả ACTIVE, giữ nguyên đơn vị.

**Đối soát (định kỳ hoặc thủ công):** với từng hồ sơ: hash(off-chain) ?= hash trên ledger → lệch: `ReportAnomaly` + khóa `LOCKED_ANOMALY` + cảnh báo CRITICAL; khớp lại sau phục hồi → `UnlockMember`.

**Sao lưu/phục hồi:** snapshot = JSON toàn bộ bảng; manifest {snapshotId, thời điểm, số bản ghi, hash từng bảng} → `snapshotHash = SHA-256(manifest canonical)` → `RecordDailyBackupHash`. Phục hồi: hash tệp hiện tại ?= hash tệp ?= hash ledger, thiếu 1 → từ chối; đạt → restore trong 1 transaction → `ConfirmRecovery`.

# 5. Bảo mật

- **Xác thực:** JWT (12h) — Đoàn viên dùng tài khoản ứng dụng, không cần chứng thư Fabric (mục 8.6).
- **Phân quyền 2 lớp:** API (vai trò + phạm vi đơn vị/đoàn viên) và chaincode (ACL theo MSP).
- **Dữ liệu nhạy cảm:** CCCD/phone/email chỉ off-chain; hiển thị có mask; số liệu đưa ra ngoài (verify công khai, AI context) không chứa nhạy cảm.
- **Chống sửa lịch sử:** block hash-chain; sửa 1 tx bất kì → hash block sai → gãy chuỗi.
- **Audit log** mọi thao tác ghi, kể cả demo tamper.

# 6. Chạy với mạng Fabric thật (khi có Docker)

1. Cài fabric-samples, bật test-network: `./network.sh up createChannel -c sochannel -ca`
2. Deploy chaincode: `server/chaincode/deploy-testnet.sh` (chaincode Node.js `sodoanvien-contract.js`).
3. Xuất connection profile + ví định danh (Fabric CA) vào `server/fabric-config/`, `server/fabric-identity/`.
4. `npm i @hyperledger/fabric-gateway` rồi chạy `LEDGER_MODE=fabric npm start`.
Tầng API và giao diện **không đổi dòng code nào** (adapter `ledger/fabricGateway.js` cung cấp cùng giao diện submit/query).

# 7. Đo hiệu năng bằng Hyperledger Caliper (kế hoạch cho luận văn)

- Workload: CreateMemberProfile, UpdateMemberProfile, TransferRequest, TransferAccept, VerifyProfileHash, QueryMemberHistory.
- Mức tải: fixed-rate 10 / 25 / 50 / 100 tps; đo TPS, latency (avg/min/max, p50/p95/p99), success rate, CPU/RAM/IO của peer, orderer, chaincode container, SQLite, backend.
- Đối chứng: (a) SQLite thuần không ledger; (b) lưu toàn bộ hồ sơ on-chain; (c) mô hình kết hợp đề xuất → bảng + đồ thị so sánh độ trễ, khả năng lưu vết, chi phí.

# 9. Thẻ đoàn viên số + QR và dashboard thống kê nâng cao (mở rộng mục 9 đề cương)

**Thẻ đoàn viên số (route `#/members/:id/card`, `#/mycard`):**
- Thẻ khổ chuẩn thẻ ATM (tỉ lệ 1.586), in trực tiếp từ trình duyệt (CSS `@media print` chỉ giữ thẻ), kèm **QR dự phòng phóng to** dán hồ sơ giấy.
- Nội dung QR: URL xác minh công khai `#/verify?code=<memberCode>&hash=<profileHash>` → điện thoại quét là ra kết quả **kèm đối chiếu hash với ledger** (không chỉ tra mã).
- QR sinh **offline trong trình duyệt** bằng thư viện `qrcode-generator` (MIT) nhúng sẵn tại `client/src/vendor/` — không gọi dịch vụ ngoài, không rò rỉ dữ liệu.
- Download QR dạng SVG để in trên thẻ vật lý/laminated.

**Dashboard thống kê nâng cao:**
- Toàn bộ biểu đồ là **SVG tự viết** (`client/src/charts.jsx`: Donut, VBars, HBars, Legend) — không thêm dependency, in được, nhẹ cho điện thoại.
- Widgets: chỉ số tổng quan (có cảnh báo đoàn viên chưa hoạt động), donut loại hoạt động, cột xu hướng kết nạp (tự chuyển sang theo năm khi dữ liệu >14 tháng), donut giới tính, cột ngang đoàn viên/đơn vị, phân bố giao dịch theo hàm chaincode (`ledger.txStats`), luồng chuyển sinh hoạt theo trạng thái + gần nhất, sức khỏe đối soát hash (lần gần nhất, số khớp/lệch), hoạt động mới nhất.
- Tất cả aggregate tại `GET /api/stats` đều áp dụng **row-level scope** như danh sách đoàn viên — vai trò nào thấy đúng dữ liệu của mình.

# 10b. Giao diện "Áo Đoàn" — theme xanh đồng phục + huy hiệu Đoàn

- **Huy hiệu Đoàn TNCS Hồ Chí Minh** vẽ SVG thuần (hai bông lúa vàng + cờ đỏ sao vàng): hiển thị ở sidebar, thanh mobile, trang đăng nhập và **thẻ đoàn viên** — sắc nét mọi kích thước, không cần file ảnh.
- **2 theme chuyển đổi tức thì** (nút trong sidebar + thanh mobile, lưu localStorage):
  - 🔴 **Đoàn đỏ** — mặc định (đỏ truyền thống cờ Đoàn).
  - 👕 **Áo Đoàn xanh** — xanh đồng phục: sidebar, nút, thẻ đoàn viên, trang đăng nhập đổi sang tông xanh; cảnh báo vẫn giữ màu đỏ để không gây nhầm lẫn.
- Kĩ thuật: màu chủ đạo tham số hóa bằng CSS variables (`--red`, `--red-dark`, `--red-mid`, `--card-c1..3`…); theme chỉ là khối `body[data-theme='aodoan']` ghi đè biến — thêm theme mới ≈ 20 dòng CSS.

# 11. Cấu trúc mã nguồn

```
so-doan-vien/
├─ client/                 # Giao diện React (build ra dist/, server phục vụ luôn)
│  ├─ src/charts.jsx       # Biểu đồ SVG thuần (Donut, VBars, HBars, Legend)
│  ├─ src/lib/qr.js        # Sinh QR SVG offline (verifyUrl)
│  ├─ src/vendor/          # qrcode-generator (MIT, nhúng cục bộ)
│  └─ src/pages/           # Dashboard, Members, MemberDetail, MemberCard, Intake, Transfers,
│                          # Ledger, Admin, Verify, Docs, Assistant, Login
├─ server/
│  ├─ src/
│  │  ├─ index.js          # Express, mount routes, phục vụ client
│  │  ├─ canonical.js      # ★ JSON canonical + SHA-256 + profileCore
│  │  ├─ db.js             # Off-chain SQLite + seed dữ liệu demo
│  │  ├─ auth.js           # JWT, phân quyền, row-level scope, audit
│  │  ├─ ledger/
│  │  │  ├─ contract.js    # ★ 11 hàm chaincode + ACL + endorsement policy
│  │  │  ├─ simulator.js   # Mô phỏng Fabric: block, MSP, peer on/off
│  │  │  └─ fabricGateway.js # Adapter Fabric thật (LEDGER_MODE=fabric)
│  │  ├─ routes/           # auth, members, transfers, admin, misc
│  │  └─ services/         # reconcile.js (đối soát), backup.js (snapshot)
│  ├─ chaincode/           # Chaincode thật cho Fabric + script deploy
│  └─ data/                # offchain.db, ledger.json, snapshots/ (sinh tự động)
├─ deploy/                 # ★ Triển khai VPS: pack.sh, deploy.sh, systemd, nginx, hướng dẫn
├─ releases/               # Gói release .tar.gz (chạy deploy/pack.sh để tạo)
└─ docs/                   # Tài liệu phân tích & thiết kế (bản .md)
```
