/**
 * ============ BỘ MÔ PHỎNG HYPERLEDGER FABRIC (ledger cục bộ) ============
 * Mô phỏng đúng các đặc trưng của một mạng Fabric cấp phép:
 *   - Định danh MSP: mỗi giao dịch mang danh danh tính (user + MSP) do CA cấp.
 *   - Endorsement policy: giao dịch ghi phải được peer của tổ chức tương ứng ký;
 *     peer của tổ chức nào offline → giao dịch BỊ TỪ CHỨNG THỰC (không ghi sổ) —
 *     đúng kịch bản kiểm thử số 7 của đề cương.
 *   - Block: các giao dịch hợp lệ được đóng block, mỗi block chứa hash của block
 *     trước (hash chain) → mọi sửa đổi lịch sử đều làm gãy chuỗi băm.
 *   - World state: lưu trạng thái hiện hành, không lưu dữ liệu cá nhân, chỉ lưu
 *     mã định danh nội bộ + hash + trạng thái nghiệp vụ (đề cương mục 8.5).
 *
 * Khi có Docker/mạng Fabric thật: chỉ cần đặt LEDGER_MODE=fabric, hệ thống dùng
 * src/ledger/fabricGateway.js với cùng giao diện submit/query bên dưới.
 */
const fs = require('fs');
const path = require('path');
const { createHash } = require('crypto');
const { CONTRACT, ORGS, MSP_OF_ROLE } = require('./contract');

const LEDGER_FILE = path.join(__dirname, '../../data/ledger.json');

let ledger = null; // { blocks, state, orgs }
let pendingTxs = []; // buffer giao dịch trong block đang mở

function sha256(s) {
  return createHash('sha256').update(typeof s === 'string' ? s : JSON.stringify(s), 'utf8').digest('hex');
}

function init() {
  fs.mkdirSync(path.dirname(LEDGER_FILE), { recursive: true });
  if (fs.existsSync(LEDGER_FILE)) {
    try {
      ledger = JSON.parse(fs.readFileSync(LEDGER_FILE, 'utf8'));
    } catch { ledger = null; }
  }
  if (!ledger) {
    const genesis = {
      number: 0, prevHash: '0'.repeat(64),
      hash: sha256('GENESIS-SO-DOAN-VIEN'), timestamp: new Date().toISOString(),
      txs: [{ txId: 'GENESIS', fn: 'GENESIS', note: 'Block khởi tạo mạng Fabric mô phỏng' }],
    };
    ledger = { blocks: [genesis], state: {}, orgs: ORGS.map((o) => ({ ...o, peerOnline: true })) };
    persist();
  }
}

function persist() {
  fs.writeFileSync(LEDGER_FILE, JSON.stringify(ledger));
}

function reset() {
  if (fs.existsSync(LEDGER_FILE)) fs.rmSync(LEDGER_FILE);
  ledger = null; // ★ ép init() tạo genesis mới, không dùng lại state cũ trong bộ nhớ
  init();
}

function orgByMsp(mspId) {
  return ledger.orgs.find((o) => o.mspId === mspId);
}

// Định danh người dùng ứng dụng → danh tính Fabric (identity + MSP)
function identityOf(user) {
  const mspId = user.role === 'DOAN_VIEN' ? null : MSP_OF_ROLE[user.role];
  return { userId: user.id, username: user.username, displayName: user.displayName, role: user.role, unitId: user.unitId || null, mspId };
}

/**
 * Gửi giao dịch ghi (tương đương submitTransaction của Fabric Gateway).
 * Trình tự mô phỏng:Proposal → Endorsement → Orderer → Commit.
 */
function submit(user, fn, args = {}) {
  const spec = CONTRACT[fn];
  if (!spec) throw fail('NOT_FOUND', `Hàm chaincode '${fn}' không tồn tại`);
  if (!spec.write) return query(user, fn, args);

  const identity = identityOf(user);
  if (!identity.mspId) {
    throw fail('ACL_DENIED', 'Đoàn viên không giữ chứng thư Fabric nên không thể ghi giao dịch lên ledger (đề cương mục 8.6)');
  }
  if (spec.acl && !spec.acl.includes(identity.role)) {
    throw fail('ACL_DENIED', `Vai trò ${identity.role} không có quyền gọi ${fn}`);
  }

  // --- Giai đoạn endorsement: mọi tổ chức liên quan phải online ---
  const endorsers = endorsementOrgs(fn, identity);
  for (const mspId of endorsers) {
    const org = orgByMsp(mspId);
    if (!org) throw fail('ENDORSEMENT_POLICY', `Không tìm thấy tổ chức ${mspId}`);
    if (!org.peerOnline) {
      throw fail(
        'ENDORSEMENT_OFFLINE',
        `Peer ${org.peer} (${org.name}) đang offline → giao dịch ${fn} không đủ chữ ký endorsement, đã bị hoãn. ` +
          'Yêu cầu vẫn được giữ ở tầng ứng dụng và có thể gửi lại khi peer hoạt động trở lại.'
      );
    }
  }

  // --- Thực thi chaincode trên world state (read-write set mô phỏng) ---
  const now = new Date().toISOString();
  const txId = sha256(fn + now + Math.random() + JSON.stringify(args)).slice(0, 24);
  const stateCopy = JSON.parse(JSON.stringify(ledger.state)); // sandbox: nếu handler lỗi thì không ảnh hưởng state thật
  const ctx = {
    now, txId, identity,
    requireUnitOfficer: (unitId) => {
      const ok =
        (identity.role === 'CHI_DOAN' && identity.unitId === unitId) ||
        identity.role === 'DOAN_TRUONG' ||
        (identity.role === 'LIEN_CHI' && unitBelongsToLienChi(identity.unitId, unitId));
      if (!ok) throw fail('ACL_DENIED', `Bạn không phải cán bộ quản lí đơn vị ${unitId}`);
    },
  };
  let result;
  try {
    result = spec.handler(stateCopy, args, ctx) || {};
  } catch (e) {
    // Giao dịch endorsement thất bại → KHÔNG ghi lên ledger (giống Fabric thật)
    e.txId = txId;
    throw e;
  }
  ledger.state = stateCopy;

  // --- Đóng block ---
  const tx = {
    txId, fn, args, result,
    caller: { username: identity.username, role: identity.role, mspId: identity.mspId, unitId: identity.unitId },
    endorsements: endorsers.map((m) => ({ mspId: m, signed: true })),
    status: 'VALID', timestamp: now,
  };
  pendingTxs.push(tx);
  closeBlockIfNeeded();
  return { txId, blockNumber: ledger.blocks.length - 1, result, fn, timestamp: now };
}

/** Đơn vị thuộc liên chi nào (để cán bộ Liên chi được phê duyệt phạm vi của mình) */
function unitBelongsToLienChi(lienChiUnitId, unitId) {
  const map = global.__UNIT_PARENT__ || {};
  return map[unitId] === lienChiUnitId;
}

// Mỗi block tối đa 5 giao dịch (mô phỏng batching của orderer)
function closeBlockIfNeeded() {
  while (pendingTxs.length >= 5) closeBlock();
}
function flushBlock() {
  if (pendingTxs.length) closeBlock();
}
function closeBlock() {
  const prev = ledger.blocks[ledger.blocks.length - 1];
  const block = {
    number: prev.number + 1,
    prevHash: prev.hash,
    txs: pendingTxs.splice(0, 5),
    timestamp: new Date().toISOString(),
  };
  block.hash = sha256({ n: block.number, p: block.prevHash, txs: block.txs.map((t) => t.txId) });
  ledger.blocks.push(block);
  persist();
}

/** Truy vấn (tương đương evaluateTransaction — không tạo block) */
function query(user, fn, args = {}) {
  const spec = CONTRACT[fn];
  if (!spec) throw fail('NOT_FOUND', `Hàm chaincode '${fn}' không tồn tại`);
  if (spec.acl && user && !spec.acl.includes(user.role)) {
    throw fail('ACL_DENIED', `Vai trò ${user.role} không có quyền gọi ${fn}`);
  }
  const identity = user ? identityOf(user) : { userId: 'system', role: 'QUAN_TRI', mspId: 'OrgQuanTriMSP', username: 'system' };
  const ctx = { now: new Date().toISOString(), txId: null, identity, requireUnitOfficer: () => {} };
  return spec.handler(ledger.state, args, ctx);
}

/** Các tổ chức cần endorsement cho một giao dịch (đơn giản hóa từ endorsement policy) */
function endorsementOrgs(fn, identity) {
  const need = new Set([identity.mspId]); // tổ chức của người gọi luôn phải ký
  if (fn === 'RecordDailyBackupHash' || fn === 'ConfirmRecovery' || fn === 'ReportAnomaly') {
    need.add('OrgQuanTriMSP'); // nghiệp vụ hệ thống bắt buộc tổ chức quản trị ký
  }
  if (fn === 'TransferAccept' || fn === 'TransferReject') {
    need.add('OrgDoanTruongMSP'); // cấp quản lí chứng kiến việc chuyển sinh hoạt
  }
  return [...need];
}

function getBlocks({ limit = 20, offset = 0 } = {}) {
  flushBlock();
  const list = ledger.blocks;
  return {
    total: list.length,
    blocks: list.slice(Math.max(0, list.length - offset - limit), list.length - offset || undefined).slice(-limit).reverse(),
  };
}

function getTx(txId) {
  flushBlock();
  for (const b of ledger.blocks) {
    const tx = b.txs.find((t) => t.txId === txId);
    if (tx) return { block: b.number, ...tx };
  }
  return null;
}

function getOrgs() {
  flushBlock();
  return ledger.orgs.map(({ mspId, name, peer, peerOnline }) => ({ mspId, name, peer, peerOnline }));
}

function setPeerOnline(mspId, online) {
  const org = orgByMsp(mspId);
  if (!org) throw fail('NOT_FOUND', 'Không tìm thấy tổ chức');
  org.peerOnline = !!online;
  persist();
  return orgByMsp(mspId);
}

/** Hash hiện hành trên ledger của một hồ sơ — dùng cho đối soát */
function getLedgerProfileHash(memberId) {
  const m = ledger.state[`MEMBER::${memberId}`];
  return m ? m.profileHash : null;
}

function getStats() {
  flushBlock();
  let txs = 0;
  const byFn = {};
  let firstTs = null;
  let lastTs = null;
  for (const b of ledger.blocks) {
    for (const t of b.txs) {
      if (t.fn === 'GENESIS') continue;
      txs += 1;
      byFn[t.fn] = (byFn[t.fn] || 0) + 1;
      const ts = t.timestamp || b.timestamp;
      if (!firstTs || ts < firstTs) firstTs = ts;
      if (!lastTs || ts > lastTs) lastTs = ts;
    }
  }
  return { blocks: ledger.blocks.length - 1, txs, byFn, firstTs, lastTs };
}

function fail(code, message) {
  const e = new Error(message);
  e.code = code;
  return e;
}

init();
// Đóng block dở dang khi tắt server
process.on('exit', flushBlock);

module.exports = {
  submit, query, getBlocks, getTx, getOrgs, setPeerOnline,
  getLedgerProfileHash, getStats, identityOf, flushBlock, reset, sha256,
};
