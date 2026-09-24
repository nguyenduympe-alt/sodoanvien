# 10. Kiểm tra mức độ phù hợp: Thiết kế ↔ Sơ đồ nghiệp vụ đề cương

> Bảng đối chiếu giữa **sơ đồ 3 cột** (Vai trò sử dụng → Quy trình nghiệp vụ chính → Kho dữ liệu và hạ tầng tin cậy) trong đề cương luận văn và **hệ thống đã xây dựng** (nguyên mẫu Sổ Đoàn viên số).
> Mọi kết luận dưới đây được trích trực tiếp từ mã nguồn: `server/src/auth.js`, `server/src/ledger/contract.js`, `server/chaincode/sodoanvien-contract.js`, `server/src/routes/*.js`, `server/src/services/*.js`.

**Kết luận tổng quát: KHỚP 14/14 thành phần sơ đồ (100%); 3 điểm mở rộng/diễn giải cần nêu rõ khi bảo vệ — xem §4.**

---

## 1. Cột 1 — VAI TRÒ SỬ DỤNG (5/5 khớp)

| # | Sơ đồ đề cương | Triển khai trong code | Bằng chứng | Kết quả |
|---|---|---|---|---|
| 1 | **Đoàn viên** — xem hồ sơ, yêu cầu tra cứu | Role `DOAN_VIEN`; phạm vi dữ liệu `SELF` (chỉ hồ sơ mình); menu chỉ có: Bảng điều khiển, Thẻ đoàn viên, Chuyển sinh hoạt, Ledger, Xác minh; **không giữ chứng thư Fabric → mọi giao dịch ghi bị từ chối** (`ACL_DENIED`, đúng đề cương mục 8.6) | `auth.js` scopeOf; `simulator.js` identityOf; `App.jsx` menu roles | ✅ Đúng |
| 2 | **Cán bộ Chi đoàn** — tạo hồ sơ, cập nhật hoạt động | Role `CHI_DOAN`; phạm vi `UNITS:[đơn vị mình]`; được: tạo hồ sơ (`POST /members`, `/intake/enroll`), cập nhật (`PATCH`), ghi hoạt động, đề nghị chuyển sinh hoạt | `routes/members.js`, `routes/transfers.js` | ✅ Đúng |
| 3 | **Liên chi đoàn / Đoàn khoa** — rà soát xác nhận phạm vi đơn vị | Role `LIEN_CHI`; phạm vi **cây đơn vị** (`units WHERE parentId=?`); duyệt/từ chối chuyển sinh hoạt; dùng AI tra-soát nhập liệu | `auth.js` scopeOf (LIEN_CHI); ACL `TransferAccept/Reject` | ✅ Đúng * |
| 4 | **Cán bộ Đoàn trường** — phê duyệt, giám sát toàn đơn vị | Role `DOAN_TRUONG`; phạm vi `ALL`; có toàn quyền nghiệp vụ; tổ chức `OrgDoanTruongMSP` **bắt buộc ký** mọi quyết định chuyển sinh hoạt (endorsement policy) | `simulator.js` endorsementOrgs | ✅ Đúng ** |
| 5 | **Quản trị hệ thống** — tài khoản, chứng thực backup/khôi phục | Role `QUAN_TRI`; **chỉ** `/admin/*` (users, backup, restore, reconcile, peers); **không có quyền nghiệp vụ hồ sơ** — tách bạch đúng như sơ đồ | `routes/admin.js` toàn bộ gate `requireAuth('QUAN_TRI')` | ✅ Đúng |

\* Xem §4.2 — "rà soát" hiện thực hóa qua duyệt chuyển sinh hoạt + tầm nhìn cây đơn vị, chưa có bước duyệt hồ sơ 2 cấp.
\*\* Xem §4.1 — Đoàn trường rộng hơn mũi tên vẽ trên sơ đồ (có mọi quyền 1–4).

## 2. Cột 2 — QUY TRÌNH NGHIỆP VỤ CHÍNH (5/5 khớp, đúng cả tên hàm)

| # | Sơ đồ đề cương | Triển khai | Hàm chaincode / API | Kết quả |
|---|---|---|---|---|
| 1 | **Tạo hồ sơ** — cấp mã định danh nội bộ | Tạo tay hoặc nhập từ ảnh VNeID/CCCD (AI); tự sinh mã `DVyyyyNNNN`; hash hồ sơ ghi ledger ngay | `CreateMemberProfile` · `POST /api/members`, `POST /api/intake/enroll` | ✅ Đúng |
| 2 | **Cập nhật hồ sơ** — thông tin, hoạt động, trạng thái | Sửa hồ sơ; ghi hoạt động/đánh giá/khen thưởng/kỉ luật; mọi lần ghi tính hash SHA-256 (JSON canonical) | `UpdateMemberProfile`, `RecordActivity` · `PATCH /members/:id`, `POST /members/:id/activities` | ✅ Đúng |
| 3 | **Chuyển sinh hoạt** — `TransferRequest -> Accept/Reject` | Đúng 2 bước đúng tên; peer offline → yêu cầu giữ chờ, gửi lại được (`/transfers/:id/retry`); Đoàn trường chứng kiến (endorsement) | `TransferRequest`, `TransferAccept`, `TransferReject` | ✅ Đúng |
| 4 | **Tra cứu và xác minh** — đọc hồ sơ + đối chiếu hash | Đọc kèm lịch sử ledger; xác minh công khai **không cần đăng nhập** `/api/verify?code&hash` → `hashMatch`; QR trên thẻ đoàn viên trỏ tới trang này | `VerifyProfileHash`, `QueryMember`, `GetMemberHistory` · trang `/verify` (public) | ✅ Đúng |
| 5 | **Đối soát và khôi phục** — `DailyBackupHash + ConfirmRecovery` | Đối soát: tính lại hash off-chain so với ledger → lệch thì `ReportAnomaly` + **khóa hồ sơ** `LOCKED_ANOMALY`; khớp lại → `UnlockMember`. Backup: snapshot + `snapshotHash`/`manifestHash`; phục hồi chỉ chấp nhận snapshot có hash khớp ledger, xong ghi `ConfirmRecovery` | `RecordDailyBackupHash`, `ConfirmRecovery`, `ReportAnomaly`, `UnlockMember` · `/admin/reconcile`, `/admin/backup`, `/admin/restore` | ✅ Đúng |

## 3. Cột 3 — KHO DỮ LIỆU VÀ HẠ TẦNG TIN CẬY (4/4 khớp)

| # | Sơ đồ đề cương | Triển khai | Kết quả |
|---|---|---|---|
| 1 | **CSDL Off-chain** — lưu hồ sơ chi tiết dài hạn | SQLite (`better-sqlite3`): members, activities, evaluations, transfers, users, audit… đầy đủ chi tiết | ✅ Đúng |
| 2 | **Hyperledger Fabric Ledger** — lưu hash, giao dịch, trạng thái xác minh | Ledger lưu `profileHash`, lịch sử tx, trạng thái xác minh danh tính; 13 hàm chaincode + endorsement policy; **nguyên mẫu chạy `LEDGER_MODE=simulator`** (chaincode thật, hạ tầng mô phỏng) — chuyển Fabric thật bằng `LEDGER_MODE=fabric` qua `fabricGateway.js` | ✅ Đúng (xem §4.3) |
| 3 | **CA / MSP / Chứng thư số** — xác thực và phân quyền chủ thể | 2 lớp: JWT lớp ứng dụng + ánh xạ danh tính MSP theo vai trò (`MSP_OF_ROLE`, `identityOf`); Đoàn viên không cấp chứng thư; ACL chaincode chặn sai quyền (`ACL_DENIED`) | ✅ Đúng |
| 4 | **Kho Snapshot / Backup** — bản sao lưu định kỳ có hash xác minh | `server/data/snapshots/*.json`: manifest + hash từng bảng + `snapshotHash` SHA-256 canonical; đối chiếu ledger bằng `QueryBackup` trước khi phục hồi | ✅ Đúng (xem §4.4) |

**Mũi tên giữa các khối** — khớp hết: bước 1–5 đều ghi vào Fabric Ledger; bước 1–2 ghi chi tiết vào CSDL Off-chain; bước 4 dùng CA/MSP (xác minh công khai, không cần JWT, ký bởi định danh MSP); bước 5 nối Snapshot + Ledger; Đoàn viên chỉ nối tới bước 4 (không ghi); Quản trị chỉ nối tới bước 5.

## 4. Các điểm cần nêu khi bảo vệ (không phải lỗi thiết kế)

### 4.1 Cán bộ Đoàn trường có quyền rộng hơn mũi tên trên sơ đồ
Sơ đồ chỉ vẽ Đoàn trường → bước 4. Thực tế code cho Đoàn trường toàn quyền các bước 1–4 (tạo/sửa/chuyển/duyệt) — **phù hợp đúng chữ** "phê duyệt, giám sát toàn đơn vị" và endorsement `OrgDoanTruongMSP`. Nên giữ; nếu cần khớp hình 100% thì thu ACL, nhưng sẽ bất tiện về nghiệp vụ.

### 4.2 "Rà soát xác nhận" của Liên chi chưa phải bước duyệt hồ sơ 2 cấp
Hiện tại: Chi đoàn tạo hồ sơ → có hiệu lực **ngay**; Liên chi "rà soát" qua (a) duyệt/từ chối chuyển sinh hoạt, (b) tầm nhìn toàn cây đơn vị. Nếu giảng viên hiểu "rà soát xác nhận" là một **gate phê duyệt hồ sơ** (Chi đoàn tạo → Liên chi duyệt → mới lên sổ), cần bổ sung trạng thái `PENDING_REVIEW` + API duyệt — ước lượng ~1 ngày code (bảng `member_reviews`, 2 route, ACL `LIEN_CHI`, 1 trạng thái chaincode).

### 4.3 Ledger là bản mô phỏng trong nguyên mẫu
Toàn bộ logic chaincode, ACL, endorsement là thật và dùng chung interface với Fabric; hạ tầng共识 (Raft/orderer, kênh, couchdb) được mô phỏng. Chuyển chế độ bằng biến môi trường `LEDGER_MODE=fabric` — cần máy ≥4GB RAM (VPS 1GB/10GB chỉ chạy simulator — đã ghi trong tài liệu deploy).

### 4.4 Backup "định kỳ" hiện tạo bằng tay
Tên hàm `RecordDailyBackupHash` phản ánh ý đồ chạy hằng ngày, nhưng nguyên mẫu chỉ tạo khi bấm `POST /admin/backup`. Khuyến nghị: thêm systemd timer/cron 1 dòng trên VPS để chạy tự động 00:30 hằng ngày.

## 5. Ma trận truy vết tóm tắt

```
Sơ đồ                          →  Code
─────────────────────────────────────────────────────────────
Đoàn viên                      →  DOAN_VIEN  (SELF, read-only, không MSP)
Cán bộ Chi đoàn                →  CHI_DOAN   (UNITS:1, tạo/sửa/hoạt động/chuyển)
Liên chi đoàn / Đoàn khoa      →  LIEN_CHI   (cây đơn vị, duyệt chuyển sinh hoạt)
Cán bộ Đoàn trường             →  DOAN_TRUONG (ALL, mọi nghiệp vụ + endorsement)
Quản trị hệ thống              →  QUAN_TRI   (chỉ /admin/*, backup/khôi phục/tài khoản)
1. Tạo hồ sơ                   →  CreateMemberProfile  + DVyyyyNNNN
2. Cập nhật hồ sơ              →  UpdateMemberProfile / RecordActivity
3. Chuyển sinh hoạt            →  TransferRequest → Accept/Reject (+retry)
4. Tra cứu và xác minh         →  VerifyProfileHash + /api/verify (public, QR)
5. Đối soát và khôi phục       →  ReportAnomaly/Unlock + RecordDailyBackupHash/ConfirmRecovery
CSDL Off-chain                 →  SQLite (better-sqlite3)
Hyperledger Fabric Ledger      →  simulator (chaincode thật) / LEDGER_MODE=fabric
CA / MSP / Chứng thư số        →  JWT + MSP_OF_ROLE + ACL 2 lớp + endorsement
Kho Snapshot / Backup          →  server/data/snapshots + hash canonical SHA-256
─────────────────────────────────────────────────────────────
Kết quả: 14/14 thành phần khớp (100%), 4 điểm diễn giải/mở rộng nêu tại §4
```

---

## 6. Bổ sung: kiểm tra mặt QUẢN TRỊ theo sơ đồ luồng D1–D4 (sơ đồ lần 2)

Sơ đồ phiên bản luồng (5 tiến trình × 4 kho dữ liệu D1–D4, actor "Cán bộ Đoàn cấp trên"). Kiểm chứng từng luồng quản trị với mã nguồn:

| # | Luồng trên sơ đồ | Triển khai | Bằng chứng | Kết quả |
|---|---|---|---|---|
| Q1 | Quản trị → *Quản lí tài khoản / phân quyền* | Đủ CRU(D): liệt kê, tạo tài khoản gán vai trò + đơn vị, khóa/mở (`active`), đặt lại mật khẩu; **chống tự khóa chính mình**; mọi thao tác ghi `audit` | `GET/POST /admin/users`, `PATCH /admin/users/:id`; `auth.js` `audit()` | ✅ Đúng |
| Q2 | Thu hồi định danh (D3: *cấp phát / thu hồi / kiểm tra chứng thư*) | Khóa tài khoản → **chết ngay lập tức**: mọi request kiểm tra `active=1` trong DB trước khi xử lí (token cũ vô hiệu); Fabric thật: CA enroll/revoke qua `LEDGER_MODE=fabric` | `auth.js` dòng `WHERE id=? AND active=1`; `simulator.js` MSP_OF_ROLE | ✅ Đúng |
| Q3 | Khối 5 → Quản trị: *Cảnh báo bất đồng bộ / kết quả khôi phục* | Đối soát lệch hash → `ReportAnomaly` (ACL chỉ QUAN_TRI) + khóa hồ sơ +insert bảng `alerts`; khôi phục trả về kết quả + báo cáo đối soát sau phục hồi; từ chối snapshot hash lệch (HTTP 409) | `reconcile.js`, `POST /admin/restore`, `GET /admin/alerts`, `POST /admin/alerts/:id/resolve` | ✅ Đúng |
| Q4 | Khối 5 ⇢ D2 (nét đứt): *Ghi DailyBackupHash / ConfirmRecovery* | Đúng tên hàm, đúng chủ thể: ACL `RecordDailyBackupHash` = `[QUAN_TRI]`, `ConfirmRecovery` = `[QUAN_TRI]` | `ledger/contract.js`; `services/backup.js` | ✅ Đúng |
| Q5 | Khối 5 → D4: *Đọc snapshot / backup* | Snapshot lưu file manifest + hash từng bảng; **bắt buộc** `QueryBackup` đối chiếu hash với ledger trước khi phục hồi | `backup.js` listSnapshots/restoreSnapshot | ✅ Đúng |
| Q6 | Quản trị KHÔNG đụng nghiệp vụ hồ sơ (tách bạch nghĩa vụ) | `admin.js` không có route nào sửa members/activities nghiệp vụ (trừ `/admin/dev/tamper` — route demo cố ý để kịch bản kiểm tra đối soát) | toàn văn `routes/admin.js` | ✅ Đúng |

### Hai lỗi vẽ trên sơ đồ (không phải lỗi hệ thống)
1. **Mũi tên "Quản lí tài khoản / phân quyền" trỏ vào khối 4** — về ngữ nghĩa phải trỏ vào **khối 1 (Quản lí định danh và xác thực)**: tài khoản/phân quyền/thu hồi thuộc lĩnh vực định danh (D3). Hệ hiện thực đặt đúng chỗ này (auth + `/admin/users` + ánh xạ MSP). **Khuyến nghị sửa hình.**
2. **Hai mũi tên ghi vào D1 ("Lưu dữ liệu chi tiết hồ sơ", "Cập nhật trạng thái sinh hoạt") bắt đầu từ khối 4** — khối tra cứu/xác minh trong hệ thống **chỉ đọc** (+ ghi audit). Ghi D1 thuộc các khối 2 (cập nhật hồ sơ), 3 (chuyển sinh hoạt đổi đơn vị/trạng thái), 5 (khóa/mở hồ sơ). **Khuyến nghị đưa 2 mũi tên này về khối 2/3.**

### Một khoảng trống vận hành
- D4 ghi chú *backup định kỳ* nhưng nguyên mẫu tạo snapshot **bằng tay** → nên thêm systemd timer chạy `POST /admin/backup` 00:30 hằng ngày (cấu hình ~15 phút, không đổi code).

**Kết luận mặt quản trị: THIẾT KẾ ĐÚNG 6/6 luồng; sơ đồ cần sửa 2 mũi tên cho khớp hiện thực; nên bật backup tự động.**
