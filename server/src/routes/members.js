/**
 * ============ NGHIỆP VỤ HỒ SƠ ĐOÀN VIÊN ============
 * Quy tắc "ghi kép": cập nhật off-chain DB + tính hash mới + ghi giao dịch lên
 * ledger. Nếu ledger từ chối (peer offline / sai quyền) → hoàn tác DB để đảm bảo
 * tính nhất quán on-chain/off-chain (đề cương mục 8.9).
 */
const express = require('express');
const crypto = require('crypto');
const { db, unitName } = require('../db');
const { requireAuth, scopeOf, scopeWhere, audit } = require('../auth');
const { profileHash, profileCore, txId } = require('../canonical');
const ledger = require('../ledger/simulator');
const { verifyIdentity, PROVIDER } = require('../services/vneid');

const router = express.Router();

/* ---------- Danh sách đoàn viên (phân quyền theo phạm vi) ---------- */
router.get('/members', requireAuth(), (req, res) => {
  const scope = scopeWhere(scopeOf(req.user));
  const q = (req.query.query || '').trim().toLowerCase();
  const unit = req.query.unitId || '';
  const status = req.query.status || '';
  let sql = `SELECT m.*, u.name AS unitName FROM members m LEFT JOIN units u ON u.id=m.unitId WHERE ${scope.sql}`;
  const params = [...scope.params];
  if (q) {
    sql += ' AND (LOWER(m.fullName) LIKE ? OR LOWER(m.memberCode) LIKE ? OR LOWER(m.id) LIKE ?)';
    params.push(`%${q}%`, `%${q}%`, `%${q}%`);
  }
  if (unit && req.user.role !== 'DOAN_VIEN') { sql += ' AND m.unitId=?'; params.push(unit); }
  if (status) { sql += ' AND m.status=?'; params.push(status); }
  sql += ' ORDER BY m.id LIMIT 200';
  const rows = db.prepare(sql).all(...params).map((r) => ({ ...r, cccd: req.user.role === 'QUAN_TRI' || req.user.role === 'DOAN_TRUONG' ? r.cccd : maskCccd(r.cccd) }));
  res.json({ members: rows, total: rows.length });
});

/* ---------- Tạo hồ sơ đoàn viên (kết nạp) ---------- */
router.post('/members', requireAuth('CHI_DOAN', 'DOAN_TRUONG'), (req, res) => {
  const b = req.body || {};
  for (const f of ['fullName', 'memberCode', 'unitId']) {
    if (!b[f]) return res.status(400).json({ error: `Thiếu trường bắt buộc: ${f}` });
  }
  let unitId = b.unitId;
  if (req.user.role === 'CHI_DOAN') unitId = req.user.unitId; // chi đoàn chỉ tạo hồ sơ trong đơn vị mình
  if (!db.prepare('SELECT id FROM units WHERE id=?').get(unitId)) return res.status(400).json({ error: 'Đơn vị không tồn tại' });
  if (db.prepare('SELECT 1 FROM members WHERE memberCode=?').get(b.memberCode)) {
    return res.status(409).json({ error: 'Mã đoàn viên đã tồn tại' });
  }

  const id = `DV-${new Date().getFullYear()}-${crypto.randomInt(1000, 9999)}`;
  const profile = {
    id, memberCode: b.memberCode, fullName: b.fullName, dob: b.dob || '', gender: b.gender || '',
    className: b.className || '', unitId, unitName: unitName(unitId), joinDate: b.joinDate || '', joinPlace: b.joinPlace || '',
    phone: b.phone || '', email: b.email || '', homeAddress: b.homeAddress || '', status: 'ACTIVE',
  };
  const pHash = profileHash(profileCore(profile));

  let led;
  try {
    led = ledger.submit(req.user, 'CreateMemberProfile', {
      memberId: id, memberCode: b.memberCode, unitId, unitName: unitName(unitId), profileHash: pHash, createdBy: req.user.username,
    });
  } catch (e) {
    return ledgerError(res, e);
  }

  db.prepare(`INSERT INTO members(id,memberCode,fullName,dob,gender,cccd,phone,email,className,unitId,joinDate,joinPlace,homeAddress,notes,status,profileHash,lastTxId,lastSyncAt,updatedAt)
              VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,'ACTIVE',?,?,datetime('now'),datetime('now'))`)
    .run(id, b.memberCode, b.fullName, b.dob || '', b.gender || '', b.cccd || '', b.phone || '', b.email || '',
      b.className || '', unitId, b.joinDate || '', b.joinPlace || '', b.homeAddress || '', b.notes || '', pHash, led.txId);
  audit(req, 'CreateMemberProfile', `${id} - ${b.fullName}`);
  res.status(201).json({ member: db.prepare('SELECT * FROM members WHERE id=?').get(id), tx: led });
});

/* ---------- Chi tiết hồ sơ + lịch sử ledger + trạng thái đối soát ---------- */
router.get('/members/:id', requireAuth(), (req, res) => {
  const m = db.prepare('SELECT m.*, u.name AS unitName FROM members m LEFT JOIN units u ON u.id=m.unitId WHERE m.id=?').get(req.params.id);
  if (!m) return res.status(404).json({ error: 'Không tìm thấy hồ sơ' });
  const scope = scopeOf(req.user);
  if (scope.mode === 'SELF' && scope.memberId !== m.id) return res.status(403).json({ error: 'Bạn chỉ được xem hồ sơ của chính mình' });
  if (scope.mode === 'UNITS' && !scope.unitIds.includes(m.unitId)) return res.status(403).json({ error: 'Ngoài phạm vi đơn vị của bạn' });

  const activities = db.prepare('SELECT * FROM activities WHERE memberId=? ORDER BY activityDate DESC, createdAt DESC').all(m.id);
  const transfers = db.prepare('SELECT t.*, un1.name AS fromName, un2.name AS toName FROM transfers t LEFT JOIN units un1 ON un1.id=t.fromUnit LEFT JOIN units un2 ON un2.id=t.toUnit WHERE t.memberId=? ORDER BY requestedAt DESC').all(m.id);
  let history = [];
  let verify = { consistent: null };
  try {
    history = ledger.query(req.user, 'GetMemberHistory', { memberId: m.id });
    const currentHash = profileHash(profileCore(m));
    const r = ledger.query(req.user, 'VerifyProfileHash', { memberId: m.id, hashToCheck: currentHash });
    verify = { consistent: !!r.match, offchainHash: currentHash, ledgerHash: r.ledgerHash };
  } catch { /* ledger mô phỏng chưa khởi tạo */ }
  res.json({
    member: { ...m, cccd: req.user.role === 'DOAN_VIEN' ? maskCccd(m.cccd, true) : (['QUAN_TRI', 'DOAN_TRUONG'].includes(req.user.role) ? m.cccd : maskCccd(m.cccd)) },
    activities, transfers, history, verify,
  });
});

/* ---------- Cập nhật hồ sơ ---------- */
router.patch('/members/:id', requireAuth('CHI_DOAN', 'DOAN_TRUONG'), (req, res) => {
  const m = db.prepare('SELECT * FROM members WHERE id=?').get(req.params.id);
  if (!m) return res.status(404).json({ error: 'Không tìm thấy hồ sơ' });
  if (req.user.role === 'CHI_DOAN' && req.user.unitId !== m.unitId) {
    return res.status(403).json({ error: 'Chỉ được cập nhật đoàn viên thuộc chi đoàn của mình' });
  }
  const editable = ['fullName', 'dob', 'gender', 'className', 'phone', 'email', 'homeAddress', 'notes', 'joinDate', 'joinPlace'];
  const next = { ...dbProfile(m) };
  const changes = {};
  for (const k of editable) if (k in (req.body || {}) && String(req.body[k] ?? '') !== String(m[k] ?? '')) { next[k] = req.body[k]; changes[k] = req.body[k]; }
  if (!Object.keys(changes).length) return res.json({ member: m, changed: false });
  const newHash = profileHash(profileCore(next));

  let led;
  try {
    led = ledger.submit(req.user, 'UpdateMemberProfile', {
      memberId: m.id, newProfileHash: newHash,
      changeType: Object.keys(changes).join(','), note: req.body.changeNote || 'Cập nhật thông tin hồ sơ',
    });
  } catch (e) { return ledgerError(res, e); }

  const sets = Object.keys(changes).map((k) => `${k}=?`).join(',');
  db.prepare(`UPDATE members SET ${sets}, profileHash=?, lastTxId=?, lastSyncAt=datetime('now'), updatedAt=datetime('now') WHERE id=?`)
    .run(...Object.values(changes), newHash, led.txId, m.id);
  audit(req, 'UpdateMemberProfile', `${m.id}: ${JSON.stringify(changes)}`);
  res.json({ member: db.prepare('SELECT * FROM members WHERE id=?').get(m.id), tx: led, changed: true });
});

/* ---------- Ghi nhận hoạt động / đánh giá / khen thưởng / kỷ luật ---------- */
router.post('/members/:id/activities', requireAuth('CHI_DOAN', 'DOAN_TRUONG'), (req, res) => {
  const m = db.prepare('SELECT * FROM members WHERE id=?').get(req.params.id);
  if (!m) return res.status(404).json({ error: 'Không tìm thấy hồ sơ' });
  if (req.user.role === 'CHI_DOAN' && req.user.unitId !== m.unitId) {
    return res.status(403).json({ error: 'Chỉ được ghi hoạt động cho đoàn viên thuộc chi đoàn của mình' });
  }
  const b = req.body || {};
  if (!b.title || !b.type) return res.status(400).json({ error: 'Thiếu loại hoạt động hoặc tiêu đề' });
  const act = {
    id: `HD-${txId().slice(0, 10).toUpperCase()}`, memberId: m.id, type: b.type, title: b.title,
    detail: b.detail || '', activityDate: b.activityDate || new Date().toISOString().slice(0, 10),
  };
  let led;
  try {
    led = ledger.submit(req.user, 'RecordActivity', {
      memberId: m.id, activityId: act.id, activityHash: profileHash(act), summary: act.title,
    });
  } catch (e) { return ledgerError(res, e); }
  db.prepare('INSERT INTO activities(id,memberId,type,title,detail,activityDate,hash,txId,createdBy) VALUES (?,?,?,?,?,?,?,?,?)')
    .run(act.id, act.memberId, act.type, act.title, act.detail, act.activityDate, profileHash(act), led.txId, req.user.username);
  audit(req, 'RecordActivity', `${m.id}: ${act.title}`);
  res.status(201).json({ activity: act, tx: led });
});

/* ---------- Xác thực định danh điện tử (VNeID/eKYC qua services/vneid.js) ---------- */
router.post('/members/:id/verify-identity', requireAuth('CHI_DOAN', 'DOAN_TRUONG'), async (req, res) => {
  const m = db.prepare('SELECT * FROM members WHERE id=?').get(req.params.id);
  if (!m) return res.status(404).json({ error: 'Không tìm thấy hồ sơ' });
  if (req.user.role === 'CHI_DOAN' && req.user.unitId !== m.unitId) {
    return res.status(403).json({ error: 'Chỉ được xác thực đoàn viên thuộc chi đoàn của mình' });
  }
  const b = req.body || {};
  const input = { cccd: b.cccd, mdid: b.mdid, fullName: b.fullName ?? m.fullName, dob: b.dob ?? m.dob, gender: m.gender };
  if (!input.cccd && !input.mdid) return res.status(400).json({ error: 'Cần nhập số CCCD (hoặc mã định danh điện tử)' });

  const vres = await verifyIdentity(input);
  if (!vres.ok) {
    db.prepare("UPDATE members SET idVerifyStatus='FAILED', idVerifySource=?, idVerifyAt=datetime('now') WHERE id=?").run(vres.provider || PROVIDER, m.id);
    audit(req, 'IdentityVerify.FAIL', `${m.id}: ${vres.code}`);
    const httpCode = vres.code === 'INVALID_INPUT' ? 400 : 422;
    return res.status(httpCode).json({ error: vres.message, code: vres.code, provider: vres.provider || PROVIDER });
  }

  // Ghi vết kết quả lên ledger (hash kết quả — không chứa dữ liệu cá nhân)
  let led;
  try {
    led = ledger.submit(req.user, 'VerifyIdentity', {
      memberId: m.id, resultHash: vres.resultHash, provider: vres.provider,
      note: `Xác thực định danh điện tử mức ${vres.level || 2} qua ${vres.provider}`,
    });
  } catch (e) { return ledgerError(res, e); }

  db.prepare("UPDATE members SET idVerifyStatus='VERIFIED', idVerifySource=?, idVerifyAt=?, idVerifyRef=?, mdid=?, cccd=COALESCE(NULLIF(?,''),cccd) WHERE id=?")
    .run(vres.provider, vres.at, vres.refCode, vres.mdid, b.cccd || '', m.id);
  audit(req, 'IdentityVerify.OK', `${m.id} ref=${vres.refCode}`);
  res.json({
    member: db.prepare('SELECT * FROM members WHERE id=?').get(m.id),
    result: { verified: true, provider: vres.provider, level: vres.level, mdid: vres.mdid, refCode: vres.refCode, matched: vres.matched, at: vres.at },
    tx: led,
  });
});

/* ---------- Lịch sử giao dịch trên ledger của hồ sơ ---------- */
router.get('/members/:id/history', requireAuth(), (req, res) => {
  try {
    res.json({ history: ledger.query(req.user, 'GetMemberHistory', { memberId: req.params.id }) });
  } catch (e) { return ledgerError(res, e); }
});

/* ---------- Xác minh hash hồ sơ (VerifyProfileHash) ---------- */
router.post('/members/:id/verify', requireAuth(), (req, res) => {
  const m = db.prepare('SELECT * FROM members WHERE id=?').get(req.params.id);
  if (!m) return res.status(404).json({ error: 'Không tìm thấy hồ sơ' });
  const hashToCheck = req.body?.hash || profileHash(profileCore(m));
  const r = ledger.query(req.user, 'VerifyProfileHash', { memberId: m.id, hashToCheck });
  audit(req, 'VerifyProfileHash', `${m.id} → ${r.match ? 'KHỚP' : 'LỆCH'}`);
  res.json({ memberId: m.id, memberCode: m.memberCode, fullName: m.fullName, ...r, offchainHash: hashToCheck });
});

/** Chuyển profile DB (đầy đủ, có cccd) thành cấu trúc dùng để băm */
function dbProfile(m) {
  return {
    id: m.id, memberCode: m.memberCode, fullName: m.fullName, dob: m.dob || '', gender: m.gender || '',
    className: m.className || '', unitId: m.unitId, unitName: unitName(m.unitId),
    joinDate: m.joinDate || '', joinPlace: m.joinPlace || '',
    phone: m.phone || '', email: m.email || '', homeAddress: m.homeAddress || '', status: m.status,
  };
}

function maskCccd(cccd, self) {
  if (!cccd) return '';
  if (self) return cccd.slice(0, 3) + '*'.repeat(Math.max(0, cccd.length - 6)) + cccd.slice(-3);
  return '*'.repeat(cccd.length);
}

function ledgerError(res, e) {
  if (e.code === 'ENDORSEMENT_OFFLINE') return res.status(503).json({ error: e.message, code: e.code });
  if (e.code === 'ACL_DENIED') return res.status(403).json({ error: e.message, code: e.code });
  if (e.code === 'NOT_FOUND') return res.status(404).json({ error: e.message, code: e.code });
  return res.status(409).json({ error: e.message, code: e.code || 'LEDGER_ERROR' });
}

module.exports = { router, dbProfile, ledgerError, maskCccd };
