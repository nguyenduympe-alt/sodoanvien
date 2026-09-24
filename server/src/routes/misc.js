/**
 * ============ API CHUNG ============
 * Thống kê dashboard, trình duyệt ledger, xác minh công khai (QR-ready),
 * tài liệu API cho lớp AI, và các hàm đọc hệ thống.
 */
const express = require('express');
const path = require('path');
const fs = require('fs');
const { db } = require('../db');
const { requireAuth, scopeOf, scopeWhere, audit } = require('../auth');
const ledger = require('../ledger/simulator');
const config = require('../config');

const router = express.Router();

/* ---------- Thống kê dashboard (theo phạm vi vai trò) ---------- */
router.get('/stats', requireAuth(), (req, res) => {
  const sc = scopeOf(req.user);
  const scope = scopeWhere(sc);
  const one = (sql, ...p) => db.prepare(sql).get(...p).n;
  const byStatus = {};
  for (const r of db.prepare(`SELECT status, COUNT(*) n FROM members m WHERE ${scope.sql} GROUP BY status`).all(...scope.params)) byStatus[r.status] = r.n;
  const byUnit = db.prepare(`SELECT u.id, u.name, COUNT(m.id) n FROM units u LEFT JOIN members m ON m.unitId=u.id AND ${scope.sql} WHERE u.type='CHI_DOAN' GROUP BY u.id ORDER BY u.id`)
    .all(...(sc.mode === 'UNITS' ? scope.params : sc.mode === 'SELF' ? [sc.memberId] : []));

  // ---- Thống kê nâng cao (tất cả đều tuân theo phạm vi quyền) ----
  const byGender = db.prepare(`SELECT COALESCE(NULLIF(NULLIF(m.gender,''),''),'Khác') AS gender, COUNT(*) n FROM members m WHERE ${scope.sql} GROUP BY gender ORDER BY n DESC`).all(...scope.params);
  const activityByType = db.prepare(`SELECT a.type, COUNT(*) n FROM activities a JOIN members m ON m.id=a.memberId WHERE ${scope.sql} GROUP BY a.type`).all(...scope.params);
  const joinTrend = db.prepare(`SELECT substr(m.joinDate,1,7) AS ym, COUNT(*) n FROM members m WHERE ${scope.sql} AND m.joinDate IS NOT NULL AND m.joinDate<>'' GROUP BY ym ORDER BY ym`).all(...scope.params);
  const transferStats = db.prepare(`SELECT t.status, COUNT(*) n FROM transfers t JOIN members m ON m.id=t.memberId WHERE ${scope.sql} GROUP BY t.status`).all(...scope.params);
  const recentActivities = db.prepare(`SELECT a.id, a.type, a.title, a.activityDate, m.fullName, m.memberCode, m.id AS memberId FROM activities a JOIN members m ON m.id=a.memberId WHERE ${scope.sql} ORDER BY a.createdAt DESC LIMIT 6`).all(...scope.params);
  const recentTransfers = db.prepare(`SELECT t.id, t.status, t.fromUnit, t.toUnit, t.requestedAt, m.fullName, u1.name AS fromName, u2.name AS toName FROM transfers t JOIN members m ON m.id=t.memberId LEFT JOIN units u1 ON u1.id=t.fromUnit LEFT JOIN units u2 ON u2.id=t.toUnit WHERE ${scope.sql} ORDER BY t.requestedAt DESC LIMIT 5`).all(...scope.params);
  const lastReconcileRow = db.prepare("SELECT value FROM meta WHERE key='lastReconcile'").get();
  const membersNoActivity = one(`SELECT COUNT(*) n FROM members m WHERE ${scope.sql} AND NOT EXISTS (SELECT 1 FROM activities a WHERE a.memberId=m.id)`, ...scope.params);

  res.json({
    total: byStatus.ACTIVE + byStatus.TRANSFER_PENDING + byStatus.LOCKED_ANOMALY || one(`SELECT COUNT(*) n FROM members m WHERE ${scope.sql}`, ...scope.params),
    active: byStatus.ACTIVE || 0,
    transferPending: byStatus.TRANSFER_PENDING || 0,
    locked: byStatus.LOCKED_ANOMALY || 0,
    activities: one(`SELECT COUNT(*) n FROM activities a JOIN members m ON m.id=a.memberId WHERE ${scope.sql}`, ...scope.params),
    transfers: transferStats,
    byUnit: byUnit.map((u) => ({ id: u.id, name: u.name, members: u.n })),
    byGender,
    activityByType,
    joinTrend,
    recentActivities,
    recentTransfers,
    membersNoActivity,
    lastReconcile: lastReconcileRow ? JSON.parse(lastReconcileRow.value) : null,
    ledger: {
      blocks: ledger.getBlocks({ limit: 1 }).total - 1,
      mode: config.LEDGER_MODE,
      orgs: ledger.getOrgs(),
      txStats: ledger.getStats(),
    },
    alertsOpen: req.user.role === 'QUAN_TRI' ? one("SELECT COUNT(*) n FROM alerts WHERE status='OPEN'") : undefined,
  });
});

/* ---------- Trình duyệt ledger (Explorer) ---------- */
router.get('/ledger/blocks', requireAuth(), (req, res) => {
  res.json(ledger.getBlocks({ limit: Math.min(+req.query.limit || 15, 100), offset: +req.query.offset || 0 }));
});
router.get('/ledger/tx/:txId', requireAuth(), (req, res) => {
  const tx = ledger.getTx(req.params.txId);
  if (!tx) return res.status(404).json({ error: 'Không tìm thấy giao dịch' });
  res.json({ tx });
});
router.get('/ledger/orgs', requireAuth(), (req, res) => res.json({ orgs: ledger.getOrgs() }));

/* ---------- Xác minh công khai (không cần đăng nhập — hỗ trợ QR sau này) ---------- */
router.get('/verify', (req, res) => {
  const { code, hash } = req.query;
  if (!code) return res.status(400).json({ error: 'Thiếu mã đoàn viên' });
  const m = db.prepare('SELECT id, memberCode, fullName, unitId, status FROM members WHERE memberCode=?').get(String(code).trim());
  if (!m) return res.json({ found: false, code });
  const ledgerMember = ledger.query(null, 'QueryMember', { memberId: m.id });
  const out = {
    found: true, code: m.memberCode, status: m.status,
    unit: db.prepare('SELECT name FROM units WHERE id=?').get(m.unitId)?.name,
    ledgerStatus: ledgerMember ? ledgerMember.status : null,
    ledgerRecorded: !!ledgerMember,
  };
  if (hash) {
    out.hashMatch = !!ledgerMember && ledgerMember.profileHash === String(hash).trim();
    out.checkedHash = String(hash).trim();
  }
  audit({ user: { username: 'public', role: 'PUBLIC' } }, 'PublicVerify', code);
  res.json(out);
});

/* ---------- Trang tài liệu API (cho kiểm thử Swagger/Postman & lớp AI) ---------- */
router.get('/docs/:name', requireAuth(), (req, res) => {
  const name = String(req.params.name).replace(/[^a-z0-9\-_.]/gi, '');
  const file = path.join(__dirname, '../../docs-src', name);
  if (!file.startsWith(path.join(__dirname, '../../docs-src')) || !fs.existsSync(file)) {
    return res.status(404).json({ error: 'Không tìm thấy tài liệu' });
  }
  res.type('text/plain; charset=utf-8').send(fs.readFileSync(file, 'utf8'));
});

/* ---------- Lớp AI (sẵn sàng tích hợp - xem docs/03-tich-hop-ai.md) ---------- */
router.post('/ai/chat', requireAuth(), async (req, res) => {
  if (!config.AI_API_KEY) {
    return res.status(503).json({
      error: 'Lớp AI chưa được cấu hình khóa API.',
      howTo: 'Đặt biến môi trường AI_API_KEY (và AI_BASE_URL, AI_MODEL nếu dùng nhà cung cấp khác OpenAI) rồi khởi động lại server. Kiến trúc tích hợp xem docs/03-tich-hop-ai.md.',
      ready: true, // hạ tầng đã sẵn sàng: frontend đã có giao diện, backend đã có endpoint chuẩn OpenAI
    });
  }
  try {
    const context = buildAiContext(req.user);
    const r = await fetch(`${config.AI_BASE_URL}/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${config.AI_API_KEY}` },
      body: JSON.stringify({
        model: config.AI_MODEL,
        messages: [
          { role: 'system', content: SYSTEM_PROMPT + '\n\nDữ liệu ngữ cảnh hiện tại của hệ thống:\n' + context },
          ...(Array.isArray(req.body?.messages) ? req.body.messages : [{ role: 'user', content: String(req.body?.question || '') }]),
        ],
        temperature: 0.3,
      }),
    });
    const data = await r.json();
    const reply = data?.choices?.[0]?.message?.content;
    if (!reply) return res.status(502).json({ error: 'Nhà cung cấp AI trả lời không hợp lệ', raw: data });
    audit(req, 'AI.Chat', String(req.body?.question || '').slice(0, 100));
    res.json({ reply });
  } catch (e) {
    res.status(502).json({ error: 'Lỗi khi gọi lớp AI: ' + e.message });
  }
});

const SYSTEM_PROMPT = `Bạn là trợ lý AI của hệ thống "Định danh & Quản lí sổ Đoàn viên trên Hyperledger Fabric".
Nhiệm vụ: trả lời cán bộ Đoàn về nghiệp vụ quản lí sổ đoàn viên (tạo hồ sơ, cập nhật, ghi hoạt động,
chuyển sinh hoạt 2 bước, đối soát hash, sao lưu/phục hồi) dựa trên NGỮ CẢNH dữ liệu được cung cấp.
Nguyên tắc: không bao giờ tự bịa số liệu; nếu dữ liệu ngữ cảnh không đủ, hãy nói rõ và hướng dẫn người dùng
tra cứu trên giao diện. Trả lời ngắn gọn bằng tiếng Việt.`;

function buildAiContext(user) {
  const scope = scopeWhere(scopeOf(user));
  const p = scope.params;
  const total = db.prepare(`SELECT COUNT(*) n FROM members m WHERE ${scope.sql}`).get(...p).n;
  const active = db.prepare(`SELECT COUNT(*) n FROM members m WHERE ${scope.sql} AND m.status='ACTIVE'`).get(...p).n;
  const pending = db.prepare(`SELECT COUNT(*) n FROM transfers t JOIN members m ON m.id=t.memberId WHERE ${scope.sql} AND t.status='PENDING'`).get(...p).n;
  const locked = db.prepare(`SELECT COUNT(*) n FROM members m WHERE ${scope.sql} AND m.status='LOCKED_ANOMALY'`).get(...p).n;
  return `- Số đoàn viên trong phạm vi bạn quản lí: ${total} (hoạt động: ${active}, đang chờ chuyển sinh hoạt: ${pending}, bị khóa bất thường: ${locked})`;
}

module.exports = { router };
