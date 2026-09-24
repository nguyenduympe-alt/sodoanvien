/**
 * ============ CHUYỂN SINH HOẠT (MÔ HÌNH 2 BƯỚC - đề cương mục 8.7) ============
 * Bước 1: TransferRequest do đơn vị chuyển đi lập.
 * Bước 2: TransferAccept / TransferReject do đơn vị tiếp nhận hoặc cấp trên phê duyệt.
 *
 * Nếu peer của tổ chức liên quan đang offline → giao dịch không đủ endorsement →
 * yêu cầu vẫn được GIỮ ở tầng ứng dụng (ledgerRecorded=0) và có thể gửi lại,
 * đúng kịch bản kiểm thử số 7 của đề cương.
 */
const express = require('express');
const { db, unitName } = require('../db');
const { requireAuth, scopeOf, audit } = require('../auth');
const { txId, profileHash, profileCore } = require('../canonical');
const ledger = require('../ledger/simulator');
const { dbProfile, ledgerError } = require('./members');

const router = express.Router();

function canSeeTransfer(user, t) {
  const scope = scopeOf(user);
  if (scope.mode === 'ALL') return true;
  if (scope.mode === 'SELF') return t.memberId === scope.memberId;
  return scope.unitIds.includes(t.fromUnit) || scope.unitIds.includes(t.toUnit);
}

/* ---------- Danh sách yêu cầu chuyển ---------- */
router.get('/transfers', requireAuth(), (req, res) => {
  const rows = db.prepare(`
    SELECT t.*, m.fullName, m.memberCode,
           u1.name AS fromName, u2.name AS toName
    FROM transfers t
    JOIN members m ON m.id=t.memberId
    LEFT JOIN units u1 ON u1.id=t.fromUnit
    LEFT JOIN units u2 ON u2.id=t.toUnit
    ORDER BY t.requestedAt DESC`).all();
  res.json({ transfers: rows.filter((t) => canSeeTransfer(req.user, t)) });
});

/* ---------- Bước 1: lập yêu cầu chuyển (TransferRequest) ---------- */
router.post('/transfers', requireAuth('CHI_DOAN', 'DOAN_TRUONG'), (req, res) => {
  const b = req.body || {};
  if (!b.memberId || !b.toUnit) return res.status(400).json({ error: 'Thiếu đoàn viên hoặc đơn vị tiếp nhận' });
  const m = db.prepare('SELECT * FROM members WHERE id=?').get(b.memberId);
  if (!m) return res.status(404).json({ error: 'Không tìm thấy đoàn viên' });
  if (!db.prepare("SELECT id FROM units WHERE id=? AND type='CHI_DOAN'").get(b.toUnit)) {
    return res.status(400).json({ error: 'Đơn vị tiếp nhận không hợp lệ' });
  }
  if (req.user.role === 'CHI_DOAN' && req.user.unitId !== m.unitId) {
    return res.status(403).json({ error: 'Chỉ chi đoàn đang quản lí mới được lập yêu cầu chuyển đi' });
  }
  if (m.unitId === b.toUnit) return res.status(400).json({ error: 'Đơn vị chuyển đi và tiếp nhận trùng nhau' });
  if (m.status !== 'ACTIVE') return res.status(409).json({ error: `Đoàn viên đang ở trạng thái ${m.status}` });

  const id = `CCH-${txId().slice(0, 8).toUpperCase()}`;
  const args = { transferId: id, memberId: m.id, fromUnit: m.unitId, toUnit: b.toUnit, reason: b.reason || '' };
  let led = null;
  try {
    led = ledger.submit(req.user, 'TransferRequest', args);
  } catch (e) {
    if (e.code !== 'ENDORSEMENT_OFFLINE') return ledgerError(res, e);
    // Peer offline: giữ yêu cầu ở tầng ứng dụng, chờ gửi lại (kịch bản 7)
    db.prepare('INSERT INTO transfers(id,memberId,fromUnit,toUnit,reason,status,requestedBy,requestedAt,note) VALUES (?,?,?,?,?,?,?,?,?)')
      .run(id, m.id, m.unitId, b.toUnit, b.reason || '', 'PENDING', req.user.username, new Date().toISOString(), 'CHO_GUI_LAI: peer offline khi lập yêu cầu');
    audit(req, 'TransferRequest.DEFERRED', `${id} (${m.id})`);
    return res.status(202).json({
      transfer: db.prepare('SELECT * FROM transfers WHERE id=?').get(id),
      warning: e.message, deferred: true,
    });
  }
  db.prepare('INSERT INTO transfers(id,memberId,fromUnit,toUnit,reason,status,requestedBy,requestedAt,txId) VALUES (?,?,?,?,?,?,?,?,?)')
    .run(id, m.id, m.unitId, b.toUnit, b.reason || '', 'PENDING', req.user.username, new Date().toISOString(), led.txId);
  db.prepare("UPDATE members SET status='TRANSFER_PENDING' WHERE id=?").run(m.id);
  audit(req, 'TransferRequest', `${id} ${m.id}: ${m.unitId} → ${b.toUnit}`);
  res.status(201).json({ transfer: db.prepare('SELECT * FROM transfers WHERE id=?').get(id), tx: led });
});

/* ---------- Gửi lại yêu cầu khi peer đã hoạt động trở lại ---------- */
router.post('/transfers/:id/retry', requireAuth('CHI_DOAN', 'DOAN_TRUONG'), (req, res) => {
  const t = db.prepare('SELECT * FROM transfers WHERE id=?').get(req.params.id);
  if (!t) return res.status(404).json({ error: 'Không tìm thấy yêu cầu' });
  if (t.txId) return res.status(409).json({ error: 'Yêu cầu này đã được ghi lên ledger' });
  const m = db.prepare('SELECT * FROM members WHERE id=?').get(t.memberId);
  try {
    const led = ledger.submit(req.user, 'TransferRequest', {
      transferId: t.id, memberId: t.memberId, fromUnit: t.fromUnit, toUnit: t.toUnit, reason: t.reason,
    });
    db.prepare("UPDATE transfers SET txId=?, note=NULL WHERE id=?").run(led.txId, t.id);
    db.prepare("UPDATE members SET status='TRANSFER_PENDING' WHERE id=?").run(t.memberId);
    audit(req, 'TransferRequest.RETRY_OK', t.id);
    res.json({ transfer: db.prepare('SELECT * FROM transfers WHERE id=?').get(t.id), tx: led });
  } catch (e) {
    if (e.code === 'INVALID_STATE') {
      db.prepare("UPDATE transfers SET note='LOI: trạng thái đã thay đổi trên ledger' WHERE id=?").run(t.id);
      return res.status(409).json({ error: e.message });
    }
    return ledgerError(res, e);
  }
});

/* ---------- Bước 2: tiếp nhận / từ chối (TransferAccept / TransferReject) ---------- */
function decide(decision) {
  return (req, res) => {
    const t = db.prepare('SELECT * FROM transfers WHERE id=?').get(req.params.id);
    if (!t) return res.status(404).json({ error: 'Không tìm thấy yêu cầu' });
    if (!canSeeTransfer(req.user, t)) return res.status(403).json({ error: 'Ngoài phạm vi của bạn' });
    if (!t.txId) return res.status(409).json({ error: 'Yêu cầu chưa được ghi lên ledger (peer từng offline). Hãy bấm "Gửi lại" trước.' });
    if (t.status !== 'PENDING') return res.status(409).json({ error: `Yêu cầu đã xử lí: ${t.status}` });

    const m = db.prepare('SELECT * FROM members WHERE id=?').get(t.memberId);
    const isTargetOfficer = req.user.role === 'CHI_DOAN' && req.user.unitId === t.toUnit;
    const isHigher = ['LIEN_CHI', 'DOAN_TRUONG'].includes(req.user.role);
    if (!isTargetOfficer && !isHigher) {
      return res.status(403).json({ error: 'Chỉ đơn vị tiếp nhận hoặc cấp quản lí được phê duyệt' });
    }

    const args = {
      transferId: t.id, note: req.body?.note || '',
      toUnitName: unitName(t.toUnit), verifiedSnapshotHash: undefined,
    };
    let led;
    try {
      led = ledger.submit(req.user, decision === 'ACCEPTED' ? 'TransferAccept' : 'TransferReject', args);
    } catch (e) { return ledgerError(res, e); }

    if (decision === 'ACCEPTED') {
      // Đổi đơn vị trong DB + tính lại hash + ghi UpdateMemberProfile lên ledger
      const next = { ...dbProfile(m), unitId: t.toUnit, status: 'ACTIVE' };
      const newHash = profileHash(profileCore(next));
      let led2 = null;
      try {
        led2 = ledger.submit(req.user, 'UpdateMemberProfile', {
          memberId: m.id, newProfileHash: newHash, changeType: 'chuyenSinhHoat',
          note: `Chuyển từ ${t.fromUnit} sang ${t.toUnit}`,
        });
        db.prepare("UPDATE members SET unitId=?, className=COALESCE(NULLIF(?,''),className), status='ACTIVE', profileHash=?, lastTxId=?, lastSyncAt=datetime('now'), updatedAt=datetime('now') WHERE id=?")
          .run(t.toUnit, req.body?.newClassName || '', newHash, led2.txId, m.id);
      } catch (e) {
        db.prepare("INSERT INTO alerts(id,type,severity,memberId,message) VALUES (?,?,?,?,?)")
          .run(`AL-${txId().slice(0, 8)}`, 'SYNC', 'HIGH', m.id, 'Chuyển sinh hoạt đã chấp nhận nhưng chưa cập nhật được hash mới lên ledger: ' + e.message);
      }
      db.prepare("UPDATE transfers SET status='ACCEPTED', decidedBy=?, decidedAt=datetime('now'), note=?, decidedTxId=? WHERE id=?")
        .run(req.user.username, req.body?.note || '', led.txId, t.id);
    } else {
      db.prepare("UPDATE members SET status='ACTIVE' WHERE id=?").run(m.id);
      db.prepare("UPDATE transfers SET status='REJECTED', decidedBy=?, decidedAt=datetime('now'), note=?, decidedTxId=? WHERE id=?")
        .run(req.user.username, req.body?.note || '', led.txId, t.id);
    }
    audit(req, decision, `${t.id} (${t.memberId})`);
    res.json({
      transfer: db.prepare('SELECT * FROM transfers WHERE id=?').get(t.id),
      tx: led, followUpTx: 'đã ghi UpdateMemberProfile với hash mới',
    });
  };
}
router.post('/transfers/:id/accept', requireAuth('CHI_DOAN', 'LIEN_CHI', 'DOAN_TRUONG'), decide('ACCEPTED'));
router.post('/transfers/:id/reject', requireAuth('CHI_DOAN', 'LIEN_CHI', 'DOAN_TRUONG'), decide('REJECTED'));

module.exports = { router };
