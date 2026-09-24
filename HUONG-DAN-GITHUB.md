# 🐙 HƯỚNG DẪN ĐƯA DỰ ÁN LÊN GITHUB

Có **2 cách** — chọn 1 trong 2. Cả hai đều cần bạn **tải mã nguồn sạch** trước (mục 1).

> ❓ Vì sao không dùng trực tiếp thư mục dự án? Vì trong đó có `node_modules` (hàng nghìn file thư viện — GitHub không cần, ai clone sẽ tự cài bằng `npm install`) và dữ liệu chạy thử (`server/data/`, gói `releases/`) — **không được đưa lên GitHub**. File `.gitignore` tôi đã chuẩn bị sẽ tự chặn những thứ này khi dùng git.

---

## 1) Tải mã nguồn sạch về máy

**Cách nhanh:** tải file **`releases/so-doan-vien-github-src.zip`** (tôi đã đóng gói sẵn — chỉ chứa mã nguồn + tài liệu + cấu hình GitHub, đã loại node_modules/dist/data), rồi giải nén ra một thư mục, ví dụ `D:\so-doan-vien`.

*(Nếu muốn tự tạo: copy toàn bộ dự án rồi xóa các thư mục `node_modules`, `client/dist`, `server/data`, `releases/`, `uploads/` — còn lại chính là nội dung trong zip đó.)*

---

## 2) CÁCH A — Kéo-thả qua web (không cần cài git, ~3 phút)

1. Đăng nhập [github.com](https://github.com) → góc phải trên **＋** → **New repository**.
2. Điền:
   - **Repository name:** `so-doan-vien` (hoặc tên bạn thích)
   - **Private** ✅ (khuyến nghị — đây là tài liệu nghiên cứu của bạn; muốn mở public sau này vẫn được)
   - **KHÔNG** tick "Add a README" (dự án đã có sẵn README.md)
3. Bấm **Create repository**.
4. Ở trang mới, tìm dòng **"uploading an existing folder"** (hoặc link *upload an existing file*) → bấm → **kéo cả thư mục** đã giải nén (mở thư mục, chọn tất cả file + thư mục con bên trong: `client`, `server`, `docs`, `deploy`, `.github`, `.gitignore`, `LICENSE`, `README.md`...) vào ô upload.
   - Nếu trình duyệt chặn kéo cả thư mục: tạo từng thư mục bằng cách gõ tên kèm dấu `/` vào ô "Create new file" (vd `docs/`), rồi kéo file vào.
5. Cuối trang điền **Commit message**: `Nguyen mau so Doan vien - Hyperledger Fabric` → **Commit changes**.
6. Xong! Repo đã có mã nguồn + README hiển thị đẹp.

> ⚠️ Giới hạn upload web: từng file ≤ 25MB, tối đa 100 file mỗi lần kéo — gói source sạch của chúng ta ~70 file nên không vấn đề.

---

## 3) CÁCH B — Dòng lệnh git (chuẩn, nên dùng về lâu dài)

### 3.1. Cài & cấu hình git (làm 1 lần trên máy)
```bash
# Windows: tải https://git-scm.com/download/win (mặc định cài Git Bash)
# Ubuntu/Debian: sudo apt install git
git config --global user.name "Nguyễn Văn Tài"
git config --global user.email "email-của-bạn@example.com"
```

### 3.2. Tạo repo trên GitHub
Làm đúng như mục 2 bước 1–3 (tạo repo **rỗng**, không tick README). Giả sử repo là:
`https://github.com/nguyenduympe-alt/sodoanvien.git`

### 3.3. Đẩy mã nguồn lần đầu — chỉ cần MỘT lệnh
Mở terminal **trong thư mục đã giải nén** (nơi có `deploy/push-github.sh`):
```bash
bash deploy/push-github.sh
```
Script tự: `git init` → commit → trỏ remote về repo của bạn → push. Khi được hỏi:
- **Username:** `nguyenduympe-alt`
- **Password:** dán **Personal Access Token** (không phải mật khẩu GitHub) — tạo tại
  https://github.com/settings/tokens → *Generate new token (classic)* → tick **repo** → copy dán.

Nếu thích gõ tay từng lệnh:
Mở terminal **trong thư mục đã giải nén**:
```bash
git init
git add .
git commit -m "Nguyên mẫu: sổ Đoàn viên trên Hyperledger Fabric (web + API + chaincode)"
git branch -M main
git remote add origin https://github.com/nguyenduympe-alt/sodoanvien.git
git push -u origin main
```

### 3.4. Đăng nhập khi được hỏi
GitHub **không nhận mật khẩu tài khoản** cho git — dùng 1 trong 3 cách:
- **Personal Access Token (PAT)** — đơn giản nhất:
  GitHub → ảnh đại diện → **Settings** → **Developer settings** (cuối trang) → **Personal access tokens → Tokens (classic)** → *Generate new token (classic)* → tick quyền **repo** → tạo → **copy token ngay** (chỉ hiện 1 lần). Khi git hỏi mật khẩu, **dán token vào**.
- **GitHub CLI** (tiện nhất): cài [cli.github.com](https://cli.github.com) → `gh auth login` → làm theo hướng dẫn.
- **SSH key**: `ssh-keygen -t ed25519` → thêm nội dung `~/.ssh/id_ed25519.pub` vào GitHub → Settings → SSH and GPG keys → dùng đường dẫn `git@github.com:TEN-BAN/so-doan-vien.git` làm remote.

Windows thường có **Credential Manager** tự lưu — lần sau push không cần nhập lại.

### 3.5. Các lần cập nhật sau
```bash
bash deploy/push-github.sh "Mô tả thay đổi"
# hoặc:
git add . && git commit -m "Mô tả thay đổi" && git push
```

---

## 4. Kiểm tra CI tự động (đã cấu hình sẵn)

Dự án có file `.github/workflows/ci.yml` — mỗi lần push, GitHub Actions sẽ tự:
1. Cài Node 20 → kiểm tra cú pháp toàn bộ server
2. `npm ci` + **build giao diện**
3. Khởi động thử server và gọi `/api/health`

Xem kết quả: repo → tab **Actions**. Nếu thấy ✅ xanh = mọi thứ build được từ đầu — rất "đẹp mắt" khi đưa vào luận văn.

## 5. Secrets (không commit file .env!)

- **Không bao giờ** commit file `.env` thật hay khóa API — `.gitignore` đã chặn, nhưng cứ kiểm tra trước khi push.
- Cấu hình trên máy: copy `deploy/.env.example` → `server/.env` rồi điền `AI_API_KEY`... (file `.env` sẽ không bị git theo dõi).
- Nếu sau này muốn GitHub Actions tự deploy lên VPS: repo → **Settings → Secrets and variables → Actions** → tạo secret `AI_API_KEY`, `VPS_HOST`, `VPS_SSH_KEY`... và dùng trong workflow (tôi có thể viết workflow deploy khi bạn cần).

## 6. Trang trí repo (tùy chọn)

Repo của bạn đang **Public** — hoàn toàn an toàn (mã nguồn không chứa khóa/bí mật nào, đã quét). Nếu muốn ẩn: Settings → Danger Zone → Change visibility → Private.

Repo → **⚙️ About** (góc phải):
- **Description:** `Nguyên mẫu hệ thống định danh & quản lí sổ Đoàn viên trên Hyperledger Fabric — React + Node.js + SQLite + Fabric (simulator/gateway)`
- **Topics:** `blockchain` `hyperledger-fabric` `react` `nodejs` `sqlite` `vneid` `thesis`

## 7. Vì sao repo này an toàn để công khai (nếu bạn chọn Public)

- Không có khóa/API key nào trong mã nguồn (chỉ có `.env.example` với giá trị rỗng)
- JWT secret được sinh ngẫu nhiên lúc deploy, không nằm trong git
- Dữ liệu demo chỉ sinh lúc chạy, `server/data/` bị gitignore
- Chuỗi khóa demo `123456` chỉ tồn tại khi seed dữ liệu thử, đã ghi rõ trong README
