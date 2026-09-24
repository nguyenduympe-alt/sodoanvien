/**
 * ============ API QUẢN TRỊ HỆ THỐNG ============
 * Đối soát, cảnh báo, snapshot/phục hồi, bật/tắt peer mô phỏng, quản lí tài khoản.
 * (Đề cương: quản trị chỉ can thiệp kỹ thuật theo quy trình được ghi vết.)
 */
const express = require('express');
const bcrypt = require('bcryptjs');
const { db, reseed } = require('../db');
const { requireAuth, audit } = require('../auth');
const { profileHash } = require('../canonical');
const ledger = require('../ledger/simulator');
const { reconcileAll } = require('../services/reconcile');
const { createSnapshot, listSnapshots, restoreSnapshot } = require('../services/backup');
const { dbProfile, ledgerError } = require('./members');

const router = express.Router();
const ADMIN = requireAuth('QUAN_TRI');

/* ---------- Tổng quan ---------- */
router.get('/admin/overview', ADMIN, (req, res) => {
  const counts = {
    members: db.prepare('SELECT COUNT(*) n FROM members').get().n,
    users: db.prepare('SELECT COUNT(*) n FROM users').get().n,
    activities: db.prepare('SELECT COUNT(*) n FROM activities').get().n,
    transfersPending: db.prepare("SELECT COUNT(*) n FROM transfers WHERE status='PENDING'").get().n,
    alertsOpen: db.prepare("SELECT COUNT(*) n FROM alerts WHERE status='OPEN'").get().n,
    locked: db.prepare("SELECT COUNT(*) n FROM members WHERE status='LOCKED_ANOMALY'").get().n,
  };
  res.json({ counts, orgs: ledger.getOrgs(), lastRecovery: getLastRecovery() });
});

function getLastRecovery() {
  const row = db.prepare("SELECT value FROM meta WHERE key='lastRecovery'").get();
  return row ? JSON.parse(row.value) : null;
}

/* ---------- Đối soát on-chain/off-chain ---------- */
router.post('/admin/reconcile', ADMIN, (req, res) => {
  const report = reconcileAll(req.user);
  audit(req, 'Reconcile', `kiểm tra ${report.checked}, khớp ${report.matched}, lệch ${report.anomalies.length}`);
  res.json(report);
});

/* ---------- Cảnh báo ---------- */
router.get('/admin/alerts', ADMIN, (req, res) => {
  const rows = db.prepare(`SELECT a.*, m.fullName, m.memberCode FROM alerts a LEFT JOIN members m ON m.id=a.memberId ORDER BY a.createdAt DESC LIMIT 100`).all();
  res.json({ alerts: rows });
});
router.post('/admin/alerts/:id/resolve', ADMIN, (req, res) => {
  db.prepare("UPDATE alerts SET status='RESOLVED', resolvedAt=datetime('now'), resolvedBy=? WHERE id=?").run(req.user.username, req.params.id);
  audit(req, 'ResolveAlert', req.params.id);
  res.json({ ok: true });
});

/* ---------- [DEMO] Giả lập sửa trái phép dữ liệu off-chain (kịch bản 6) ---------- */
router.post('/admin/dev/tamper/:memberId', ADMIN, (req, res) => {
  const m = db.prepare('SELECT * FROM members WHERE id=?').get(req.params.memberId);
  if (!m) return res.status(404).json({ error: 'Không tìm thấy đoàn viên' });
  const { field = 'phone', value = '0900xxxxxxx (bị sửa trái phép)' } = req.body || {};
  // Ghi THẲNG vào DB, CỐ Ý không tính lại hash — mô phỏng kẻ xấu can thiệp CSDL
  const allowed = ['fullName', 'phone', 'email', 'homeAddress', 'joinDate'];
  if (!allowed.includes(field)) return res.status(400).json({ error: `Chỉ được can thiệp: ${allowed.join(', ')}` });
  db.prepare(`UPDATE members SET ${field}=? WHERE id=?`).run(value, m.id);
  audit(req, 'DEV.TamperOffChain', `${m.id} field=${field} (mô phỏng tấn công, KHÔNG cập nhật hash)`);
  res.json({ ok: true, note: 'Đã sửa off-chain DB mà không ghi ledger. Chạy "Đối soát" để hệ thống phát hiện.' });
});

/* ---------- Snapshot & phục hồi ---------- */
router.post('/admin/backup', ADMIN, (req, res) => {
  try {
    const snap = createSnapshot(req.user);
    audit(req, 'RecordDailyBackupHash', `${snap.snapshotId} hash=${snap.snapshotHash.slice(0, 16)}…`);
    res.status(201).json(snap);
  } catch (e) { return ledgerError(res, e); }
});
router.get('/admin/backups', ADMIN, (req, res) => res.json({ backups: listSnapshots() }));
router.post('/admin/restore', ADMIN, (req, res) => {
  const result = restoreSnapshot(req.user, req.body?.snapshotId);
  audit(req, 'RestoreSnapshot', `${req.body?.snapshotId} → ${result.ok ? 'OK' : 'TỪ CHỐI: ' + result.reason}`);
  if (!result.ok) return res.status(409).json({ error: result.reason, ...result });
  // Sau phục hồi, chạy đối soát để đồng bộ trạng thái (mở khóa hồ sơ khớp hash)
  const report = reconcileAll(req.user);
  res.json({ ...result, reconcile: report });
});

/* ---------- Peer mô phỏng: bật/tắt (kịch bản 7) ---------- */
router.get('/admin/peers', ADMIN, (req, res) => res.json({ orgs: ledger.getOrgs() }));
router.post('/admin/peers', ADMIN, (req, res) => {
  const { mspId, online } = req.body || {};
  const org = ledger.setPeerOnline(mspId, online);
  audit(req, online ? 'PeerOnline' : 'PeerOffline', mspId);
  res.json({ org });
});

/* ---------- Quản lí tài khoản ---------- */
router.get('/admin/users', ADMIN, (req, res) => {
  const rows = db.prepare('SELECT u.id,u.username,u.displayName,u.role,u.unitId,u.memberId,u.active,u.createdAt,un.name AS unitName FROM users u LEFT JOIN units un ON un.id=u.unitId ORDER BY u.role, u.username').all();
  res.json({ users: rows });
});
router.post('/admin/users', ADMIN, (req, res) => {
  const b = req.body || {};
  if (!b.username || !b.displayName || !b.role) return res.status(400).json({ error: 'Thiếu thông tin tài khoản' });
  if (db.prepare('SELECT 1 FROM users WHERE username=?').get(b.username)) return res.status(409).json({ error: 'Tên đăng nhập đã tồn tại' });
  const id = `U-${Date.now().toString(36)}`;
  db.prepare('INSERT INTO users(id,username,passwordHash,displayName,role,unitId,memberId) VALUES (?,?,?,?,?,?,?)')
    .run(id, b.username, bcrypt.hashSync(b.password || '123456', 8), b.displayName, b.role, b.unitId || null, b.memberId || null);
  audit(req, 'CreateUser', `${b.username} (${b.role})`);
  res.status(201).json({ user: db.prepare('SELECT id,username,displayName,role,unitId,active FROM users WHERE id=?').get(id) });
});
router.patch('/admin/users/:id', ADMIN, (req, res) => {
  const u = db.prepare('SELECT * FROM users WHERE id=?').get(req.params.id);
  if (!u) return res.status(404).json({ error: 'Không tìm thấy tài khoản' });
  if (u.username === req.user.username && req.body?.active === 0) return res.status(400).json({ error: 'Không thể tự khóa tài khoản đang đăng nhập' });
  if ('active' in (req.body || {})) db.prepare('UPDATE users SET active=? WHERE id=?').run(req.body.active ? 1 : 0, u.id);
  if (req.body?.password) db.prepare('UPDATE users SET passwordHash=? WHERE id=?').run(bcrypt.hashSync(req.body.password, 8), u.id);
  audit(req, 'UpdateUser', `${u.username}: ${JSON.stringify({ active: req.body?.active, resetPw: !!req.body?.password })}`);
  res.json({ user: db.prepare('SELECT id,username,displayName,role,unitId,active FROM users WHERE id=?').get(u.id) });
});

/* ---------- P2: Nhật kí + thống kê AI nhập liệu tự động ---------- */
router.get('/admin/ai-jobs', ADMIN, (req, res) => {
  const jobs = db.prepare('SELECT * FROM ai_jobs ORDER BY createdAt DESC, id DESC LIMIT 100').all()
    .map((j) => ({ ...j, warnings: j.warningsJson ? JSON.parse(j.warningsJson) : [], warningsJson: undefined }));
  const agg = db.prepare(`SELECT COUNT(*) total, COALESCE(SUM(auto),0) autoCount, AVG(confidence) avgConf
                          FROM ai_jobs WHERE type='extract' AND status='DONE'`).get();
  res.json({ jobs, stats: {
    total: agg.total || 0, autoCount: agg.autoCount || 0,
    escalated: (agg.total || 0) - (agg.autoCount || 0),
    autoRate: agg.total ? Math.round((agg.autoCount / agg.total) * 100) : 0,
    avgConfidence: agg.avgConf != null ? Math.round(agg.avgConf * 1000) / 1000 : null,
  } });
});

/* ---------- Nạp lại dữ liệu demo ---------- */
router.post('/admin/reseed', ADMIN, (req, res) => {
  reseed();
  audit(req, 'Reseed', 'Khôi phục dữ liệu demo ban đầu');
  res.json({ ok: true });
});

module.exports = { router };
