/**
 * ============ CƠ SỞ DỮ LIỆU OFF-CHAIN (SQLite) ============
 * Lưu hồ sơ chi tiết dài hạn của đoàn viên (đề cương mục 8.5).
 * Ledger (blockchain) KHÔNG lưu dữ liệu cá nhân — chỉ lưu mã định danh nội bộ,
 * profileHash, trạng thái nghiệp vụ và nhật ký giao dịch.
 *
 * Mỗi lần ghi hồ sơ qua API: DB cập nhật → tính lại profileHash → ghi hash lên ledger.
 */
const path = require('path');
const fs = require('fs');
const Database = require('better-sqlite3');
const bcrypt = require('bcryptjs');
const { profileHash, profileCore, txId } = require('./canonical');
const ledger = require('./ledger/simulator');

const DATA_DIR = path.join(__dirname, '../data');
fs.mkdirSync(DATA_DIR, { recursive: true });
fs.mkdirSync(path.join(DATA_DIR, 'snapshots'), { recursive: true });

const db = new Database(path.join(DATA_DIR, 'offchain.db'));
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

function init() {
  db.exec(`
  CREATE TABLE IF NOT EXISTS units(
    id TEXT PRIMARY KEY, name TEXT NOT NULL, type TEXT NOT NULL, parentId TEXT
  );
  CREATE TABLE IF NOT EXISTS users(
    id TEXT PRIMARY KEY, username TEXT UNIQUE NOT NULL, passwordHash TEXT NOT NULL,
    displayName TEXT NOT NULL, role TEXT NOT NULL, unitId TEXT, memberId TEXT,
    active INTEGER DEFAULT 1, createdAt TEXT DEFAULT (datetime('now'))
  );
  CREATE TABLE IF NOT EXISTS members(
    id TEXT PRIMARY KEY,               -- mã định danh nội bộ (KHÔNG dùng CCCD - mục 8.6)
    memberCode TEXT UNIQUE,            -- mã số đoàn viên hiển thị
    fullName TEXT NOT NULL, dob TEXT, gender TEXT,
    cccd TEXT, phone TEXT, email TEXT, -- dữ liệu nhạy cảm: CHỈ lưu off-chain
    className TEXT, unitId TEXT, joinDate TEXT, joinPlace TEXT,
    homeAddress TEXT, notes TEXT,
    status TEXT DEFAULT 'ACTIVE',      -- ACTIVE | TRANSFER_PENDING | LOCKED_ANOMALY
    profileHash TEXT, lastTxId TEXT, lastSyncAt TEXT,
    createdAt TEXT DEFAULT (datetime('now')), updatedAt TEXT
  );
  CREATE TABLE IF NOT EXISTS activities(
    id TEXT PRIMARY KEY, memberId TEXT NOT NULL,
    type TEXT NOT NULL,                -- HOAT_DONG | DANH_GIA | KHEN_THUONG | KY_LUAT
    title TEXT NOT NULL, detail TEXT, activityDate TEXT,
    hash TEXT, txId TEXT, createdBy TEXT,
    createdAt TEXT DEFAULT (datetime('now'))
  );
  CREATE TABLE IF NOT EXISTS transfers(
    id TEXT PRIMARY KEY, memberId TEXT NOT NULL,
    fromUnit TEXT NOT NULL, toUnit TEXT NOT NULL,
    reason TEXT, status TEXT DEFAULT 'PENDING',
    requestedBy TEXT, requestedAt TEXT, decidedBy TEXT, decidedAt TEXT,
    note TEXT, txId TEXT, decidedTxId TEXT
  );
  CREATE TABLE IF NOT EXISTS alerts(
    id TEXT PRIMARY KEY, type TEXT, severity TEXT, memberId TEXT,
    message TEXT, status TEXT DEFAULT 'OPEN',
    createdAt TEXT DEFAULT (datetime('now')), resolvedAt TEXT, resolvedBy TEXT
  );
  CREATE TABLE IF NOT EXISTS audit(
    id INTEGER PRIMARY KEY AUTOINCREMENT, username TEXT, role TEXT,
    action TEXT, detail TEXT, ip TEXT, createdAt TEXT DEFAULT (datetime('now'))
  );
  CREATE TABLE IF NOT EXISTS meta(key TEXT PRIMARY KEY, value TEXT);
  `);

  // Migration nhẹ: bổ sung cột định danh điện tử nếu CSDL cũ chưa có
  const memberCols = db.prepare('PRAGMA table_info(members)').all().map((c) => c.name);
  for (const col of ['idVerifyStatus', 'idVerifySource', 'idVerifyAt', 'idVerifyRef', 'mdid']) {
    if (!memberCols.includes(col)) db.exec(`ALTER TABLE members ADD COLUMN ${col} TEXT`);
  }

  if (countUsers() === 0) seedDemoData();
  // Cung cấp bản đồ đơn vị → liên chi cho cơ chế phân quyền của ledger
  global.__UNIT_PARENT__ = Object.fromEntries(db.prepare('SELECT id, parentId FROM units').all().map((r) => [r.id, r.parentId]));
}

function countUsers() {
  const row = db.prepare("SELECT COUNT(*) AS n FROM users").get();
  return row.n;
}

function newId(prefix) {
  return `${prefix}-${txId()}`;
}

/* ------------------------------------------------------------------ */
/* Dữ liệu demo: 3 đơn vị, 8 tài khoản đủ 5 vai trò, 7 đoàn viên      */
/* ------------------------------------------------------------------ */
function seedDemoData() {
  console.log('[seed] Tạo dữ liệu demo ban đầu...');
  ledger.reset();

  const insUnit = db.prepare('INSERT INTO units(id,name,type,parentId) VALUES (?,?,?,?)');
  insUnit.run('LC-01', 'Liên chi đoàn Khoa CNTT & TT', 'LIEN_CHI', null);
  insUnit.run('LC-02', 'Liên chi đoàn Khoa Kinh tế', 'LIEN_CHI', null);
  insUnit.run('CD-01', 'Chi đoàn CNTT K45A', 'CHI_DOAN', 'LC-01');
  insUnit.run('CD-02', 'Chi đoàn CNTT K46A', 'CHI_DOAN', 'LC-01');
  insUnit.run('CD-03', 'Chi đoàn Kinh tế K45A', 'CHI_DOAN', 'LC-02');

  const insUser = db.prepare('INSERT INTO users(id,username,passwordHash,displayName,role,unitId,memberId) VALUES (?,?,?,?,?,?,?)');
  const pw = bcrypt.hashSync('123456', 8);
  // ID cố định (U-<username>) + memberId cố định (DV-2026-000X) → JWT không vỡ sau reseed
  insUser.run('U-quantri', 'quantri', pw, 'Quản trị hệ thống', 'QUAN_TRI', null, null);
  insUser.run('U-doantruong', 'doantruong', pw, 'Cán bộ Đoàn trường', 'DOAN_TRUONG', null, null);
  insUser.run('U-lienchicntt', 'lienchicntt', pw, 'Cán bộ Liên chi CNTT&TT', 'LIEN_CHI', 'LC-01', null);
  insUser.run('U-chidoan01', 'chidoan01', pw, 'Bí thư Chi đoàn CNTT K45A', 'CHI_DOAN', 'CD-01', null);
  insUser.run('U-chidoan02', 'chidoan02', pw, 'Bí thư Chi đoàn CNTT K46A', 'CHI_DOAN', 'CD-02', null);
  insUser.run('U-chidoan03', 'chidoan03', pw, 'Bí thư Chi đoàn Kinh tế K45A', 'CHI_DOAN', 'CD-03', null);

  const members = [
    { code: 'DV20260001', name: 'Nguyễn Văn An', dob: '2004-03-12', g: 'Nam', cls: 'DI22A1', unit: 'CD-01', join: '2022-10-15', dv: true },
    { code: 'DV20260002', name: 'Trần Thị Bình', dob: '2004-07-08', g: 'Nữ', cls: 'DI22A1', unit: 'CD-01', join: '2022-11-02', dv: true },
    { code: 'DV20260003', name: 'Lê Văn Cường', dob: '2003-01-25', g: 'Nam', cls: 'DI21A2', unit: 'CD-01', join: '2021-12-10', dv: false },
    { code: 'DV20260004', name: 'Phạm Thị Dung', dob: '2005-05-19', g: 'Nữ', cls: 'DI23A1', unit: 'CD-01', join: '2024-03-20', dv: false },
    { code: 'DV20260005', name: 'Hoàng Văn Em', dob: '2004-09-30', g: 'Nam', cls: 'DI22A5', unit: 'CD-02', join: '2023-02-14', dv: true },
    { code: 'DV20260006', name: 'Đỗ Thị Phương', dob: '2004-11-11', g: 'Nữ', cls: 'DI22A5', unit: 'CD-02', join: '2023-04-01', dv: false },
    { code: 'DV20260007', name: 'Vũ Văn Giang', dob: '2004-06-23', g: 'Nam', cls: 'KT22A3', unit: 'CD-03', join: '2023-10-05', dv: false },
  ];

  let i = 0;
  for (const m of members) {
    i += 1;
    const id = `DV-2026-${String(i).padStart(4, '0')}`;
    const officerUser = { username: officerOf(m.unit), role: 'CHI_DOAN', id: 'seed', displayName: officerOf(m.unit), unitId: m.unit };
    const profile = {
      id, memberCode: m.code, fullName: m.name, dob: m.dob, gender: m.g,
      className: m.cls, unitId: m.unit, joinDate: m.join, joinPlace: 'Đoàn trường Đại học Cần Thơ',
      phone: '', email: '', homeAddress: '',
    };
    const pHash = profileHash(profile);
    db.prepare(`INSERT INTO members(id,memberCode,fullName,dob,gender,cccd,phone,email,className,unitId,joinDate,joinPlace,homeAddress,notes,status,profileHash,lastTxId,lastSyncAt,updatedAt)
                VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,'ACTIVE',?,?,datetime('now'),datetime('now'))`)
      .run(id, m.code, m.name, m.dob, m.g, '', '', '', m.cls, m.unit, m.join, profile.joinPlace, '', '', pHash, 'SEED');

    const res = ledger.submit(officerUser, 'CreateMemberProfile', {
      memberId: id, memberCode: m.code, unitId: m.unit,
      unitName: unitName(m.unit), profileHash: pHash, createdBy: officerOf(m.unit),
    });
    db.prepare('UPDATE members SET lastTxId=? WHERE id=?').run(res.txId, id);

    if (m.dv) {
      insUser.run(`U-doanvien${String(i).padStart(2, '0')}`, `doanvien${String(i).padStart(2, '0')}`, pw, m.name, 'DOAN_VIEN', m.unit, id);
    }

    // Hoạt động demo đa dạng loại để dashboard có dữ liệu
    const demoActs = [
      [1, 'HOAT_DONG', 'Chiến dịch Mùa hè xanh 2026', 'Tham gia tình nguyện tại phường Bình Thủy', '2026-07-15'],
      [1, 'KHEN_THUONG', 'Giải Nhất Nghiệp vụ Đoàn - Hội', 'Khen thưởng của Đoàn trường học kỳ I', '2026-05-20'],
      [2, 'HOAT_DONG', 'Ngày hội Hiến máu tình nguyện', 'Đăng ký và hiến máu tại trường', '2026-08-02'],
      [2, 'DANH_GIA', 'Xếp loại Đoàn viên hoàn thành xuất sắc', 'Nhiệm vụ năm học 2025-2026', '2026-06-30'],
      [3, 'HOAT_DONG', 'Ngày hội Quốc phòng - an ninh', 'Tham gia điểm khá', '2026-03-19'],
      [5, 'DANH_GIA', 'Xếp loại Đoàn viên hoàn thành tốt', 'Nhiệm vụ năm học 2025-2026', '2026-06-30'],
      [5, 'KHEN_THUONG', 'Giải Ba nghiên cứu khoa học sinh viên', 'Đề tài ứng dụng AI trong học tập', '2026-04-18'],
    ];
    for (const [idx, type, title, detail, date] of demoActs) {
      if (idx !== i) continue;
      const act = { id: `HD-${txId()}`, memberId: id, type, title, detail, activityDate: date };
      const aHash = profileHash(act);
      const aRes = ledger.submit(officerUser, 'RecordActivity', { memberId: id, activityId: act.id, activityHash: aHash, summary: act.title });
      db.prepare('INSERT INTO activities(id,memberId,type,title,detail,activityDate,hash,txId,createdBy) VALUES (?,?,?,?,?,?,?,?,?)')
        .run(act.id, id, act.type, act.title, act.detail, act.activityDate, aHash, aRes.txId, officerOf(m.unit));
    }
  }

  // Demo: 2 đoàn viên đầu đã xác thực định danh điện tử mức 2 (mô phỏng VNeID)
  const verifyDemo = { username: 'chidoan01', role: 'CHI_DOAN', id: 'seed', displayName: 'chidoan01', unitId: 'CD-01' };
  for (const dv of db.prepare('SELECT * FROM members ORDER BY id LIMIT 2').all()) {
    const vres = { verified: true, provider: 'mock', level: 2, mdid: 'MD' + txId().slice(0, 12).toUpperCase(), refCode: 'VNEID-' + txId().slice(0, 8).toUpperCase(), at: new Date().toISOString() };
    ledger.submit(verifyDemo, 'VerifyIdentity', { memberId: dv.id, resultHash: 'SEED-' + txId().slice(0, 16), provider: 'mock', note: 'Xác thực định danh điện tử mức 2 (demo)' });
    db.prepare("UPDATE members SET idVerifyStatus='VERIFIED', idVerifySource='mock', idVerifyAt=?, idVerifyRef=?, mdid=? WHERE id=?")
      .run(vres.at, vres.refCode, vres.mdid, dv.id);
  }

  // Một yêu cầu chuyển sinh hoạt đang chờ (demo luồng 2 bước)
  const dv2 = db.prepare("SELECT * FROM members WHERE memberCode='DV20260002'").get();
  const tid = `CCH-${txId().slice(0, 8).toUpperCase()}`;
  const officer01 = { username: 'chidoan01', role: 'CHI_DOAN', id: 'seed', displayName: 'chidoan01', unitId: 'CD-01' };
  const tRes = ledger.submit(officer01, 'TransferRequest', {
    transferId: tid, memberId: dv2.id, fromUnit: 'CD-01', toUnit: 'CD-02', reason: 'Chuyển ngành học sang DI22A5',
  });
  db.prepare('INSERT INTO transfers(id,memberId,fromUnit,toUnit,reason,status,requestedBy,requestedAt,txId) VALUES (?,?,?,?,?,?,?,?,?)')
    .run(tid, dv2.id, 'CD-01', 'CD-02', 'Chuyển ngành học sang DI22A5', 'PENDING', 'chidoan01', new Date().toISOString(), tRes.txId);
  db.prepare("UPDATE members SET status='TRANSFER_PENDING' WHERE id=?").run(dv2.id);

  // Một yêu cầu chuyển đã bị từ chối (demo luồng TransferReject)
  const dv7 = db.prepare("SELECT * FROM members WHERE memberCode='DV20260007'").get();
  const tid7 = `CCH-${txId().slice(0, 8).toUpperCase()}`;
  const officer03 = { username: 'chidoan03', role: 'CHI_DOAN', id: 'seed', displayName: 'chidoan03', unitId: 'CD-03' };
  const t7 = ledger.submit(officer03, 'TransferRequest', {
    transferId: tid7, memberId: dv7.id, fromUnit: 'CD-03', toUnit: 'CD-01', reason: 'Xin chuyển theo nhóm bạn học cùng',
  });
  const r7 = ledger.submit({ username: 'chidoan01', role: 'CHI_DOAN', id: 'seed', displayName: 'chidoan01', unitId: 'CD-01' }, 'TransferReject', {
    transferId: tid7, note: 'Chi đoàn còn thiếu công tác viên, mời bạn ở lại phụ trách phong trào',
  });
  db.prepare('INSERT INTO transfers(id,memberId,fromUnit,toUnit,reason,status,requestedBy,requestedAt,decidedBy,decidedAt,note,txId,decidedTxId) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)')
    .run(tid7, dv7.id, 'CD-03', 'CD-01', 'Xin chuyển theo nhóm bạn học cùng', 'REJECTED', 'chidoan03', new Date().toISOString(), 'chidoan01', new Date().toISOString(), 'Chi đoàn còn thiếu công tác viên, mời bạn ở lại phụ trách phong trào', t7.txId, r7.txId);

  console.log('[seed] Hoàn tất: 5 đơn vị, 9 tài khoản, 7 đoàn viên, 2 yêu cầu chuyển (1 chờ, 1 từ chối).');
}

function officerOf(unitId) {
  return { 'CD-01': 'chidoan01', 'CD-02': 'chidoan02', 'CD-03': 'chidoan03' }[unitId] || 'doantruong';
}
function unitName(unitId) {
  const u = db.prepare('SELECT name FROM units WHERE id=?').get(unitId);
  return u ? u.name : unitId;
}

/** Nạp lại toàn bộ dữ liệu demo từ đầu */
function reseed() {
  db.exec('DELETE FROM units; DELETE FROM users; DELETE FROM members; DELETE FROM activities; DELETE FROM transfers; DELETE FROM alerts; DELETE FROM audit; DELETE FROM meta;');
  seedDemoData();
  global.__UNIT_PARENT__ = Object.fromEntries(db.prepare('SELECT id, parentId FROM units').all().map((r) => [r.id, r.parentId]));
}

module.exports = { db, init, reseed, unitName, newId };
