/**
 * ============ NHẬP HỒ SƠ TỪ ẢNH VNeID / CCCD + TỰ TẠO TÀI KHOẢN ============
 * Ba kênh nhập liệu (tăng dần tự động hóa):
 *   1. QR định danh mức 2 trên app VNeID — giải mã OFFLINE trong trình duyệt (jsQR),
 *      payload demo chuẩn SDV1:  SDV1|<cccd>|<hoTen>|<yyyy-mm-dd>|<gioiTinh>
 *   2. AI Vision đọc ảnh chụp (màn hình VNeID / thẻ CCCD) — cần AI_API_KEY model vision
 *   3. Nhập tay
 * Kênh nào cũng đi qua CÙNG một bước duyệt của cán bộ trước khi tạo hồ sơ + tài khoản.
 */
const express = require('express');
const crypto = require('crypto');
const { db, unitName } = require('../db');
const { requireAuth, audit } = require('../auth');
const { profileHash, profileCore, sha256Hex, canonicalize, txId } = require('../canonical');
const ledger = require('../ledger/simulator');
const config = require('../config');
const { ledgerError } = require('./members');
const aiOffline = require('../services/aiOffline');

const router = express.Router();

/* ---------- Tiện ích ---------- */
function slugName(fullName) {
  return String(fullName).normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd').replace(/Đ/g, 'D').toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 18) || 'doanvien';
}
function genUsername(base) {
  let u = slugName(base); let i = 0;
  while (db.prepare('SELECT 1 FROM users WHERE username=?').get(u)) { i += 1; u = slugName(base) + String(i).padStart(2, '0'); }
  return u;
}
function genPassword() {
  const chars = 'abcdefghjkmnpqrstuvwxyzABCDEFGHJKMNPQRSTUVWXYZ23456789';
  return Array.from(crypto.randomBytes(9)).map((b) => chars[b % chars.length]).join('');
}
function genMemberCode() {
  const year = new Date().getFullYear();
  let n = db.prepare('SELECT COUNT(*) n FROM members').get().n + 1;
  let code = `DV${year}${String(n).padStart(4, '0')}`;
  while (db.prepare('SELECT 1 FROM members WHERE memberCode=?').get(code)) { n += 1; code = `DV${year}${String(n).padStart(4, '0')}`; }
  return code;
}

/* ---------- P2: Cổng tự động nhập liệu + nhật kí AI (bảng ai_jobs) ---------- */
function newJobId() { return `AIJ-${txId().slice(0, 10).toUpperCase()}`; }

function logJob({ id, type = 'extract', status = 'DONE', model = null, imageHash = null,
                  confidence = null, warnings = [], pass = null, auto = 0, autoReason = null,
                  memberId = null, user = null }) {
  try {
    db.prepare(`INSERT INTO ai_jobs(id,type,status,model,imageHash,confidence,warningsJson,pass,auto,autoReason,memberId,createdBy,finishedAt)
                VALUES (?,?,?,?,?,?,?,?,?,?,?,?,datetime('now'))`)
      .run(id, type, status, model, imageHash, confidence, JSON.stringify(warnings || []).slice(0, 1000),
           pass, auto, autoReason, memberId, user ? user.username : null);
  } catch { /* nhật kí lỗi không được chặn nghiệp vụ */ }
}

/** Cổng tự động P2 (hàm thuần — unit-test được): có TỰ tạo hồ sơ từ kết quả AI không?
 *  Đủ điều kiện KHI: đủ 4 trường bắt buộc + tin cậy ≥ ngưỡng + KHÔNG cảnh báo + KHÔNG trùng. */
function decideAuto(fields, opts = {}) {
  const threshold = typeof opts.threshold === 'number' ? opts.threshold : config.AI_AUTO_THRESHOLD;
  const f = fields || {};
  const conf = typeof f.confidence === 'number' ? f.confidence : 0;
  const warnings = Array.isArray(f.warnings) ? f.warnings : [];
  const missing = ['fullName', 'dob', 'gender', 'idNumber'].filter((k) => !f[k]);
  if (missing.length) return { auto: false, reason: `Thiếu trường bắt buộc: ${missing.join(', ')}` };
  if (conf < threshold) return { auto: false, reason: `Điểm tin cậy ${conf.toFixed(2)} dưới ngưỡng tự động ${threshold.toFixed(2)} — chuyển cán bộ xác nhận` };
  if (warnings.length) return { auto: false, reason: `Có ${warnings.length} cảnh báo cần người rà: ${warnings[0]}` };
  if (opts.duplicate) return { auto: false, reason: opts.duplicate };
  return { auto: true, reason: `Đủ điều kiện tự động: tin cậy ${conf.toFixed(2)} ≥ ${threshold.toFixed(2)}, không cảnh báo, không trùng` };
}

/* ============ 1) AI VISION ĐỌC ẢNH (POST /intake/extract) ============
 * Pipeline chất lượng cao:
 *   Lượt 1: prompt chuyên sâu về bố cục màn hình VNeID ("Thông tin định danh") và
 *           thẻ CCCD 2 mặt (song ngữ Việt–Anh) → trích xuất JSON + độ tin cậy + cảnh báo.
 *   Lượt 2 (tự động): nếu thiếu trường bắt buộc hoặc sai định dạng → gửi lại cho AI
 *           kèm danh sách lỗi để sửa. Tối đa 2 lượt.
 *   Chuẩn hóa phía server: giới tính, ngày sinh (dd/mm/yyyy → YYYY-MM-DD), CCCD digits.
 */
const VISION_PROMPT = `Bạn là hệ thống trích xuất dữ liệu chuyên sâu từ ảnh màn hình ứng dụng VNeID và thẻ CCCD Việt Nam. Độ chính xác là tuyệt đối — không được bịa dữ liệu.

BỐ CỤC CẦN NHẬN DIỆN:
(1) Màn hình VNeID "Thông tin định danh" (định danh mức 2): tiêu đề "Thông tin định danh",
    các trường: "Số định danh cá nhân" (12 chữ số), "Họ và tên", "Ngày sinh" (dd/mm/yyyy),
    "Giới tính" (Nam/Nữ), "Quốc tịch" (Việt Nam), "Quê quán", "Nơi thường trú", "Ngày cấp",
    "Ngày hết hạn", kèm mã QR ở góc.
(2) Thẻ CĂN CƯỚC CÔNG DÂN / thẻ định danh cá nhân (mặt trước, song ngữ Việt–Anh):
    "Số/No.", "Họ và tên/Full name", "Ngày sinh/Date of birth", "Giới tính/Sex",
    "Quốc tịch/Nationality", "Quê quán/Place of origin", "Nơi thường trú/Place of residence".

QUY TẮC:
- Chỉ lấy dữ liệu thực sự CÓ trong ảnh; trường không đọc rõ → null và thêm cảnh báo.
- "Ngày sinh": chuẩn hóa về YYYY-MM-DD (ảnh ghi 05/10/2005 → "2005-10-05").
- "gender": chỉ "Nam" hoặc "Nữ".
- "idNumber": đúng 12 chữ số, chỉ gồm số.
- "className": luôn null (không có trên VNeID/CCCD).
- "confidence": độ tin cậy tổng thể 0..1 (giảm nếu ảnh mờ, chói, bị che).
- "warnings": mảng cảnh báo tiếng Việt ngắn, ví dụ: "Ảnh mờ, hãy kiểm tra số CCCD",
  "Không đọc được ngày sinh", "Ảnh chéo màn hình có vệt sáng".
- Nếu ảnh KHÔNG phải VNeID/CCCD → trả về {"error":"not_id"}.

TRẢ VỀ DUY NHẤT một JSON hợp lệ (không markdown, không chữ ngoài JSON).`;

function normalizeExtract(f) {
  const warnings = Array.isArray(f && f.warnings) ? f.warnings.slice(0, 5) : [];
  const out = {
    fullName: f && f.fullName ? String(f.fullName).replace(/\s+/g, ' ').trim() || null : null,
    dob: null, gender: null, idNumber: null,
    mdid: f && f.mdid ? String(f.mdid).trim() || null : null,
    className: null,
    confidence: typeof (f && f.confidence) === 'number' ? Math.min(1, Math.max(0, f.confidence)) : null,
    warnings,
  };
  // ngày sinh: chấp nhận dd/mm/yyyy, dd-mm-yyyy, yyyy-mm-dd
  const d = String((f && f.dob) || '').trim();
  let m = d.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/);
  if (m) out.dob = `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
  else if (/^\d{4}-\d{2}-\d{2}$/.test(d)) out.dob = d;
  else if (d) warnings.push('Ngày sinh đọc được nhưng sai định dạng — hãy nhập lại tay');
  // giới tính
  const g = String((f && f.gender) || '').trim().toLowerCase();
  if (g.startsWith('nữ') || g.startsWith('nư') || g.startsWith('nu') || g === 'female') out.gender = 'Nữ';
  else if (g.startsWith('nam') || g === 'male') out.gender = 'Nam';
  // CCCD
  const id = String((f && f.idNumber) || '').replace(/\D/g, '');
  if (id.length === 12) out.idNumber = id;
  else if (id) warnings.push('Số CCCD đọc được không đủ 12 chữ số — hãy nhập lại tay');
  out.warnings = warnings;
  return out;
}

function validateExtract(f) {
  const problems = [];
  if (!f.fullName || f.fullName.length < 3) problems.push('thiếu hoặc quá ngắn trường "fullName" (họ và tên)');
  if (!f.dob || !/^\d{4}-\d{2}-\d{2}$/.test(f.dob)) problems.push('thiếu/sai định dạng "dob" (cần YYYY-MM-DD)');
  if (!f.gender) problems.push('thiếu "gender" (Nam/Nữ)');
  if (!f.idNumber || !/^\d{12}$/.test(f.idNumber)) problems.push('thiếu/sai "idNumber" (cần đúng 12 chữ số CCCD)');
  return problems;
}

async function callVision(imageDataUrl, extraMessages = []) {
  const r = await fetch(`${config.AI_BASE_URL.replace(/\/$/, '')}/chat/completions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${config.AI_API_KEY}` },
    body: JSON.stringify({
      model: process.env.AI_VISION_MODEL || config.AI_MODEL,
      messages: [
        { role: 'system', content: VISION_PROMPT },
        ...extraMessages,
        { role: 'user', content: [
          { type: 'text', text: 'Trích xuất dữ liệu định danh từ ảnh này.' },
          { type: 'image_url', image_url: { url: imageDataUrl } },
        ] },
      ],
      temperature: 0,
      max_tokens: 400,
    }),
    signal: AbortSignal.timeout(45000),
  });
  const data = await r.json().catch(() => ({}));
  const text = (data && data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content) || '';
  const jsonText = text.slice(text.indexOf('{'), text.lastIndexOf('}') + 1);
  if (!jsonText) throw Object.assign(new Error('AI trả về rỗng/không đọc được'), { raw: text.slice(0, 200) });
  return JSON.parse(jsonText);
}

router.post('/intake/extract', requireAuth('CHI_DOAN', 'LIEN_CHI', 'DOAN_TRUONG', 'QUAN_TRI'), async (req, res) => {
  const mockMode = config.AI_MOCK_EXTRACT; // CHỈ DEMO: kết quả mẫu, không cần key
  // P2b — chọn engine: mock (demo) → offline Tesseract → cloud AI Vision
  const provider = config.AI_PROVIDER === 'cloud' ? 'cloud'
    : config.AI_PROVIDER === 'offline' ? 'offline'
    : (config.AI_API_KEY ? 'cloud' : 'offline');
  const offlineOk = aiOffline.available();
  if (mockMode) { /* demo đi tiếp */ }
  else if (provider === 'offline' && !offlineOk) {
    return res.status(503).json({
      error: 'Chưa có engine AI nào: (1) offline — bật dịch vụ ocr-vn (systemctl start ocr-vn) hoặc cài tesseract-ocr-vie, hoặc (2) đám mây — điền AI_API_KEY vào server/.env. Tạm thời dùng kênh Quét QR VNeID hoặc Nhập tay.',
      code: 'AI_NOT_CONFIGURED',
    });
  } else if (provider === 'cloud' && !config.AI_API_KEY) {
    return res.status(503).json({
      error: 'Chức năng AI đọc ảnh cần cấu hình AI_API_KEY (model hỗ trợ ảnh như gpt-4o-mini). Hiện có thể dùng kênh Quét QR VNeID hoặc Nhập tay.',
      code: 'AI_NOT_CONFIGURED',
    });
  }
  const img = String(req.body && req.body.image || '');
  if (!img.startsWith('data:image/')) return res.status(400).json({ error: 'Thiếu ảnh (data:image/...;base64,...)' });
  if (img.length > 8000000) return res.status(413).json({ error: 'Ảnh quá lớn — hãy chụp lại với độ phân giải thấp hơn' });

  const jobId = newJobId();
  const imageHash = sha256Hex(img).slice(0, 16); // vết ảnh (không lưu ảnh)
  let model = mockMode ? 'mock-demo (AI_MOCK_EXTRACT)'
    : provider === 'offline' ? `${aiOffline.engineInfo().name} (offline)`
    : (process.env.AI_VISION_MODEL || config.AI_MODEL);
  try {
    let fields, pass = 1;
    if (mockMode) {
      fields = normalizeExtract({ fullName: 'Trần Thị Hoài An', dob: '18/03/2006', gender: 'Nữ',
        idNumber: '205123456789', confidence: 0.97, warnings: [] });
    } else if (provider === 'offline') {
      // Engine offline: OCR + quy tắc — 1 lượt, xác định (không retry LLM)
      const r = await aiOffline.extract(img);
      fields = normalizeExtract(r.fields);
      if (r.meta && r.meta.engine) model = r.meta.engine;
    } else {
      // Lượt 1 (cloud)
      fields = normalizeExtract(await callVision(img));
      let problems = validateExtract(fields);
      // Lượt 2: tự sửa nếu thiếu/sai (chỉ cloud — offline là xác định 1 lượt)
      if (problems.length && provider === 'cloud') {
        pass = 2;
        const fixed = normalizeExtract(await callVision(img, [
          { role: 'assistant', content: JSON.stringify(fields) },
          { role: 'user', content: 'Kết quả trước CÓ LỖI: ' + problems.join('; ') +
            '. Hãy nhìn kỹ lại ảnh (có thể phóng các vùng chữ nhỏ) và trả về JSON đã SỬA đúng quy tắc.' },
        ]));
        const problems2 = validateExtract(fixed);
        if (problems2.length <= problems.length) {
          fixed.warnings = [...new Set([...fixed.warnings, ...problems2.map((p) => 'Cần rà tay: ' + p)])];
          fields = fixed;
          problems = problems2;
        } else {
          fields.warnings = [...new Set([...fields.warnings, ...problems.map((p) => 'Cần rà tay: ' + p)])];
        }
      }
    }

    // Kiểm tra trùng CCCD TRƯỚC khi ra quyết định tự động
    let duplicate = null;
    if (fields.idNumber) {
      const dup = db.prepare('SELECT memberCode FROM members WHERE cccd=?').get(fields.idNumber);
      if (dup) duplicate = `Trùng số CCCD với hồ sơ đã có (${dup.memberCode})`;
    }

    // ── CỔNG TỰ ĐỘNG P2 ──
    const wantAuto = req.body && req.body.auto === true;
    const unitOk = req.user.role === 'CHI_DOAN' ? req.user.unitId : ((req.body && req.body.unitId) || null);
    let decision = decideAuto(fields, { duplicate });
    if (decision.auto && !unitOk) decision = { auto: false, reason: 'Chưa xác định chi đoàn tiếp nhận — cán bộ cần chọn đơn vị' };

    if (wantAuto && decision.auto) {
      try {
        const autoCreated = enrollCore(req.user, {
          fullName: fields.fullName, dob: fields.dob, gender: fields.gender, idNumber: fields.idNumber,
          className: fields.className || undefined,
          source: 'ai_ocr', createAccount: true,
          notes: `Tự động bởi AI (${jobId}, model ${model}, tin cậy ${Number(fields.confidence).toFixed(2)})`,
          auto: true, jobId,
        });
        logJob({ id: jobId, model, imageHash, confidence: fields.confidence, warnings: fields.warnings,
                 pass, auto: 1, autoReason: decision.reason, memberId: autoCreated.member.id, user: req.user });
        audit(req, 'Intake.AutoEnroll', `${autoCreated.member.id} (${fields.fullName}) job=${jobId} conf=${Number(fields.confidence).toFixed(2)}`);
        return res.json({ fields, source: 'ai_ocr', model, pass, jobId, autoCreated, autoDecision: decision, mock: mockMode || undefined });
      } catch (e) {
        decision = { auto: false, reason: 'Tự tạo hồ sơ thất bại: ' + e.message + ' — chuyển cán bộ' };
      }
    }
    logJob({ id: jobId, model, imageHash, confidence: fields.confidence, warnings: fields.warnings,
             pass, auto: 0, autoReason: decision.reason, user: req.user });
    audit(req, 'Intake.Extract.AI', `${fields.fullName || '?'} pass=${pass} job=${jobId} auto=${decision.auto ? 'eligible' : 'no'}`);
    res.json({ fields, source: 'ai_ocr', model, pass, jobId, autoDecision: decision, mock: mockMode || undefined });
  } catch (e) {
    logJob({ id: jobId, status: 'FAILED', model, imageHash, autoReason: e.message, user: req.user });
    if (e.raw) return res.status(502).json({ error: 'AI trả về dữ liệu không đọc được: ' + e.raw });
    res.status(502).json({ error: 'Lỗi khi gọi AI: ' + e.message });
  }
});

/* Trạng thái cấu hình AI Vision (giao diện hiển thị) */
router.get('/intake/status', requireAuth(), (req, res) => {
  res.json({
    aiConfigured: !!config.AI_API_KEY,
    visionModel: process.env.AI_VISION_MODEL || config.AI_MODEL,
    baseUrl: config.AI_BASE_URL,
    vneidProvider: (require('../services/vneid').PROVIDER) || 'mock',
    qrOffline: true,
    // P2 — cổng tự động
    autoThreshold: config.AI_AUTO_THRESHOLD,
    mockExtract: config.AI_MOCK_EXTRACT,
    autoAvailable: !!config.AI_API_KEY || config.AI_MOCK_EXTRACT || aiOffline.available(),
    // P2b — engine offline
    offlineEngine: { available: aiOffline.available(), ...aiOffline.engineInfo() },
    provider: config.AI_PROVIDER === 'cloud' ? 'cloud'
      : config.AI_PROVIDER === 'offline' ? 'offline'
      : (config.AI_API_KEY ? 'cloud' : (aiOffline.available() ? 'offline' : 'none')),
  });
});

/* ============ 2) TẠO HỒ SƠ + TÀI KHOẢN ============
 * enrollCore: dùng chung cho route POST /intake/enroll VÀ cổng tự động P2 (extract auto).
 * Ném Error kèm .status khi dữ liệu sai; trả { member, account, tx, verifyTx }. */
function enrollCore(user, b) {
  if (!b.fullName || !String(b.fullName).trim()) throw Object.assign(new Error('Thiếu họ tên'), { status: 400 });
  const cccd = b.idNumber ? String(b.idNumber).replace(/\D/g, '') : '';
  if (b.idNumber && cccd.length !== 12) throw Object.assign(new Error('CCCD phải gồm đúng 12 chữ số'), { status: 400 });

  let unitId = b.unitId;
  if (user.role === 'CHI_DOAN') unitId = user.unitId;
  if (!db.prepare('SELECT id FROM units WHERE id=?').get(unitId)) throw Object.assign(new Error('Đơn vị không hợp lệ'), { status: 400 });
  if (cccd && db.prepare('SELECT id FROM members WHERE cccd=?').get(cccd)) {
    throw Object.assign(new Error('Số CCCD này đã tồn tại trong hệ thống'), { status: 409 });
  }

  const id = `DV-${new Date().getFullYear()}-${crypto.randomInt(1000, 9999)}`;
  const memberCode = b.memberCode || genMemberCode();
  const joinDate = b.joinDate || new Date().toISOString().slice(0, 10);
  const profile = {
    id, memberCode, fullName: String(b.fullName).trim(), dob: b.dob || '', gender: b.gender || '',
    className: b.className || '', unitId, unitName: unitName(unitId),
    joinDate, joinPlace: b.joinPlace || 'Đoàn trường Đại học Cần Thơ',
    phone: b.phone || '', email: b.email || '', homeAddress: b.homeAddress || '',
  };
  const pHash = profileHash(profileCore(profile));

  // Ledger trước — nếu từ chối thì không tạo gì ở DB (quy tắc ghi kép)
  let led;
  try {
    led = ledger.submit(user, 'CreateMemberProfile', {
      memberId: id, memberCode, unitId, unitName: unitName(unitId), profileHash: pHash,
      createdBy: `${user.username} (nhập từ ${b.source || 'manual'}${b.auto ? ', TỰ ĐỘNG theo cổng tin cậy' : ''})`,
    });
  } catch (e) { throw Object.assign(new Error(e.message || 'Lỗi ledger'), { status: 503, ledger: true }); }

  // Xác thực định danh ngay nếu dữ liệu đến từ QR VNeID / AI đọc được CCCD
  let verifyTx = null;
  const idVerify = {};
  if ((b.source === 'vneid_qr' || b.source === 'ai_ocr') && cccd) {
    const resultHash = sha256Hex(canonicalize({ memberId: id, cccdLast4: cccd.slice(-4), src: b.source, at: new Date().toISOString() }));
    try {
      verifyTx = ledger.submit(user, 'VerifyIdentity', {
        memberId: id, resultHash, provider: b.source === 'vneid_qr' ? 'VNeID QR (mức 2)' : 'AI đọc ảnh',
        note: 'Kết nạp kèm xác thực định danh điện tử',
      });
      Object.assign(idVerify, {
        idVerifyStatus: 'VERIFIED', idVerifySource: b.source,
        idVerifyAt: new Date().toISOString(), idVerifyRef: `QR-${txId().slice(0, 8).toUpperCase()}`,
      });
    } catch { /* peer offline: vẫn tạo hồ sơ, cán bộ xác thực lại sau */ }
  }

  // Tài khoản đăng nhập cho học sinh
  let account = null;
  const createAccount = b.createAccount !== false;
  try {
    db.transaction(() => {
      db.prepare(`INSERT INTO members(id,memberCode,fullName,dob,gender,cccd,phone,email,className,unitId,joinDate,joinPlace,homeAddress,notes,status,profileHash,lastTxId,lastSyncAt,updatedAt,idVerifyStatus,idVerifySource,idVerifyAt,idVerifyRef,mdid,createdByAi,aiJobId)
                  VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,'ACTIVE',?,?,datetime('now'),datetime('now'),?,?,?,?,?,?,?)`)
        .run(id, memberCode, profile.fullName, profile.dob, profile.gender, cccd, profile.phone, profile.email,
          profile.className, unitId, profile.joinDate, profile.joinPlace, profile.homeAddress, b.notes || '',
          pHash, led.txId, idVerify.idVerifyStatus || null, idVerify.idVerifySource || null,
          idVerify.idVerifyAt || null, idVerify.idVerifyRef || null, idVerify.mdid || null,
          b.auto ? 1 : 0, b.jobId || null);

      if (createAccount) {
        const username = b.username ? String(b.username).trim().toLowerCase() : genUsername(slugName(profile.fullName));
        if (db.prepare('SELECT 1 FROM users WHERE username=?').get(username)) throw Object.assign(new Error('Tên đăng nhập đã tồn tại'), { status: 409 });
        const password = genPassword();
        db.prepare('INSERT INTO users(id,username,passwordHash,displayName,role,unitId,memberId) VALUES (?,?,?,?,?,?,?)')
          .run(`U-${txId().slice(0, 10)}`, username, require('bcryptjs').hashSync(password, 8), profile.fullName, 'DOAN_VIEN', unitId, id);
        account = { username, password };
      }
    })();
  } catch (e) {
    if (e.message === 'Tên đăng nhập đã tồn tại') throw Object.assign(new Error(e.message), { status: 409 });
    throw Object.assign(new Error('Lỗi khi tạo dữ liệu: ' + e.message), { status: 500 });
  }

  audit({ user }, 'Intake.Enroll', `${id} (${profile.fullName}) source=${b.source || 'manual'}${b.auto ? ' AUTO' : ''} account=${account ? account.username : 'không'}`);
  return {
    member: db.prepare('SELECT id, memberCode, fullName, unitId, idVerifyStatus, profileHash FROM members WHERE id=?').get(id),
    account, tx: led, verifyTx: verifyTx ? verifyTx.txId : null,
  };
}

router.post('/intake/enroll', requireAuth('CHI_DOAN', 'DOAN_TRUONG'), (req, res) => {
  try {
    res.status(201).json(enrollCore(req.user, req.body || {}));
  } catch (e) {
    if (e.status) return res.status(e.status).json({ error: e.message });
    return res.status(500).json({ error: 'Lỗi khi tạo dữ liệu: ' + e.message });
  }
});

/* ============ 3) Gợi ý tên đăng nhập trống (check realtime) ============ */
router.get('/intake/username-check', requireAuth('CHI_DOAN', 'DOAN_TRUONG'), (req, res) => {
  const u = String(req.query.u || '').trim().toLowerCase();
  if (!u) return res.json({ available: false });
  res.json({ available: !db.prepare('SELECT 1 FROM users WHERE username=?').get(u) });
});

module.exports = { router, decideAuto };
