/**
 * ============ SAO LƯU & PHỤC HỒI CÓ KIỂM CHỨNG (đề cương mục 8.9) ============
 * Mỗi snapshot được tính snapshotHash (SHA-256 trên manifest JSON canonical) và
 * ghi lên ledger qua giao dịch RecordDailyBackupHash.
 *
 * Khi phục hồi: KHÔNG mặc định tin bản sao lưu — hash của snapshot phải khớp với
 * hash trên ledger mới được phép dùng; sau khi phục hồi xong ghi ConfirmRecovery.
 */
const fs = require('fs');
const path = require('path');
const { db } = require('../db');
const { sha256Hex, canonicalize, txId } = require('../canonical');
const ledger = require('../ledger/simulator');

const SNAPSHOT_DIR = path.join(__dirname, '../../data/snapshots');
const TABLES = ['users', 'members', 'activities', 'transfers', 'alerts'];

function createSnapshot(adminUser) {
  fs.mkdirSync(SNAPSHOT_DIR, { recursive: true });
  const snapshotId = `SNAP-${new Date().toISOString().slice(0, 10).replaceAll('-', '')}-${txId().slice(0, 6).toUpperCase()}`;

  const data = {};
  const stats = {};
  for (const t of TABLES) {
    const rows = db.prepare(`SELECT * FROM ${t}`).all();
    data[t] = rows;
    stats[t] = rows.length;
  }
  // Hash từng bảng + hash tổng trên manifest (chuẩn JSON canonical)
  const tableHashes = {};
  for (const t of TABLES) tableHashes[t] = sha256Hex(data[t]);
  const manifest = { snapshotId, createdAt: new Date().toISOString(), tables: TABLES, stats, tableHashes };
  const snapshotHash = sha256Hex(canonicalize(manifest));
  const payload = { manifest, snapshotHash, data };

  const file = path.join(SNAPSHOT_DIR, `${snapshotId}.json`);
  fs.writeFileSync(file, JSON.stringify(payload));

  const led = ledger.submit(adminUser, 'RecordDailyBackupHash', {
    snapshotId, snapshotHash, manifestHash: sha256Hex(canonicalize(tableHashes)), stats,
  });
  return { snapshotId, snapshotHash, manifest, file, tx: led };
}

function listSnapshots() {
  if (!fs.existsSync(SNAPSHOT_DIR)) return [];
  return fs.readdirSync(SNAPSHOT_DIR)
    .filter((f) => f.endsWith('.json'))
    .map((f) => {
      try {
        const { manifest, snapshotHash } = JSON.parse(fs.readFileSync(path.join(SNAPSHOT_DIR, f), 'utf8'));
        const onLedger = ledger.query(null, 'QueryBackup', { snapshotId: manifest.snapshotId });
        return {
          snapshotId: manifest.snapshotId,
          createdAt: manifest.createdAt,
          stats: manifest.stats,
          snapshotHash,
          ledger: onLedger
            ? { recorded: true, hashMatch: onLedger.snapshotHash === snapshotHash, recordedAt: onLedger.createdAt, status: onLedger.status }
            : { recorded: false },
        };
      } catch { return null; }
    })
    .filter(Boolean)
    .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
}

/**
 * Phục hồi từ snapshot có kiểm chứng.
 * Trả về { ok, ... } hoặc { ok:false, reason } nếu snapshot không đáng tin.
 */
function restoreSnapshot(adminUser, snapshotId) {
  const file = path.join(SNAPSHOT_DIR, `${snapshotId}.json`);
  if (!fs.existsSync(file)) return { ok: false, reason: 'Không tìm thấy tệp snapshot' };

  // 1) Kiểm tra tính toàn vẹn của tệp hiện tại
  let payload;
  try { payload = JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return { ok: false, reason: 'Tệp snapshot hỏng, không đọc được' }; }

  const manifest = payload.manifest;
  const tableHashes = {};
  for (const t of TABLES) tableHashes[t] = sha256Hex(payload.data[t]);
  const recomputed = sha256Hex(canonicalize({ ...manifest, tableHashes }));
  if (recomputed !== payload.snapshotHash) {
    return { ok: false, reason: 'Nội dung snapshot không khớp manifest (tệp đã bị sửa)' };
  }

  // 2) Đối chiếu với hash đã ghi trên ledger — nguồn tin cậy duy nhất
  const onLedger = ledger.query(null, 'QueryBackup', { snapshotId });
  if (!onLedger) return { ok: false, reason: 'Snapshot này CHƯA TỪNG được ghi lên ledger → từ chối phục hồi' };
  if (onLedger.snapshotHash !== payload.snapshotHash) {
    return { ok: false, reason: 'Hash snapshot LỆCH với ledger → từ chối phục hồi, cần điều tra nguyên nhân' };
  }

  // 3) Phục hồi trong 1 transaction
  const restore = db.transaction(() => {
    for (const t of [...TABLES].reverse()) db.prepare(`DELETE FROM ${t}`).run();
    for (const t of TABLES) {
      const cols = Object.keys(payload.data[t][0] || {});
      if (!cols.length || !payload.data[t].length) continue;
      const ins = db.prepare(`INSERT INTO ${t}(${cols.join(',')}) VALUES (${cols.map(() => '?').join(',')})`);
      for (const row of payload.data[t]) ins.run(...cols.map((c) => row[c]));
    }
    const recoveryId = `REC-${txId().slice(0, 8).toUpperCase()}`;
    const details = { recoveryId, snapshotId, restoredTables: TABLES, at: new Date().toISOString() };
    const led = ledger.submit(adminUser, 'ConfirmRecovery', {
      recoveryId, snapshotId, detailsHash: sha256Hex(canonicalize(details)), verifiedSnapshotHash: payload.snapshotHash,
    });
    db.prepare("INSERT OR REPLACE INTO meta(key,value) VALUES ('lastRecovery', ?)").run(JSON.stringify({ ...details, txId: led.txId }));
    return { recoveryId, txId: led.txId };
  });

  const result = restore();
  return { ok: true, snapshotId, snapshotHash: payload.snapshotHash, ...result };
}

module.exports = { createSnapshot, listSnapshots, restoreSnapshot, SNAPSHOT_DIR };
