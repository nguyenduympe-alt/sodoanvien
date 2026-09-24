# 12. Dữ liệu huấn luyện OCR riêng: thẻ CCCD & chữ viết tay (khảo sát internet)

> Trả lời câu hỏi: *"Huấn luyện lại chữ nhận dạng cho riêng thẻ CCCD / hỗ trợ phiếu giấy viết tay — tìm dữ liệu đã có trên internet?"*
> Kết luận nhanh: **không có dataset CCCD thật công khai** (vì lí do dữ liệu cá nhân) → dùng **dữ liệu tổng hợp** (công cụ đã kèm trong repo: `tools/gen-cccd-synth.py`); chữ viết tay thì **có sẵn nguồn phong phú** — tổng >220.000 mẫu ảnh từ/dòng công khai cho nghiên cứu.

---

## 1. Kho dữ liệu công khai — kết quả khảo sát (09/2026)

### 1.1. Chữ viết tay tiếng Việt (cho phiếu giấy)

| Dataset | Nội dung | Quy mô | Giấy phép | Nơi tải |
|---|---|---|---|---|
| **UIT-HWDB** (RIVF 2022) | Viết tay: ảnh từ + dòng, nhiều người viết | ~110.600 ảnh từ (248 phong cách train) + 7.229 dòng | nghiên cứu | Kaggle: `ntklinhfitus/uit-hwdb` · benchmark: `github.com/khanhlinh-innomation/vlm-handwriting-ocr` |
| **Vietnamese Handwritten OCR** (Kaggle, bomaich) | Ảnh từ viết tay + nhãn CSV | >110.000 ảnh | mở (Kaggle) | `kaggle.com/datasets` — tìm "vietnamese-handwritten-ocr-word-dataset" |
| **HANDS-VNOnDB** (ICFHR2018 — cuộc thi VOHTR2018) | Viết tay online: 1.146 đoạn / 7.296 dòng / >480.000 nét / 200 người viết; có converter ra ảnh offline | 7.296 dòng | miễn phí cho nghiên cứu | converter: `github.com/VinhLoiIT/vnondb_convert` |
| **Cinnamon AI — Vietnamese Handwriting** | Ảnh địa chỉ viết tay + nhãn JSON | 1.838 ảnh | nghiên cứu | `github.com/TomHuynhSG/Vietnamese-Handwriting-Recognition-OCR` |
| **VinText** (VinAI, CVPR 2021) | Scene text tiếng Việt (biển/bảng hiệu) — luyện độ chắc dấu thanh | 2.000 ảnh / 56.084 text | nghiên cứu (bản HF: AGPL-3.0) | `github.com/VinAIResearch/dict-guided` · HF: `SEACrowd/vintext` |
| **NomNaOCR** | Chữ Hán-Nôm viết tay cổ (tham khảo tiền xử lí giấy ố/mực nhòe) | 2.953 trang / 38.318 patch | CC BY-NC-SA 4.0 | Kaggle: `quandang/nomnaocr` · `github.com/ds4v/NomNaOCR` |
| Thương mại (tùy ngân sách) | Nexdata ~4.995 ảnh; DataoceanAI ~5.006 ảnh in | — | trả phí | nexdata.ai · dataoceanai.com |

**Tổng quan học thuật tổng hợp mọi dataset + hướng đi**: bài survey *"A Survey on Vietnamese Document Analysis and Recognition"* (arXiv **2506.05061**, 2025) — nên trích trong luận văn.

### 1.2. Thẻ CCCD — vì sao không có dataset công khai và làm gì thay thế

Ảnh CCCD thật là **dữ liệu cá nhân nhạy cảm** (Nghị định 13/2023/NĐ-CP); các nhóm nghiên cứu đều dùng tập riêng kín (ví dụ bài báo *Text recognition for Vietnamese identity card* dùng 2.500 ảnh riêng, không công khai). **Giải pháp chuẩn ngành: sinh dữ liệu tổng hợp** — pixel-perfect ground truth, không dính dữ liệu thật:

- **`tools/gen-cccd-synth.py`** (đã kèm repo, tự viết): sinh ảnh dòng (`--mode lines`, định dạng chuẩn tesstrain: `*.png` + `*.gt.txt`) và ảnh thẻ nguyên vẹn + nhãn JSON (`--mode cards`) — cấu trúc CCCD 12 số đúng luật (3 mã tỉnh + 1 thế kỉ-giới tính + 2 năm sinh + 5 ngẫu nhiên + 1 kiểm tra), kèm nhiễu thực tế (nghiêng ±2°, mờ, chói, đốm). Đã kiểm chứng: engine hiện tại đọc đúng tuyệt đối **4/5 thẻ synth chưa fine-tune** → sai sót còn lại chính là thứ fine-tune sẽ sửa.
- Sinh chữ dòng tổng hợp đa nguồn: **OCR-Vietnamese-Text-Generator** (`github.com/trinhtuanvubk/OCR-Vietnamese-Text-Generator` — fork TRDG có sẵn font/dict tiếng Việt), gốc: **TextRecognitionDataGenerator** (`github.com/Belval/TextRecognitionDataGenerator`), **VietNamese-OCR-DataGenerator** (`github.com/docongminh/VietNamese-OCR-DataGenerator`).
- Pipeline CCCD mã nguồn mở để tham khảo kiến trúc: `github.com/thigiacmaytinh/Vietnamese-CitizenID-Recognition` (PaddleOCR + VietOCR); parser bố cục thẻ 2021/2024: `github.com/datit309/nfc_cccd_vn`.

## 2. Giai đoạn A — Fine-tune Tesseract riêng thẻ CCCD (KHÔNG cần GPU)

> Mục tiêu: model `vie_cccd.traineddata` chuyên thẻ — giảm lỗi dấu thanh tên người + số dính nhau. Máy thường (CPU) đủ.

**Bước A1 — sinh dữ liệu** (càng nhiều càng tốt, 3.000–8.000 dòng):
```bash
python3 tools/gen-cccd-synth.py --mode lines --n 6000 --out data/vie_cccd/train
# ghép thêm ảnh dòng thật (cắt từ thẻ tự nguyện, nhãn tay) nếu có — giúp khớp font thật
```

**Bước A2 — fine-tune bằng tesstrain** (phải lấy model gốc từ `tessdata_best`; `tessdata_fast` là 8-bit **không fine-tune được**):
```bash
git clone https://github.com/tesseract-ocr/tesstrain && cd tesstrain
mkdir -p data/vie data/vie_cccd
wget https://github.com/tesseract-ocr/tessdata_best/raw/main/vie.traineddata -O data/vie/vie.traineddata
# ground truth nằm ở data/vie_cccd/train/*.png + *.gt.txt (tesstrain tự nhận)
make training MODEL_NAME=vie_cccd START_MODEL=vie TESSDATA=data/vie \
     FINETUNE=1 MAX_ITERATIONS=12000
# → data/vie_cccd/vie_cccd.traineddata (kèm kết quả CER từng đợt trong log)
```

**Bước A3 — lắp vào hệ thống** (đã hỗ trợ sẵn qua biến môi trường, không sửa code):
```bash
cp data/vie_cccd/vie_cccd.traineddata /usr/share/tesseract-ocr/5/tessdata/
# trong /opt/so-doan-vien/server/.env thêm:
TESS_LANG=vie_cccd
systemctl restart sodoanvien
```

**Bước A4 — nghiệm thu**: đo **CER** (character error rate) trên (a) 200 thẻ synth test (`--mode cards`), (b) 20–50 thẻ thật do đoàn viên **tự nguyện** cung cấp chỉ để đánh giá. Mục tiêu: CER số CCCD/ngày sinh < 1%, họ tên < 2% (baseline hiện tại ~0,97 điểm tin cậy, 1/5 thẻ sai tên).

## 3. Giai đoạn B — Chữ viết tay trên phiếu (GPU miễn phí Colab là đủ)

**Kiến trúc đề xuất**: ảnh phiếu → dựng khung form (óc các ô) → nhận dạng TỪNG DÒNG bằng model viết tay → điền `fields` + điểm tin cậy **thấp hơn ngưỡng tự động** → luôn nâng cán bộ xác nhận (giữ đúng nguyên tắc human-in-the-loop của thiết kế P2/P3).

**Model & cách huấn luyện** (chọn 1):
1. **TrOCR** (microsoft) — `microsoft/trocr-base-handwritten` (hoặc `-small-` cho máy yếu); fine-tune theo notebook chính thức của Hugging Face trên data ghép: UIT-HWDB (từ) + VNOnDB-converted (dòng) + Cinnamon (địa chỉ). Colab T4 đủ cho `-small`/fine-tune có chọn lọc của `-base`. Notebooks chính thức: `huggingface.co/docs/transformers/model_doc/trocr` (mục Resources).
2. **PP-OCRv4 rec** (PaddleOCR) — model nhận dạng dòng nhẹ, có sẵn tiếng Việt, fine-tune theo hướng dẫn PaddleOCR; tham khảo pipeline đã chạy thực tế cho CCCD: repo thigiacmaytinh ở trên.
3. **VLM mới (2024–2025)**: benchmark GLM-OCR / TeleOCR / PaddleOCR-VL trên UIT-HWDB-line đã có sẵn code tại `github.com/khanhlinh-innomation/vlm-handwriting-ocr` — dùng làm chuẩn so sánh trong luận văn. Hoặc **Qwen2.5-VL qua Ollama** trên máy ≥8GB — hệ thống này có sẵn chỗ cắm (`AI_BASE_URL`), không cần sửa code.

**Mục tiêu nghiệm thu**: CER dòng viết tay in-hóa ≤ 8–10% — đủ làm **bản nháp** cho cán bộ bấm xác nhận (không đặt vào luồng tự động).

## 4. Lộ trình tổng

| Giai đoạn | Việc | Dữ liệu | Máy | Thời gian |
|---|---|---|---|---|
| **A. Fine-tune Tesseract CCCD** | `vie_cccd` thay `vie` qua `TESS_LANG` | synth (repo) + thật tự nguyện | CPU thường | 1–2 ngày |
| **B. Model viết tay** | TrOCR/PP-OCR fine-tune | UIT-HWDB + VNOnDB + Cinnamon + Kaggle 110k | Colab GPU miễn phí | 4–6 ngày |
| **C. Tích hợp + QA** | Route phiếu giấy, ngưỡng riêng, đo CER quy trình | bộ test nội bộ | — | 1–2 ngày |

## 5. Lưu ý pháp lí & đạo đức nghiên cứu
- Không tải/phát tán ảnh CCCD thật của người khác; tập test thật phải **tự nguyện, có đồng ý**, chỉ dùng đánh giá nội bộ, không công khai trong repo (thêm vào `.gitignore`).
- Dataset công khai ở §1.1 đều cho phép dùng **nghiên cứu** — trích dẫn nguồn khi công bố luận văn (bibtex trong các repo tương ứng).
- Ghi rõ trong luận văn: dữ liệu huấn luyện chính là **tổng hợp** (an toàn pháp lí) — đây là điểm cộng "thiết kế có trách nhiệm với dữ liệu cá nhân".
