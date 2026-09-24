# 🚀 HƯỚNG DẪN DEPLOY LÊN VPS (1GB RAM · 10GB SSD)

Ứng dụng được **thiết kế để vừa với VPS cấu hình thấp này**: không cần Docker, không cần build trên VPS, chạy bằng systemd (không dùng pm2 để tiết kiệm RAM), tự tạo swap, tự giới hạn bộ nhớ Node.

> ⚠️ Quan trọng: trên VPS 1GB **chỉ chạy được chế độ `LEDGER_MODE=simulator`** (mô phỏng sổ cái đã xây sẵn — đủ toàn bộ nghiệp vụ: hash, block, endorsement, đối soát, sao lưu). Muốn chạy mạng Hyperledger Fabric thật cần VPS tối thiểu 4GB RAM; chỉ cần đổi `LEDGER_MODE=fabric` là hệ thống chuyển qua, không sửa code.

---

## 1. Chuẩn bị (5 phút)

- VPS: Ubuntu 20.04/22.04/24.04 hoặc Debian 11/12 (x86-64 hoặc ARM64 đều được), quyền root
- File gói release: `so-doan-vien-release-<ngày-giờ>.tar.gz` (trong thư mục `releases/` của dự án — nếu chưa có, chạy `bash deploy/pack.sh` để tạo)

## 2. Upload gói lên VPS

Trên **máy của bạn** (thay `IP_VPS`):

```bash
scp releases/so-doan-vien-release-*.tar.gz root@IP_VPS:/root/
ssh root@IP_VPS
```

## 3. Cài đặt tự động (chạy 1 lệnh)

Trên **VPS**:

```bash
cd /root
tar -xzf so-doan-vien-release-*.tar.gz -C /root/app --one-top-level   # nếu chưa có thư mục app: mkdir -p /root/app trước
cd /root/app
sudo bash deploy/deploy.sh --nginx
```

Script tự làm toàn bộ:

| Bước | Việc | Vì sao quan trọng với VPS 1GB |
|---|---|---|
| 1 | apt update + curl/rsync | công cụ cơ bản |
| 2 | Tạo **swap 2GB** (nếu chưa có) | chống OOM khi npm cài module / tải cao |
| 3 | Cài **Node.js 20** (nếu chưa có ≥18) | môi trường chạy |
| 4 | Copy app vào `/opt/so-doan-vien` | thư mục chuẩn, tách bản thân app khỏi bản cài |
| 5 | Sinh `.env` với **JWT_SECRET ngẫu nhiên** | bảo mật, không dùng key demo |
| 6 | Kiểm tra native module, tự `npm install` nếu VPS là ARM | chạy được cả x86-64 lẫn ARM64 |
| 7 | Tạo **dịch vụ systemd** (user riêng `sovan`, MemoryMax 700M, tự restart) | node chết → tự dậy, không hạ cả VPS |
| +8 | `--nginx`: cài Nginx + gzip + cache + port 80 | truy cập bằng `http://IP` không cần port |

## 4. Kiểm tra

Mở `http://IP_VPS` → đăng nhập `quantri / 123456` → **ĐỔI MẬT KHẨU NGAY** (Quản trị → Tài khoản → Đổi MK).

Lệnh vận hành:

```bash
systemctl status sodoanvien          # trạng thái
journalctl -u sodoanvien -f          # log trực tiếp
systemctl restart sodoanvien         # khởi động lại
nano /opt/so-doan-vien/server/.env   # sửa cấu hình (AI key...) rồi restart
```

## 5. Gắn tên miền + HTTPS (khuyến nghị)

Trỏ A record của tên miền (vd `so.truonghoc.edu.vn`) về IP VPS, rồi:

```bash
sudo apt install -y certbot python3-certbot-nginx
sudo certbot --nginx -d so.truonghoc.edu.vn
```

Certbot tự sửa Nginx sang HTTPS 443 và tự gia hạn. Trang verify/QR trên thẻ đoàn viên sẽ dùng đường dẫn tuyệt đối của host nên hoạt động ngay sau khi có tên miền.

## 6. Bảo mật cơ bản cho VPS

```bash
# Tường lửa: chỉ mở SSH, HTTP, HTTPS (chỉ chạy nếu bạn chắc chắn SSH vẫn được phép)
sudo ufw allow OpenSSH && sudo ufw allow 80,443/tcp && sudo ufw enable

# (Tùy chọn) chống dò mật khẩu SSH
sudo apt install -y fail2ban && sudo systemctl enable --now fail2ban
```

Khuyến nghị thêm: đăng nhập SSH bằng khóa, tắt `PasswordAuthentication` trong `/etc/ssh/sshd_config`.

## 7. Cập nhật phiên bản mới

Khi bạn có bản release mới (tạo lại bằng `deploy/pack.sh`): upload rồi **chạy lại đúng lệnh deploy ở mục 3** — script giữ nguyên `.env` và dữ liệu `server/data`, chỉ thay code rồi restart.

## 8. Backup dữ liệu trên VPS

Dữ liệu nằm ở 1 thư mục duy nhất — sao chép là đủ:

```bash
# Backup thủ công
tar -czf /root/backup-$(date +%F).tar.gz /opt/so-doan-vien/server/data

# Tự động 2 giờ sáng mỗi ngày (crontab -e)
0 2 * * * tar -czf /root/backup-$(date +\%F).tar.gz /opt/so-doan-vien/server/data
```

Ngoài ra, tính năng **Quản trị → Sao lưu & Phục hồi** trong ứng dụng chính là cơ chế DailyBackupHash/ConfirmRecovery của đề cương — snapshot có kiểm chứng hash trên ledger, nên khi khôi phục không sợ dùng phải bản backup hỏng.

## 9. Dung lượng chiếm dụng (tham chiếu)

| Thành phần | RAM | Đĩa |
|---|---|---|
| Hệ điều hành tối thiểu | ~150–250MB | ~2.5GB |
| Node.js (ứng dụng này) | ~70–120MB | ~50MB |
| Nginx | ~5MB | ~10MB |
| Swap (file) | — | 2GB |
| Dữ liệu CSDL + ledger + snapshot | tăng dần theo số đoàn viên (năm đầu ~vài chục MB) | |
| **Còn lại cho hệ thống** | ~600MB headroom | ~7GB |

## 10. Sự cố thường gặp

| Hiện tượng | Xử lí |
|---|---|
| `502 Bad Gateway` | `systemctl status sodoanvien` — nếu failed xem `journalctl -u sodoanvien -n 50`; thường do port 3000 bị chiếm hoặc thiếu RAM (kiểm tra `free -h`) |
| Quên mật khẩu quantri | `sqlite3 /opt/so-doan-vien/server/data/offchain.db` hoặc đơn giản: `rm -rf /opt/so-doan-vien/server/data && systemctl restart sodoanvien` (nạp lại dữ liệu demo) |
| Muốn bật AI | Điền `AI_API_KEY` vào `/opt/so-doan-vien/server/.env` rồi `systemctl restart sodoanvien` |
| Port 80 bị chiếm bởi Apache | `systemctl disable --now apache2` rồi `systemctl restart nginx` |
| VPS ARM (Oracle/AWS Graviton) | deploy.sh tự `npm install` lại — cần internet trên VPS |
