/**
 * ============ ENGINE AI OFFLINE — TRÍCH XUẤT ĐỊNH DANH KHÔNG CẦN INTERNET ============
 * Hai tầng engine, tự chọn theo thứ tự:
 *   1) OCR-VN (mặc định, chính xác cao) — dịch vụ nội bộ http://127.0.0.1:8031 (systemd: ocr-vn)
 *        PP-OCR DBNet dò vùng chữ  →  VietOCR (Seq2Seq, tiếng Việt có dấu) đọc chữ
 *        + PP-OCR CRNN đọc vùng SỐ/NGÀY (CCCD, ngày sinh) + phương án thay thế (alt) cho kiểm tra chéo.
 *        Đo trên bộ ảnh chụp xấu (nghiêng, mờ, chói, JPEG nén mạnh): 61/72 trường đúng, 24/24 số CCCD
 *        (Tesseract cũ: 19/72).
 *   2) Tesseract vie (dự phòng) — khi dịch vụ OCR-VN tắt/lỗi.
 * Sau OCR: bộ phân tích quy tắc tiếng Việt (nhãn thẻ CCCD cũ + thẻ Căn cước 2024 + VNeID),
 * kiểm tra chéo CCCD ↔ năm sinh ↔ giới tính, điểm tin cậy tính từ độ tin cậy từng dòng.
 * — Không gọi mạng ra ngoài: ảnh không rời khỏi máy chủ, file tạm xoá ngay.
 * — Trả cùng schema `fields` với AI Vision đám mây → dùng lại nguyên CỔNG TỰ ĐỘNG P2.
 */
const { execFile } = require('child_process');
const os = require('os');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const ENGINE = {
  bin: 'tesseract',
  get lang() { return process.env.TESS_LANG || 'vie'; },      // model tùy chỉnh: TESS_LANG=vie_cccd sau khi fine-tune
  get psm() { return process.env.TESS_PSM || '6'; },           // 6 = khối văn bản đồng nhất (thẻ in)
};
const OCR_VN = {
  get url() { return (process.env.OCR_VN_URL || 'http://127.0.0.1:8031').replace(/\/$/, ''); },
  get enabled() { return process.env.OCR_VN_DISABLE !== '1'; },
  get timeoutMs() { return Number(process.env.OCR_VN_TIMEOUT_MS) || 90000; },
};
let cachedAvailable = null;
let ocrVnUp = null;           // null = chưa biết, true/false = kết quả kiểm tra gần nhất
let ocrVnName = 'ppocr+vietocr';

/** Kiểm tra dịch vụ OCR-VN (nền, 30s/lần) */
async function pingOcrVn() {
  if (!OCR_VN.enabled) { ocrVnUp = false; return false; }
  try {
    const r = await fetch(`${OCR_VN.url}/health`, { signal: AbortSignal.timeout(3000) });
    const j = await r.json();
    ocrVnUp = !!(r.ok && j && j.ok);
    if (j && j.engine) ocrVnName = j.engine;
  } catch { ocrVnUp = false; }
  return ocrVnUp;
}
pingOcrVn();
setInterval(pingOcrVn, 30000).unref();

function tesseractAvailable(force = false) {
  if (!force && cachedAvailable != null) return cachedAvailable;
  try {
    const out = require('child_process').execSync(
      `${ENGINE.bin} --list-langs 2>/dev/null`, { timeout: 8000 }).toString();
    cachedAvailable = out.split('\n').map((l) => l.trim()).includes(ENGINE.lang);
  } catch { cachedAvailable = false; }
  return cachedAvailable;
}

/** Có ít nhất một engine offline sẵn sàng */
function available(force = false) {
  return !!ocrVnUp || tesseractAvailable(force);
}

/** Thông tin engine cho giao diện /intake/status */
function engineInfo() {
  if (ocrVnUp) return { name: ocrVnName, note: 'PP-OCR dò chữ + VietOCR đọc tiếng Việt (AI chạy trên server, không cần internet)', fallback: tesseractAvailable() ? 'tesseract-vie' : null };
  return { name: 'tesseract-vie', note: 'OCR + quy tắc, chạy trên server, không cần internet', fallback: null };
}

/* ---------- Bỏ dấu (GIỮ NGUYÊN ĐỘ DÀI chuỗi để ánh xạ vị trí về chuỗi gốc) ---------- */
function deaccent(s) {
  return Array.from(String(s)).map((ch) => {
    if (ch === 'đ') return 'd';
    if (ch === 'Đ') return 'D';
    const b = ch.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    return b.length === 1 ? b : ch;
  }).join('').toLowerCase();
}

const LABELS = {
  id: /(so\s*\/\s*no\.?|so\s*dinh\s*danh(\s*ca\s*nhan)?|personal\s*ident\w*(\s*n\w*)?|(^|\s)no\.)/,
  name: /(ho\s*,?\s*(chu\s*dem\s*)?va\s*ten(\s*khai\s*sinh)?|full\s*name)/,
  dob: /(ngay\s*,?\s*(thang\s*,?\s*nam\s*)?sinh|date\s*of\s*birth)/,
  gender: /(gioi\s*tinh|(^|\W)sex(\W|$))/,
  nationality: /(quoc\s*tich|nationality)/,
  origin: /(que\s*quan|place\s*of\s*origin|noi\s*dang\s*ky\s*khai\s*sinh|place\s*of\s*birth)/,
  residence: /(noi\s*thuong\s*tru|noi\s*cu\s*tru|place\s*of\s*residence)/,
  expiry: /(ngay\s*het\s*han|date\s*of\s*expiry|co\s*gia\s*tri\s*den|ngay\s*cap|date\s*of\s*issue)/,
};
const ANY_LABEL = new RegExp(Object.values(LABELS).map((r) => `(${r.source})`).join('|'));
const HEADER_RE = /(cong\s*hoa|doc\s*lap|viet\s*nam|can\s*cuoc|citizen|identity|socialist|republic|thong\s*tin|dinh\s*danh|vneid)/;
const DATE_RE = /(?<!\d)(\d{1,2})\s*[/.\-\s]\s*(\d{1,2})\s*[/.\-]\s*(\d{4})(?!\d)/;
const DATE8_RE = /(?<!\d)(\d{2})(\d{2})(\d{4})(?!\d)/;   // "10061999" (mất dấu /) — chỉ dùng cạnh nhãn

/* ---------- Tesseract TSV → các dòng ---------- */
function ocrToLines(tsv) {
  const lines = new Map();
  for (const row of tsv.split('\n').slice(1)) {
    const c = row.split('\t');
    if (c.length < 12) continue;
    const [level, , , par, line, , , , , , conf, text] = c; // 12 cột: conf=10, text=11
    if (Number(level) !== 5 || !text || !text.trim()) continue;
    const key = `${par}:${line}`;
    if (!lines.has(key)) lines.set(key, { words: [] });
    lines.get(key).words.push({ text: text.trim(), conf: Number(conf) });
  }
  return [...lines.values()]
    .map((l) => ({ ...l, alts: [], text: l.words.map((w) => w.text).join(' ') }))
    .filter((l) => l.text);
}

/* ---------- OCR-VN JSON → các dòng (cùng cấu trúc với Tesseract) ---------- */
function ocrVnToLines(resp) {
  return (resp.lines || []).map((l) => {
    const words = [];
    const alts = [];
    for (const seg of l.segments || [{ text: l.text, conf: l.conf }]) {
      for (const w of String(seg.text || '').split(/\s+/).filter(Boolean)) words.push({ text: w, conf: Number(seg.conf) * 100 });
      if (seg.alt) alts.push(String(seg.alt));
    }
    return { words, alts, text: words.map((w) => w.text).join(' ') };
  }).filter((l) => l.text);
}

/** Ghép dãy số cách nhau bởi dấu chấm/khoảng trắng: "2051 2345 6789" → "205123456789" */
function digits12(hay) {
  const out = [];
  const re = /(?<!\d)(?:\d[\s.\-]?){11}\d(?!\d)/g;
  let m;
  while ((m = re.exec(hay))) {
    const d = m[0].replace(/\D/g, '');
    if (d.length === 12) out.push(d);
  }
  return out;
}

const lineConf = (l) => (l.words.length ? l.words.reduce((a, w) => a + w.conf, 0) / l.words.length / 100 : null);

/** Ngày hợp lệ → YYYY-MM-DD, không hợp lệ → null */
function toIsoDate(dd, mm, yyyy) {
  const d = Number(dd), m = Number(mm), y = Number(yyyy);
  const nowY = new Date().getFullYear();
  if (!(y >= 1920 && y <= nowY && m >= 1 && m <= 12 && d >= 1 && d <= 31)) return null;
  const dt = new Date(Date.UTC(y, m - 1, d));
  if (dt.getUTCMonth() !== m - 1) return null;
  return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

/** Phần giá trị nằm sau nhãn trên cùng dòng (bỏ cả phần nhãn tiếng Anh "/Full name:") */
function afterLabel(text, labelRe) {
  const da = deaccent(text);
  const m = labelRe.exec(da);
  if (!m) return '';
  let end = m.index + m[0].length;
  // nhãn song ngữ: "Họ và tên / Full name:" → bỏ luôn phần tiếng Anh + dấu phân cách
  const tail = da.slice(end);
  const m2 = /^\s*[/|]?\s*(full\s*name|date\s*of\s*birth|sex|no\.?|personal\s*ident\w*(\s*n\w*)?|[a-z]{1,12}(\s+[a-z]{1,12})?\s*(?=:))?\s*[:.]?\s*/.exec(tail);
  if (m2) end += m2[0].length;
  return text.slice(end).trim();
}

/** Dòng có dáng HỌ TÊN: 2–6 từ, chỉ chữ cái, không phải nhãn/tiêu đề */
function looksLikeName(s) {
  const t = String(s || '').replace(/[.,:;|]+$/g, '').trim();
  if (!t || /\d/.test(t)) return false;
  const words = t.split(/\s+/);
  if (words.length < 2 || words.length > 6) return false;
  if (!/^[A-Za-zÀ-ỹĐđ\s]+$/.test(t)) return false;
  const da = deaccent(t);
  if (ANY_LABEL.test(da) || HEADER_RE.test(da)) return false;
  if (/(^|\s)f[ua]\w{0,3}\s*n[ao]\w{0,3}($|\s)/.test(da)) return false;      // "Ful name", "full nam" (nhãn đọc lỗi)
  if (t === t.toLowerCase()) return false;                                   // họ tên luôn viết hoa chữ đầu/IN HOA
  if (words.some((w) => w.length > 7)) return false;                          // tiếng Việt: 1 âm tiết ≤ 7 chữ cái
  return true;
}

/* ---------- Từ điển HỌ + TÊN ĐỆM phổ biến (tập đóng) → sửa lỗi sai dấu của OCR ---------- */
const HO_VN = ['Nguyễn', 'Trần', 'Lê', 'Phạm', 'Hoàng', 'Huỳnh', 'Phan', 'Vũ', 'Võ', 'Đặng', 'Bùi', 'Đỗ', 'Hồ', 'Ngô',
  'Dương', 'Lý', 'Lâm', 'Giang', 'Đinh', 'Trương', 'Mai', 'Tô', 'Hà', 'Tạ', 'Châu', 'Thái', 'Lưu', 'Quách', 'Kiều',
  'Đoàn', 'Cao', 'Lương', 'Tăng', 'Triệu', 'Diệp', 'Thạch', 'Danh', 'Sơn', 'Kim', 'Trịnh', 'Phùng', 'Vương', 'Lữ',
  'Tôn', 'Hứa', 'Mạc', 'Âu', 'Khúc', 'Nghiêm', 'Thân', 'Quan', 'Ông', 'Trà', 'Lục', 'Chung', 'Bạch', 'Từ'];
const DEM_VN = ['Thị', 'Văn', 'Kiều', 'Ngọc', 'Hữu', 'Quốc', 'Bảo', 'Đức', 'Hoài', 'Tuấn', 'Thế', 'Xuân', 'Trọng', 'Diễm'];
const mkDict = (arr) => new Map(arr.map((w) => [deaccent(w), w]));
const HO_MAP = mkDict(HO_VN), DEM_MAP = mkDict(DEM_VN);
function caseLike(ref, w) { return ref === ref.toUpperCase() ? w.toUpperCase() : w; }
/** Sửa họ/tên đệm sai dấu (vd "Trấn" → "Trần"); trả { name, fixed } */
function fixName(name) {
  const ws = name.split(' ');
  let fixed = 0;
  const fix = (i, map) => {
    const k = deaccent(ws[i]); const canon = map.get(k);
    if (canon && deaccent(canon) === k && ws[i].toLowerCase() !== canon.toLowerCase()) { ws[i] = caseLike(ws[i], canon); fixed += 1; }
  };
  if (ws.length >= 2) fix(0, HO_MAP);
  for (let i = 1; i < ws.length - 1; i += 1) fix(i, DEM_MAP);
  return { name: ws.join(' '), fixed };
}

/* ---------- Trích xuất chính ---------- */
async function extract(imageDataUrl) {
  const m = /^data:image\/(\w+);base64,(.+)$/.exec(String(imageDataUrl || ''));
  if (!m) throw Object.assign(new Error('Thiếu ảnh (data:image/...;base64,...)'), { status: 400 });

  // 1) OCR-VN (AI tiếng Việt) — nếu dịch vụ bật
  if (OCR_VN.enabled && ocrVnUp !== false) {
    try {
      const t0 = Date.now();
      const r = await fetch(`${OCR_VN.url}/ocr`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ image: imageDataUrl }),
        signal: AbortSignal.timeout(OCR_VN.timeoutMs),
      });
      if (!r.ok) throw new Error(`OCR-VN HTTP ${r.status}`);
      const j = await r.json();
      ocrVnUp = true;
      const out = parseLines(ocrVnToLines(j));
      out.meta = { ...out.meta, engine: `${j.engine || ocrVnName} (offline)`, ms: Date.now() - t0 };
      return out;
    } catch (e) {
      ocrVnUp = false; pingOcrVn();
      if (!tesseractAvailable()) throw Object.assign(new Error('Engine OCR-VN lỗi và không có Tesseract dự phòng: ' + e.message), { code: 'OFFLINE_NOT_READY' });
      // rơi xuống Tesseract
    }
  }

  // 2) Tesseract dự phòng
  if (!tesseractAvailable()) throw Object.assign(new Error('Engine offline chưa sẵn sàng: cần dịch vụ ocr-vn hoặc tesseract-ocr + gói vie'), { code: 'OFFLINE_NOT_READY' });
  const ext = m[1] === 'jpeg' ? 'jpg' : m[1];
  const tmp = path.join(os.tmpdir(), `sdv-ocr-${crypto.randomBytes(6).toString('hex')}.${ext}`);
  await fs.promises.writeFile(tmp, Buffer.from(m[2], 'base64'));
  try {
    const tsv = await new Promise((resolve, reject) => {
      execFile(ENGINE.bin, [tmp, 'stdout', '-l', ENGINE.lang, '--psm', ENGINE.psm, 'tsv'],
        { timeout: 40000, maxBuffer: 12 * 1024 * 1024 },
        (e, stdout) => (e ? reject(e) : resolve(stdout)));
    });
    return parseTsv(tsv);
  } finally {
    fs.promises.unlink(tmp).catch(() => {}); // xóa ảnh tạm ngay (PII)
  }
}

function parseTsv(tsv) {
  const out = parseLines(ocrToLines(tsv));
  out.meta.engine = `${ENGINE.bin}-${ENGINE.lang} (offline)`;
  return out;
}

function parseLines(lines) {
  const warnings = [];
  const confSum = { id: null, dob: null, name: null, gender: null };
  const setConf = (k, v) => { if (v != null && (confSum[k] == null || v > confSum[k])) confSum[k] = v; };
  const labelIdx = (re) => lines.findIndex((l) => re.test(deaccent(l.text)));

  /* ---- Ngày sinh: ưu tiên ngày nằm trên dòng nhãn "Ngày sinh" hoặc 2 dòng kế ---- */
  let dob = null, dobRaw = null;
  const dateIn = (l, allow8 = false) => {
    for (const s of [l.text, ...(l.alts || [])]) {
      const dm = s.match(DATE_RE);
      if (dm) { const iso = toIsoDate(dm[1], dm[2], dm[3]); if (iso) return { iso, raw: dm[0] }; }
    }
    if (allow8) {
      for (const s of [l.text, ...(l.alts || [])]) {
        const d8 = s.replace(/\s/g, '').match(DATE8_RE);
        if (d8) { const iso = toIsoDate(d8[1], d8[2], d8[3]); if (iso) return { iso, raw: d8[0], weak: true }; }
      }
    }
    return null;
  };
  const iDob = labelIdx(LABELS.dob);
  if (iDob >= 0) {
    for (let j = iDob; j < Math.min(iDob + 3, lines.length) && !dob; j += 1) {
      if (j > iDob && ANY_LABEL.test(deaccent(lines[j].text)) && !DATE_RE.test(lines[j].text)) break;
      const d = dateIn(lines[j], true);
      if (d) {
        dob = d.iso; dobRaw = d.raw; setConf('dob', lineConf(lines[j]));
        if (d.weak) warnings.push('Ngày sinh đọc thiếu dấu phân cách — hãy kiểm tra');
      }
    }
  }
  if (!dob) {
    // không thấy nhãn: lấy ngày đầu tiên KHÔNG nằm cạnh nhãn ngày cấp/hết hạn và năm ≤ hiện tại - 10
    for (let i = 0; i < lines.length && !dob; i += 1) {
      const near = deaccent(lines[i].text) + ' ' + (i > 0 ? deaccent(lines[i - 1].text) : '');
      if (LABELS.expiry.test(near)) continue;
      const d = dateIn(lines[i]);
      if (d && Number(d.iso.slice(0, 4)) <= new Date().getFullYear() - 10) {
        dob = d.iso; dobRaw = d.raw; setConf('dob', lineConf(lines[i]));
        warnings.push('Không thấy nhãn "Ngày sinh" — ngày sinh được suy đoán, hãy kiểm tra');
      }
    }
  }

  /* ---- CCCD: 12 chữ số; xét cả phương án thay thế; chọn số khớp năm sinh ---- */
  const yy = dob ? dob.slice(2, 4) : null;
  const cands = [];
  lines.forEach((l, i) => {
    for (const s of [l.text, ...(l.alts || [])]) for (const d of digits12(s)) cands.push({ d, i, conf: lineConf(l) });
  });
  let idNumber = null, idLine = -1;
  if (cands.length) {
    const scoreOf = (c) => {
      let sc = 0;
      if (yy && c.d.slice(4, 6) === yy) sc += 2;                               // mã năm sinh (vị trí 5–6)
      if (dob) {                                                                // mã thế kỉ (vị trí 4)
        const cen = Math.floor(Number(c.d[3]) / 2);
        if (1900 + cen * 100 === Math.floor(Number(dob.slice(0, 4)) / 100) * 100) sc += 1;
      }
      const iId = labelIdx(LABELS.id);
      if (iId >= 0 && Math.abs(c.i - iId) <= 1) sc += 1;
      return sc + (c.conf || 0) * 0.5;
    };
    cands.sort((a, b) => scoreOf(b) - scoreOf(a));
    idNumber = cands[0].d; idLine = cands[0].i;
    setConf('id', cands[0].conf);
  } else warnings.push('Không đọc được số CCCD 12 chữ số — hãy nhập lại tay');

  /* ---- Họ tên: giá trị sau nhãn "Họ và tên"/"Họ, chữ đệm và tên khai sinh" hoặc 1–2 dòng dưới ---- */
  let name = null;
  const iName = labelIdx(LABELS.name);
  if (iName >= 0) {
    const opts = [];
    const same = afterLabel(lines[iName].text, LABELS.name).replace(/^[/|:.\s]+/, '');
    if (looksLikeName(same)) opts.push({ t: same, l: lines[iName] });
    for (let j = iName + 1; j < Math.min(iName + 3, lines.length); j += 1) {
      const t = lines[j].text.trim();
      if (looksLikeName(t)) opts.push({ t, l: lines[j] });
      else if (ANY_LABEL.test(deaccent(t)) && !LABELS.name.test(deaccent(t))) break;
    }
    const best = opts.find((o) => o.t === o.t.toUpperCase()) || opts[0];   // thẻ CCCD: họ tên IN HOA
    if (best) { name = best.t; setConf('name', lineConf(best.l)); }
  }
  if (!name) {
    // Dự phòng: dòng IN HOA dáng họ tên đầu tiên sau dòng số CCCD
    const start = idLine >= 0 ? idLine + 1 : 0;
    for (let j = start; j < Math.min(start + 4, lines.length) && !name; j += 1) {
      const t = lines[j].text.trim();
      if (looksLikeName(t) && t === t.toUpperCase()) {
        name = t; setConf('name', lineConf(lines[j]));
        warnings.push('Họ tên suy ra theo vị trí (không đọc rõ nhãn) — hãy kiểm tra');
      }
    }
  }
  if (name) {
    name = name.replace(/[.,:;|/]+$/g, '').replace(/\s+/g, ' ').trim();
    const fx = fixName(name);
    if (fx.fixed) { name = fx.name; if (confSum.name != null) confSum.name = Math.max(0, confSum.name - 0.04 * fx.fixed); }
  }
  else warnings.push('Không đọc được họ tên — hãy nhập lại tay');

  /* ---- Giới tính ---- */
  let gender = null;
  const G_RE = /(?:^|[\s/:])(Nam|Nữ|NAM|NỮ|nữ|nam|Nu|NU)(?=[\s/.,]|$)/;
  const pickG = (s) => { const g = String(s).match(G_RE); return g ? (g[1].toLowerCase() === 'nam' ? 'Nam' : 'Nữ') : null; };
  const iG = labelIdx(LABELS.gender);
  if (iG >= 0) {
    for (let j = iG; j < Math.min(iG + 3, lines.length) && !gender; j += 1) {
      const src = j === iG ? afterLabel(lines[j].text, LABELS.gender) || lines[j].text : lines[j].text;
      const g = pickG(' ' + src) || (lines[j].alts || []).map(pickG).find(Boolean);
      if (g) { gender = g; setConf('gender', lineConf(lines[j])); }
    }
  }
  if (!gender) {
    // quét dòng ngắn "Nam"/"Nữ" đứng riêng (bố cục thẻ: giá trị dưới nhãn)
    const l = lines.find((x) => /^(Nam|Nữ|NAM|NỮ)\.?$/.test(x.text.trim()));
    if (l) { gender = pickG(' ' + l.text); setConf('gender', lineConf(l)); }
  }
  if (!gender && idNumber && /\d/.test(idNumber[3])) {
    gender = Number(idNumber[3]) % 2 === 0 ? 'Nam' : 'Nữ';   // quy tắc mã thế kỉ–giới tính CCCD
    warnings.push('Giới tính suy ra từ số CCCD (không đọc rõ trên ảnh) — hãy kiểm tra');
  }
  if (!gender) warnings.push('Không đọc được giới tính — hãy chọn tay');

  /* ---- Kiểm tra chéo & điểm tin cậy tổng ---- */
  let cross = 0;
  if (idNumber && yy && idNumber.slice(4, 6) === yy) cross += 1;             // CCCD[4:6] = 2 số cuối năm sinh
  else if (idNumber && dob) warnings.push('CCCD và ngày sinh không khớp mã năm — kiểm tra kỹ');
  const confs = [confSum.id, confSum.dob, confSum.name, confSum.gender].filter((v) => v != null);
  let confidence = confs.length ? confs.reduce((a, v) => a + v, 0) / confs.length : null;
  if (confidence != null) {
    // phạt theo trường yếu nhất (1 trường đọc kém là đủ để cần người rà)
    const minC = Math.min(...confs);
    confidence = 0.7 * confidence + 0.3 * minC;
    confidence += cross * 0.02;                       // khớp chéo → cộng nhẹ
    const filled = [idNumber, dob, name, gender].filter(Boolean).length;
    confidence *= (0.6 + 0.1 * filled);               // thiếu trường → giảm mạnh
    confidence = Math.min(0.99, Math.max(0, Math.round(confidence * 1000) / 1000));
  }

  return {
    fields: {
      fullName: name || null,
      dob, gender, idNumber,
      mdid: null, className: null,
      confidence, warnings: warnings.slice(0, 5),
    },
    meta: { engine: 'offline', dobRaw, fieldConf: confSum },
  };
}

module.exports = { fixName, available, extract, parseTsv, parseLines, ocrVnToLines, deaccent, engineInfo, pingOcrVn };
