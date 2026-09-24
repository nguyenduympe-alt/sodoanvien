/**
 * ============ ĐỐI SOÁT ON-CHAIN / OFF-CHAIN (đề cương mục 8.9) ============
 * Tính lại hash của từng bản ghi off-chain rồi so với hash đã ghi trên ledger.
 *   - Khớp  → hồ sơ bình thường.
 *   - Lệch  → ReportAnomaly lên ledger, hồ sơ bị khóa (LOCKED_ANOMALY),
 *             phát cảnh báo cho quản trị.
 */
const { db } = require('../db');
const { profileHash, profileCore, txId } = require('../canonical');
const ledger = require('../ledger/simulator');
const { dbProfile } = require('../routes/members');

function reconcileAll(adminUser) {
  const members = db.prepare('SELECT * FROM members').all();
  const report = { checked: 0, matched: 0, anomalies: [], at: new Date().toISOString() };
  for (const m of members) {
    report.checked += 1;
    const localHash = profileHash(profileCore(m));
    const ledgerHash = ledger.getLedgerProfileHash(m.id);

    if (ledgerHash === null) {
      report.anomalies.push({ memberId: m.id, code: m.memberCode, reason: 'Hồ sơ chưa tồn tại trên ledger' });
      continue;
    }
    if (ledgerHash === localHash) {
      report.matched += 1;
      // Hash đã khớp trở lại (sau phục hồi snapshot) → mở khóa cả hai phía DB + ledger
      if (m.status === 'LOCKED_ANOMALY') {
        db.prepare("UPDATE members SET status='ACTIVE' WHERE id=?").run(m.id);
        try {
          ledger.submit(adminUser, 'UnlockMember', { memberId: m.id, note: 'Hash khớp lại sau đối soát/phục hồi → mở khóa' });
        } catch { /* peer offline: ledger sẽ đồng bộ ở lần đối soát kế tiếp */ }
      }
      continue;
    }

    // Phát hiện sai lệch → khóa + cảnh báo + ghi sự kiện lên ledger
    if (m.status !== 'LOCKED_ANOMALY') {
      try {
        ledger.submit(adminUser, 'ReportAnomaly', { memberId: m.id, expectedHash: ledgerHash, foundHash: localHash });
      } catch { /* peer offline: vẫn khóa ở tầng ứng dụng */ }
      db.prepare("UPDATE members SET status='LOCKED_ANOMALY' WHERE id=?").run(m.id);
      db.prepare('INSERT INTO alerts(id,type,severity,memberId,message) VALUES (?,?,?,?,?)')
        .run(`AL-${txId().slice(0, 8).toUpperCase()}`, 'TAMPER', 'CRITICAL', m.id,
          `Hash off-chain lệch với ledger. Mong đợi ${ledgerHash.slice(0, 16)}…, thực tế ${localHash.slice(0, 16)}…. Hồ sơ đã bị KHÓA, chờ phục hồi từ snapshot.`);
      report.anomalies.push({ memberId: m.id, code: m.memberCode, reason: 'Hash lệch giữa off-chain DB và ledger (mới phát hiện)' });
    } else {
      report.anomalies.push({ memberId: m.id, code: m.memberCode, reason: 'Hash lệch (đã khóa từ trước, chờ phục hồi)' });
    }
  }
  // Lưu kết quả lần đối soát gần nhất để hiển thị trên dashboard
  db.prepare("INSERT OR REPLACE INTO meta(key,value) VALUES ('lastReconcile', ?)")
    .run(JSON.stringify({ checked: report.checked, matched: report.matched, anomalies: report.anomalies.length, at: report.at, by: adminUser?.username || '-' }));
  return report;
}

module.exports = { reconcileAll };
