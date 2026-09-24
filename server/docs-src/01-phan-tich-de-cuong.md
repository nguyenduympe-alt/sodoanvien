# PHÂN TÍCH ĐỀ CƯƠNG LUẬN VĂN
## "Xây dựng hệ thống định danh và quản lí sổ Đoàn viên dựa trên nền tảng Chuỗi khối"
**Học viên:** Nguyễn Văn Tài (M5124051) · **Cơ sở:** Trường CNTT & TT, Đại học Cần Thơ · **GVHD:** PGS.TS. Trần Công Án; TS. Bùi Võ Quốc Bảo · **Năm:** 2026

---

# 1. Tóm tắt đề cương

Đề tài xây dựng **hệ thống định danh và quản lí sổ Đoàn viên điện tử** cho phạm vi **một Đoàn trường/cơ sở đào tạo**, trên nền tảng **Hyperledger Fabric** (blockchain cấp phép), theo mô hình **kết hợp on-chain/off-chain**:

- **Off-chain (CSDL tập trung):** lưu hồ sơ chi tiết dài hạn (thông tin cá nhân, quá trình sinh hoạt, tài liệu minh chứng).
- **On-chain (Fabric ledger):** chỉ lưu **mã định danh nội bộ, mã băm (hash), trạng thái nghiệp vụ, nhật ký giao dịch, hash snapshot** — *không* lưu dữ liệu cá nhân nhạy cảm.
- **Mô hình tổ chức 4 cấp:** Đoàn trường → Liên chi đoàn/Đoàn khoa → Chi đoàn → Đoàn viên.
- **5 vai trò người dùng:** Đoàn viên (chỉ đọc), Cán bộ Chi đoàn (ghi), Cán bộ Liên chi đoàn (phê duyệt phạm vi), Cán bộ Đoàn trường (quản lí toàn đơn vị), Quản trị hệ thống (kỹ thuật, không thay vai trò nghiệp vụ).
- **11 hàm chaincode:** CreateMemberProfile, UpdateMemberProfile, RecordActivity, TransferRequest, TransferAccept, TransferReject, VerifyProfileHash, QueryMember, GetMemberHistory, RecordDailyBackupHash, ConfirmRecovery.
- **Chuyển sinh hoạt mô hình 2 bước** (TransferRequest → TransferAccept/Reject) thay vì giao dịch AND đồng thời 2 bên — tránh kẹt khi peer offline.
- **Cơ chế an toàn dữ liệu:** đối soát hash on-chain/off-chain → khóa hồ sơ bất thường → cảnh báo; phục hồi chỉ dùng snapshot có **DailyBackupHash** khớp ledger, xong ghi **ConfirmRecovery**.
- **Đánh giá:** 8 kịch bản chức năng + an toàn/phân quyền + benchmark **Hyperledger Caliper** (throughput, latency p50/p95/p99, success rate, tài nguyên) + thực nghiệm đối chứng 3 mô hình (CSDL thuần / quá nhiều dữ liệu on-chain / kết hợp đề xuất).
- **Kế hoạch:** 24 tuần (6 tháng), 8 đầu việc.

# 2. Điểm mạnh của đề cương

1. **Định vị đúng bài toán:** khẳng định rõ blockchain *không thay thế* CSDL mà là **lớp ghi vết - kiểm chứng** — phù hợp đặc thù dữ liệu cá nhân (tránh vi phạm bảo mật, tránh phình to ledger). Nhất quán với Nghị định 13/2023/NĐ-CP về bảo vệ dữ liệu cá nhân (tài liệu tham khảo [11]).
2. **Nghiệp vụ đi trước công nghệ:** đề cương đặt trọng tâm mô hình nghiệp vụ (vai trò, luồng, trạng thái) rồi mới chứng minh công nghệ — đúng hướng cho một luận văn ứng dụng.
3. **Thiết kế chuyển sinh hoạt 2 bước** là lựa chọn kỹ thuật sáng suộc: giảm rủi ro giao dịch kẹt, tăng tính sẵn sàng.
4. **Cơ chế phục hồi có kiểm chứng** (không tin bản sao lưu trừ khi hash khớp ledger) là đóng góp thực tế, giải quyết điểm yếu "bản sao lưu nào đáng tin" của hệ thống tập trung.
5. **Phương pháp đánh giá định lượng** (Caliper, 3 mô hình đối chứng) vượt mức một nguyên mẫu thông thường.
6. Phạm vi **giới hạn rõ** (một Đoàn trường, không liên thông tỉnh/Trung ương) — khả thi trong 6 tháng.

# 3. Các khoảng trống / rủi ro đã phân tích và cách hệ thống này xử lí

| # | Khoảng trống trong đề cương | Ảnh hưởng | Cách xử lí trong nguyên mẫu này |
|---|---|---|---|
| 1 | **Chưa định nghĩa chuẩn băm** chi tiết tới mức cài đặt (trường nào băm, chuẩn hóa thế nào khi CSDL đổi cấu trúc) | Sai lệch hash "ảo" khi code thay đổi, báo động giả | Hàm `profileCore()` duy nhất định nghĩa bộ trường đưa vào hash; mọi nơi (seed, tạo, cập nhật, đối soát) đều gọi chung 1 hàm; JSON canonical: sắp khóa, chuẩn hóa chuỗi; loại trường biến động (trạng thái workflow). Xem `server/src/canonical.js` |
| 2 | **Chưa nói quan hệ trạng thái ↔ hash:** trạng thái nghiệp vụ (chờ chuyển, bị khóa…) thay đổi liên tục, nếu đưa vào hash thì mọi chuyển trạng thái phải ghi 2 giao dịch | Phức tạp chaincode, tốn throughput | Hash chỉ bào **nội dung hồ sơ** (họ tên, ngày sinh, đơn vị…); trạng thái được theo dõi qua **loại giao dịch** trên ledger (TransferRequest đặt TRANSFER_PENDING, TransferAccept đặt ACTIVE) |
| 3 | **Chưa thiết kế khi endorsement thất bại ngoài kịch bản 7** (chỉ nêu peer offline cho chuyển sinh hoạt) | Dữ liệu DB và ledger lệch nhau không kiểm soát được | Quy tắc "ghi kép tất-hay-không-có-gì" cho tạo/cập nhật hồ sơ (lỗi ledger → hoàn tác DB); riêng TransferRequest khi peer offline được **giữ chờ ở tầng ứng dụng** + nút gửi lại — đúng tinh thần kịch bản 7 |
| 4 | **Endorsement policy cho từng nghiệp vụ chưa liệt kê tường minh** | Khó kiểm thử phân quyền | Bảng ACL + endorsement per-hàm trong `ledger/contract.js`: chi đoàn ký tổ chức mình; nghiệp vụ hệ thống (backup, recovery, anomaly) bắt buộc OrgQuanTri; TransferAccept có OrgDoanTruong chứng kiến |
| 5 | **Đoàn viên không có chứng thư Fabric** — đề cương nêu hướng nhưng chưa chỉ ra cách ràng buộc "chỉ đọc hồ sơ của mình" | Rò rỉ dữ liệu theo chiều ngang | JWT ứng dụng + **row-level security** ở tầng API: DOAN_VIEN chỉ truy vấn `memberId` gắn với tài khoản; CHI_DOAN theo unitId; LIEN_CHI theo cây đơn vị |
| 6 | **Giao diện** "có thể dừng ở mức minh họa" — nhưng với demo thực tế và hướng mở rộng (QR, mobile ở mục 9) cần rõ ràng hơn | Khó trình bày, khó mở rộng | Xây giao diện web **responsive PC/mobile** đầy đủ chức năng nhưng vẫn giữ trọng tâm nghiệp vụ; trang xác minh công khai sẵn sàng gắn QR |
| 7 | **Quản lí chứng thư CA/MSP** được nêu nhưng nguyên mẫu khó chứng minh thu hồi/cấp lại chứng thư | Kịch bản kiểm thử an toàn dữ liệu thiếu công cụ | Simulator mô phỏng định danh MSP theo vai trò + tổ chức; tính năng khóa/mở tài khoản mô phỏng thu hồi quyền ghi; adapter Fabric thật dùng Fabric CA khi triển khai |
| 8 | **Chưa chỉ ra chỗ cắm thêm công nghệ mới** (AI, QR, dashboard thống kê nằm rải rác ở mục 9) | Rủi ro "viết xong khó nâng cấp" | Kiến trúc phân lớp chuẩn REST + **endpoint `/api/ai/chat` chuẩn OpenAI-compatible** + tài liệu lộ trình AI (docs/03) — bật AI chỉ bằng biến môi trường |

# 4. Ánh xạ yêu cầu đề cương → module trong ứng dụng

| Yêu cầu đề cương (mục) | Module cài đặt | Ghi chú |
|---|---|---|
| Mô hình 4 cấp, 5 vai trò (8.1) | `auth.js` (scopeOf - row-level security), bảng `users/units` | Dữ liệu demo đủ 5 vai trò |
| Yêu cầu chức năng (8.2) | Toàn bộ `/api/*` | Xem `docs-src/api-endpoints.txt` |
| Kiến trúc 5 lớp (8.3) | client (React) → API (Express) → off-chain DB (SQLite) → ledger (simulator/Fabric) → snapshot (JSON files) | Đổi `LEDGER_MODE=fabric` để chạy Fabric thật |
| Định danh nội bộ, tách CCCD (8.6) | `members.id` dạng `DV-2026-xxxx`; CCCD chỉ ở off-chain, che (mask) khi hiển thị | Không dùng CCCD/phone làm khóa |
| CA/MSP, chứng thư (8.6) | `ledger/contract.js` (MSP_OF_ROLE), `ledger/simulator.js` (identityOf) | Đoàn viên không giữ chứng thư — không ghi được ledger |
| Mạng Fabric 3 tổ chức + endorsement (8.7) | 4 org mô phỏng: OrgChiDoan, OrgLienChi, OrgDoanTruong, OrgQuanTri; policy per-hàm | Tắt/bật peer trong giao diện Quản trị |
| Chuyển sinh hoạt 2 bước (8.7) | `/api/transfers` + TransferRequest/Accept/Reject trong contract | Đủ kịch bản peer offline + gửi lại |
| 11 hàm chaincode (8.8) | `ledger/contract.js` (mô phỏng) & `chaincode/sodoanvien-contract.js` (Fabric thật) | Cùng tên, cùng logic |
| JSON canonical + SHA-256 (8.9) | `canonical.js` (canonicalize, profileCore, profileHash) | Một hàm duy nhất mọi nơi |
| Đối soát, khóa, cảnh báo (8.9) | `services/reconcile.js`, trang Quản trị → Đối soát | ReportAnomaly + LOCKED_ANOMALY + alerts |
| DailyBackupHash / ConfirmRecovery (8.9) | `services/backup.js` (manifest hash từng bảng + hash tổng) | Snapshot lệch hash → từ chối phục hồi |
| 8 kịch bản đánh giá (8.10.1) | Đã kiểm thử tự động — kết quả ở mục 5 | |
| Benchmark Caliper (8.10.3) | Hướng dẫn ở `docs/02-thiet-ke-he-thong.md` mục 7 | Chạy được khi có mạng Fabric thật |

# 5. Kết quả kiểm thử 8 kịch bản của đề cương (đã chạy trên nguyên mẫu)

| STT | Kịch bản (đề cương Bảng 2) | Kết quả chạy thực tế |
|---|---|---|
| 1 | Chi đoàn tạo hồ sơ mới | ✅ Lưu off-chain + hash + giao dịch `CreateMemberProfile` lên ledger (có block) |
| 2 | Cập nhật thông tin/hoạt động | ✅ Hash mới ghi ledger, lịch sử cũ truy vấn được (GetMemberHistory) |
| 3 | Đoàn viên tra cứu cá nhân | ✅ Chỉ thấy hồ sơ của mình; mọi thao tác ghi bị từ chối (403) |
| 4 | Chuyển sinh hoạt 2 bước | ✅ TransferRequest (chờ) → TransferAccept → đổi đơn vị + ghi hash mới |
| 5 | Sai vai trò cập nhật | ✅ Chặn ở 2 lớp: API (403) và chaincode (ACL_DENIED); DB & ledger không đổi |
| 6 | Sửa trái phép off-chain | ✅ Đối soát phát hiện chính xác hồ sơ bị sửa → khóa + cảnh báo + chặn cập nhật tiếp |
| 7 | Peer đơn vị tiếp nhận offline | ✅ Giao dịch thiếu endorsement bị hoãn, yêu cầu KHÔNG mất, gửi lại thành công khi peer online |
| 8 | Khôi phục từ snapshot | ✅ Chỉ snapshot hash khớp ledger mới dùng được; ConfirmRecovery ghi vết; hồ sơ mở khóa sau khi hash khớp lại; snapshot bị can thiệp → bị từ chối |

# 6. Đánh giá tổng thể & khuyến nghị cho luận văn

**Khả thi:** toàn bộ phạm vi cốt lõi đã chứng minh chạy được; thời lượng 24 tuần là hợp lí nếu phân bổ theo bảng kế hoạch (mạng Fabric thật tốn ~3 tuần đầu cho Docker/CA/channel).

**Khuyến nghị:**
1. **Ưu tiên chuẩn hóa hash sớm** (tuần 5–6): quyết định bộ trường băm và giữ nguyên tới khi nộp; mọi thay đổi sau đó phải chạy lại đối soát toàn bộ.
2. **Viết chaincode thật song song với mô phỏng** (đã chuẩn bị sẵn `chaincode/sodoanvien-contract.js`) để không mất thời gian "chuyển đổi" ở tuần 13–16.
3. **Chạy Caliper trên mạng 2 org trở lên** với kịch bản Create/Update/Transfer theo đúng 4 mức tải (10/25/50/100 tps) — kết quả so sánh 3 mô hình nên trình bày thành bảng + đồ thị.
4. **Bảo mật dữ liệu cá nhân:** bổ sung mã hóa trường cho CCCD/phone ở off-chain (AES-GCM với khóa ngoài DB) — nêu trong "hướng phát triển", nguyên mẫu đã tách và mask dữ liệu nhạy cảm.
5. **Mở rộng AI/QR** (mục 9 đề cương) dùng chính kiến trúc đã dựng: endpoint `/api/ai/chat` + trang xác minh công khai — chi tiết `docs/03-tich-hop-ai.md`.
