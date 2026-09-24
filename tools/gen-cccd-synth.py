#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
gen-cccd-synth.py — Sinh DỮ LIỆU TỔNG HỢP cho huấn luyện OCR riêng thẻ CCCD/VNeID.
Không cần ảnh thẻ thật (tránh dữ liệu cá nhân — Nghị định 13/2023/NĐ-CP):
  • Chế độ 'lines'  : ảnh DÒNG chữ (cao 48–64px) + file *.gt.txt  → nạp thẳng vào
                      tesstrain để fine-tune Tesseract (model vie → vie_cccd).
  • Chế độ 'cards'  : ảnh thẻ nguyên vẹn + file JSON nhãn trường → test end-to-end.

Ví dụ:
  python3 tools/gen-cccd-synth.py --mode lines --n 3000 --out data/synth
  python3 tools/gen-cccd-synth.py --mode cards --n 200  --out data/synth-test

Sau đó fine-tune (xem docs/12): make training MODEL_NAME=vie_cccd START_MODEL=vie ...
"""
import argparse, json, os, random, string
from PIL import Image, ImageDraw, ImageFont, ImageFilter, ImageEnhance

_FONT_DIRS = ['/usr/share/fonts/truetype/dejavu', os.path.expanduser('~/.fonts')]
# Dùng mọi font TTF hệ thống hỗ trợ tiếng Việt (DejaVu + thêm font của bạn vào ~/.fonts)
FONTS = [os.path.join(d, f) for d in _FONT_DIRS if os.path.isdir(d)
         for f in sorted(os.listdir(d)) if f.endswith('.ttf') and 'DejaVuSans' in f] or FONTS_FALLBACK
FONTS_FALLBACK = FONTS  # (giữ tham chiếu đề phòng)
HO = ['NGUYỄN', 'TRẦN', 'LÊ', 'PHẠM', 'HOÀNG', 'HUỲNH', 'PHAN', 'VŨ', 'ĐẶNG', 'BÙI', 'ĐỖ', 'GIANG', 'LÝ', 'LÂM']
ĐEM = ['Văn', 'Thị', 'Hữu', 'Ngọc', 'Thanh', 'Minh', 'Tuấn', 'Thu', 'Hoài', 'Đức', 'Kiều', 'Quang', 'Anh', 'Lan']
TEN = ['AN', 'BÌNH', 'CƯỜNG', 'DUY', 'GIANG', 'HÀ', 'HẢI', 'KHÁNH', 'LAN', 'LỘC', 'MAI', 'NAM',
       'NGỌC', 'OANH', 'PHÚC', 'QUÂN', 'SƠN', 'THẢO', 'TRÍ', 'UYÊN', 'VÂN', 'XUÂN', 'YẾN', 'HÒA']
TINH = ['CẦN THƠ', 'HỒ CHÍ MINH', 'HÀ NỘI', 'ĐỒNG THÁP', 'BẾN TRE', 'SÓC TRĂNG', 'CÀ MAU', 'Long An']
XA = ['Xuân Khánh', 'Tân An', 'An Phú', 'Hưng Lợi', 'Bình Thuỷ', 'Lợi Thuận', 'An Hòa', 'Thới Bình']

def ho_ten():
    return f"{random.choice(HO)} {random.choice(ĐEM)} {random.choice(TEN)}".upper()

def ngay():
    return f"{random.randint(1, 28):02d}/{random.randint(1, 12):02d}/{random.randint(1980, 2009)}"

def cccd_from_dob(dob):
    dd, mm, yyyy = dob.split('/')
    gioi = random.choice(['Nam', 'Nữ'])
    # 12 số đúng cấu trúc thật: 3 mã tỉnh + 1 mã thế kỉ-giới tính + 2 số năm sinh + 5 ngẫu nhiên + 1 kiểm tra
    century = {'Nam': random.choice('012'), 'Nữ': random.choice('345')}[gioi]
    so = f"{random.randint(1, 96):03d}{century}{yyyy[2:]}{random.randint(0, 99999):05d}{random.randint(0, 9)}"
    return so, gioi

def rand_font(px):
    f = random.choice(FONTS)
    try:
        return ImageFont.truetype(f, px)
    except OSError:
        return ImageFont.load_default()

def distort(img):
    """Nhiễu giả lập chụp/scan thực tế để mô hình không bị 'quên' ảnh xấu."""
    img = img.rotate(random.uniform(-2.2, 2.2), expand=True, fillcolor=(245, 247, 244),
                     resample=Image.BICUBIC)
    if random.random() < 0.5:
        img = img.filter(ImageFilter.GaussianBlur(random.uniform(0.3, 1.4)))
    img = ImageEnhance.Brightness(img).enhance(random.uniform(0.82, 1.15))
    img = ImageEnhance.Contrast(img).enhance(random.uniform(0.85, 1.12))
    px = img.load()
    for _ in range(img.width * img.height // 260):
        x, y = random.randrange(img.width), random.randrange(img.height)
        px[x, y] = tuple(max(0, min(255, c + random.randint(-24, 24))) for c in px[x, y])
    return img

def draw_line(text, h):
    f = rand_font(int(h * random.uniform(0.62, 0.8)))
    d = ImageDraw.Draw(Image.new('RGB', (1, 1)))
    w = d.textlength(text, font=f)
    img = Image.new('RGB', (int(w) + random.randint(6, 40), h), (245, 247, 244))
    ImageDraw.Draw(img).text((random.randint(2, 18), (h - f.size) // 2), text, font=f, fill=(12, 12, 12))
    return distort(img)

def gen_lines(n, out):
    os.makedirs(out, exist_ok=True)
    for i in range(n):
        dob = ngay()
        cccd, gioi = cccd_from_dob(dob)
        ht = ho_ten()
        candidates = [
            cccd, f"{cccd[:4]} {cccd[4:8]} {cccd[8:]}",
            f"Số/No. {cccd}", f"Họ và tên/Full name {ht}", ht,
            f"Ngày sinh/Date of birth {dob}", dob,
            f"Giới tính/Sex {gioi}", gioi,
            f"Quốc tịch/Nationality Việt Nam",
            f"Quê quán/Place of origin {random.choice(TINH)}",
            f"Nơi thường trú/Place of residence Phường {random.choice(XA)}, TP {random.choice(TINH).title()}",
        ]
        text = random.choice(candidates)
        img = draw_line(text, random.choice([48, 56, 64]))
        img.save(f"{out}/{i:06d}.png")
        with open(f"{out}/{i:06d}.gt.txt", 'w', encoding='utf-8') as fh:
            fh.write(text + '\n')
    print(f"✅ lines: {n} cặp ảnh+gt.txt → {out}")

def gen_cards(n, out):
    os.makedirs(out, exist_ok=True)
    W, H = 1014, 638
    for i in range(n):
        img = Image.new('RGB', (W, H), (245, 247, 244))
        d = ImageDraw.Draw(img)
        d.rectangle([0, 0, W, 100], fill=(190, 214, 178))
        d.text((W // 2, 16), 'CỘNG HÒA XÃ HỘI CHỦ NGHĨA VIỆT NAM',
               font=ImageFont.truetype(FONTS[0], 26), fill=(30, 60, 30), anchor='ma')
        d.text((W // 2, 52), 'Thẻ căn cước công dân / Citizen ID card',
               font=ImageFont.truetype(FONTS[1], 20), fill=(30, 60, 30), anchor='ma')
        dob = ngay(); cccd, gioi = cccd_from_dob(dob); ht = ho_ten()
        xaphuong = random.choice(XA); tinh = random.choice(TINH)
        labels = {
            'idNumber': cccd, 'fullName': ht, 'dob': dob, 'gender': gioi,
        }
        rows = [
            ('Số/No.', cccd, 130),
            ('Họ và tên/Full name', ht, 190),
            ('Ngày sinh/Date of birth', dob, 250),
            ('Giới tính/Sex', gioi, 310),
            ('Quốc tịch/Nationality', 'Việt Nam', 370),
            ('Quê quán/Place of origin', tinh, 430),
            ('Nơi thường trú/Place of residence', f'Phường {xaphuong}, TP {tinh.title()}', 490),
        ]
        for lab, val, y in rows:
            d.text((40, y), lab, font=ImageFont.truetype(FONTS[1], 20), fill=(70, 80, 70))
            d.text((40, y + 28), val, font=ImageFont.truetype(FONTS[0], 24), fill=(15, 15, 15))
        img = distort(img.convert('RGB'))
        img.save(f"{out}/card-{i:04d}.jpg", quality=random.randint(68, 95))
        with open(f"{out}/card-{i:04d}.json", 'w', encoding='utf-8') as fh:
            json.dump(labels, fh, ensure_ascii=False, indent=1)
    print(f"✅ cards: {n} ảnh thẻ+nhãn JSON → {out}")

if __name__ == '__main__':
    ap = argparse.ArgumentParser()
    ap.add_argument('--mode', choices=['lines', 'cards'], default='lines')
    ap.add_argument('--n', type=int, default=1000)
    ap.add_argument('--out', default='data/synth')
    a = ap.parse_args()
    (gen_lines if a.mode == 'lines' else gen_cards)(a.n, a.out)
