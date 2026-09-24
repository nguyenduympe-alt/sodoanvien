/**
 * ============ CHAINCODE: so-doan-vien (định nghĩa hợp đồng) ============
 * File này định nghĩa các hàm chaincode, chính sách ACL (ai được gọi) và
 * chính sách endorsement (tổ chức nào phải xác nhận giao dịch) — đúng theo
 * thiết kế mục 8.7 & 8.8 của đề cương.
 *
 * Cùng một định nghĩa này được dùng ở 2 nơi:
 *  1) Bộ mô phỏng ledger (src/ledger/simulator.js) — chạy ngay không cần Docker.
 *  2) Chaincode thật cho Hyperledger Fabric (chaincode/sodoanvien-contract.js).
 *
 * Danh sách MSP mô phỏng 4 tổ chức trong mạng Fabric:
 *   OrgChiDoanMSP    - tổ chức các cán bộ Chi đoàn
 *   OrgLienChiMSP    - tổ chức Liên chi đoàn / Đoàn khoa
 *   OrgDoanTruongMSP - tổ chức Đoàn trường
 *   OrgQuanTriMSP    - tổ chức Quản trị hệ thống (vận hành kỹ thuật)
 */

const ROLES = {
  DOAN_VIEN: 'DOAN_VIEN',
  CHI_DOAN: 'CHI_DOAN',
  LIEN_CHI: 'LIEN_CHI',
  DOAN_TRUONG: 'DOAN_TRUONG',
  QUAN_TRI: 'QUAN_TRI',
};

const MSP_OF_ROLE = {
  DOAN_VIEN: null, // Đoàn viên không giữ chứng thư Fabric (đề cương mục 8.6)
  CHI_DOAN: 'OrgChiDoanMSP',
  LIEN_CHI: 'OrgLienChiMSP',
  DOAN_TRUONG: 'OrgDoanTruongMSP',
  QUAN_TRI: 'OrgQuanTriMSP',
};

const ORGS = [
  { mspId: 'OrgChiDoanMSP', name: 'OrgChiDoan - Các Chi đoàn', peer: 'peer0.chidoan.example.com' },
  { mspId: 'OrgLienChiMSP', name: 'OrgLienChi - Liên chi đoàn/Đoàn khoa', peer: 'peer0.lienchi.example.com' },
  { mspId: 'OrgDoanTruongMSP', name: 'OrgDoanTruong - Đoàn trường', peer: 'peer0.doantruong.example.com' },
  { mspId: 'OrgQuanTriMSP', name: 'OrgQuanTri - Quản trị hệ thống', peer: 'peer0.quantri.example.com' },
];

// Chính sách endorsement: mặc định = tổ chức của người gọi phải ký (implicit).
// Không nghiệp vụ nào yêu cầu AND đồng thời 2 tổ chức (tránh giao dịch kẹt khi 1 peer offline).
const CONTRACT = {
  // ---- Ghi (submit → tạo block) ----
  CreateMemberProfile: {
    write: true,
    acl: [ROLES.CHI_DOAN, ROLES.DOAN_TRUONG],
    handler: (state, args, ctx) => {
      const { memberId, memberCode, unitId, unitName, profileHash, createdBy } = args;
      const key = `MEMBER::${memberId}`;
      if (state[key]) throw ledgerFail('INVALID_STATE', `Hồ sơ ${memberId} đã tồn tại trên ledger`);
      state[key] = {
        memberId, memberCode, unitId, unitName, profileHash,
        status: 'ACTIVE', createdBy, createdAt: ctx.now, lastTxId: ctx.txId,
      };
      state[`HISTORY::${memberId}`] = [{
        txId: ctx.txId, type: 'CreateMemberProfile', hash: profileHash,
        actor: createdBy, actorMsp: ctx.identity.mspId, ts: ctx.now, note: 'Tạo hồ sơ khi kết nạp',
      }];
      return { memberId, profileHash, status: 'ACTIVE' };
    },
  },

  UpdateMemberProfile: {
    write: true,
    acl: [ROLES.CHI_DOAN, ROLES.DOAN_TRUONG],
    handler: (state, args, ctx) => {
      const { memberId, newProfileHash, changeType, note } = args;
      const key = `MEMBER::${memberId}`;
      const m = state[key];
      if (!m) throw ledgerFail('NOT_FOUND', `Không tìm thấy hồ sơ ${memberId} trên ledger`);
      ctx.requireUnitOfficer(m.unitId); // chỉ cán bộ quản lí đơn vị đang sinh hoạt mới được sửa
      if (m.status === 'LOCKED_ANOMALY') {
        throw ledgerFail('INVALID_STATE', 'Hồ sơ đang bị khóa do bất thường dữ liệu, cần phục hồi trước');
      }
      const old = m.profileHash;
      m.profileHash = newProfileHash;
      m.lastTxId = ctx.txId;
      state[`HISTORY::${memberId}`].push({
        txId: ctx.txId, type: 'UpdateMemberProfile', hash: newProfileHash,
        prevHash: old, changeType, actor: ctx.identity.username, actorMsp: ctx.identity.mspId,
        ts: ctx.now, note: note || changeType,
      });
      return { memberId, oldHash: old, newProfileHash };
    },
  },

  RecordActivity: {
    write: true,
    acl: [ROLES.CHI_DOAN, ROLES.DOAN_TRUONG],
    handler: (state, args, ctx) => {
      const { memberId, activityId, activityHash, summary } = args;
      const m = state[`MEMBER::${memberId}`];
      if (!m) throw ledgerFail('NOT_FOUND', 'Hồ sơ không tồn tại');
      ctx.requireUnitOfficer(m.unitId);
      state[`HISTORY::${memberId}`].push({
        txId: ctx.txId, type: 'RecordActivity', hash: activityHash, activityId,
        actor: ctx.identity.username, actorMsp: ctx.identity.mspId, ts: ctx.now, note: summary,
      });
      return { memberId, activityId };
    },
  },

  TransferRequest: {
    write: true,
    acl: [ROLES.CHI_DOAN, ROLES.DOAN_TRUONG],
    handler: (state, args, ctx) => {
      const { transferId, memberId, fromUnit, toUnit, reason } = args;
      if (fromUnit === toUnit) throw ledgerFail('INVALID_STATE', 'Đơn vị chuyển đi và tiếp nhận trùng nhau');
      const m = state[`MEMBER::${memberId}`];
      if (!m) throw ledgerFail('NOT_FOUND', 'Hồ sơ không tồn tại');
      ctx.requireUnitOfficer(fromUnit); // chỉ đơn vị đang quản lí mới được lập yêu cầu chuyển đi
      if (m.status !== 'ACTIVE') throw ledgerFail('INVALID_STATE', `Hồ sơ đang ở trạng thái ${m.status}, không thể chuyển`);
      const key = `TRANSFER::${transferId}`;
      if (state[key]) throw ledgerFail('INVALID_STATE', 'Mã yêu cầu chuyển đã tồn tại');
      state[key] = {
        transferId, memberId, fromUnit, toUnit, reason,
        status: 'PENDING', requestedBy: ctx.identity.username, requestedAt: ctx.now,
      };
      m.status = 'TRANSFER_PENDING';
      state[`HISTORY::${memberId}`].push({
        txId: ctx.txId, type: 'TransferRequest', actor: ctx.identity.username,
        actorMsp: ctx.identity.mspId, ts: ctx.now, note: `Chuyển ${fromUnit} → ${toUnit}: ${reason || ''}`,
      });
      return { transferId, status: 'PENDING' };
    },
  },

  TransferAccept: {
    write: true,
    acl: [ROLES.CHI_DOAN, ROLES.LIEN_CHI, ROLES.DOAN_TRUONG],
    handler: (state, args, ctx) => {
      return decideTransfer(state, args, ctx, 'ACCEPTED');
    },
  },

  TransferReject: {
    write: true,
    acl: [ROLES.CHI_DOAN, ROLES.LIEN_CHI, ROLES.DOAN_TRUONG],
    handler: (state, args, ctx) => {
      return decideTransfer(state, args, ctx, 'REJECTED');
    },
  },

  ReportAnomaly: {
    write: true,
    acl: [ROLES.QUAN_TRI],
    handler: (state, args, ctx) => {
      const { memberId, expectedHash, foundHash } = args;
      state[`ANOMALY::${memberId}`] = { expectedHash, foundHash, detectedAt: ctx.now, txId: ctx.txId };
      const m = state[`MEMBER::${memberId}`];
      if (m) m.status = 'LOCKED_ANOMALY';
      return { memberId, locked: true };
    },
  },

  // Ghi vết kết quả xác thực định danh điện tử (VNeID/eKYC) — KHÔNG lưu CCCD, chỉ lưu hash kết quả
  VerifyIdentity: {
    write: true,
    acl: [ROLES.CHI_DOAN, ROLES.DOAN_TRUONG],
    handler: (state, args, ctx) => {
      const { memberId, resultHash, provider, note } = args;
      const m = state[`MEMBER::${memberId}`];
      if (!m) throw ledgerFail('NOT_FOUND', 'Hồ sơ không tồn tại trên ledger');
      ctx.requireUnitOfficer(m.unitId);
      state[`HISTORY::${memberId}`].push({
        txId: ctx.txId, type: 'IdentityVerified', hash: resultHash,
        actor: ctx.identity.username, actorMsp: ctx.identity.mspId, ts: ctx.now,
        note: note || `Xác thực định danh điện tử mức 2 qua ${provider}`,
      });
      return { memberId, resultHash, provider };
    },
  },

  // Mở khóa hồ sơ sau khi đã phục hồi và hash khớp lại với ledger
  UnlockMember: {
    write: true,
    acl: [ROLES.QUAN_TRI],
    handler: (state, args, ctx) => {
      const m = state[`MEMBER::${args.memberId}`];
      if (!m) throw ledgerFail('NOT_FOUND', 'Hồ sơ không tồn tại trên ledger');
      const was = m.status;
      m.status = 'ACTIVE';
      state[`HISTORY::${args.memberId}`].push({
        txId: ctx.txId, type: 'UnlockMember', actor: ctx.identity.username,
        actorMsp: ctx.identity.mspId, ts: ctx.now,
        note: args.note || `Mở khóa hồ sơ (trạng thái trước: ${was})`,
      });
      return { memberId: args.memberId, status: 'ACTIVE', previousStatus: was };
    },
  },

  RecordDailyBackupHash: {
    write: true,
    acl: [ROLES.QUAN_TRI],
    handler: (state, args, ctx) => {
      const { snapshotId, snapshotHash, manifestHash, stats } = args;
      const key = `BACKUP::${snapshotId}`;
      if (state[key]) throw ledgerFail('INVALID_STATE', 'Snapshot đã được ghi nhận');
      state[key] = {
        snapshotId, snapshotHash, manifestHash, stats: stats || {},
        status: 'RECORDED', createdBy: ctx.identity.username, createdAt: ctx.now, txId: ctx.txId,
      };
      return { snapshotId, snapshotHash, status: 'RECORDED' };
    },
  },

  ConfirmRecovery: {
    write: true,
    acl: [ROLES.QUAN_TRI],
    handler: (state, args, ctx) => {
      const { recoveryId, snapshotId, detailsHash } = args;
      const b = state[`BACKUP::${snapshotId}`];
      if (!b) throw ledgerFail('NOT_FOUND', 'Snapshot chưa từng được ghi trên ledger → không được phép phục hồi');
      if (b.snapshotHash !== args.verifiedSnapshotHash) {
        throw ledgerFail('INVALID_STATE', 'Hash snapshot không khớp với ledger → từ chối phục hồi');
      }
      b.status = 'USED';
      state[`RECOVERY::${recoveryId}`] = {
        recoveryId, snapshotId, performedBy: ctx.identity.username, performedAt: ctx.now, detailsHash,
      };
      return { recoveryId, snapshotId, confirmed: true };
    },
  },

  // ---- Đọc (query → không tạo block) ----
  QueryMember: {
    write: false,
    acl: null, // mọi định danh đã xác thực; phạm vi dữ liệu do API tầng ứng dụng kiểm soát
    handler: (state, args) => state[`MEMBER::${args.memberId}`] || null,
  },
  GetMemberHistory: {
    write: false,
    acl: null,
    handler: (state, args) => state[`HISTORY::${args.memberId}`] || [],
  },
  QueryTransfer: {
    write: false,
    acl: null,
    handler: (state, args) => state[`TRANSFER::${args.transferId}`] || null,
  },
  VerifyProfileHash: {
    write: false,
    acl: null,
    handler: (state, args) => {
      const m = state[`MEMBER::${args.memberId}`];
      if (!m) return { exists: false, match: false };
      return { exists: true, match: m.profileHash === args.hashToCheck, ledgerHash: m.profileHash };
    },
  },
  QueryBackup: {
    write: false,
    acl: null,
    handler: (state, args) => state[`BACKUP::${args.snapshotId}`] || null,
  },
};

// Xử lí chung cho TransferAccept / TransferReject (đề cương: mô hình 2 bước)
function decideTransfer(state, args, ctx, decision) {
  const { transferId, note } = args;
  const t = state[`TRANSFER::${transferId}`];
  if (!t) throw ledgerFail('NOT_FOUND', 'Yêu cầu chuyển sinh hoạt không tồn tại');
  if (t.status !== 'PENDING') throw ledgerFail('INVALID_STATE', `Yêu cầu đã được xử lí (${t.status})`);

  const id = ctx.identity;
  const isTargetUnit = id.unitId === t.toUnit;
  const isHigher = id.role === ROLES.LIEN_CHI || id.role === ROLES.DOAN_TRUONG;
  if (!isTargetUnit && !isHigher) {
    throw ledgerFail('ACL_DENIED', 'Chỉ đơn vị tiếp nhận hoặc cấp quản lí phía trên mới được phê duyệt');
  }

  t.status = decision;
  t.decidedBy = id.username;
  t.decidedAt = ctx.now;
  t.note = note || '';
  t.decidedTxId = ctx.txId;

  const m = state[`MEMBER::${t.memberId}`];
  if (m) {
    if (decision === 'ACCEPTED') {
      m.unitId = t.toUnit;
      m.unitName = args.toUnitName || m.unitName;
      m.status = 'ACTIVE';
    } else {
      m.status = 'ACTIVE';
    }
    state[`HISTORY::${t.memberId}`].push({
      txId: ctx.txId, type: decision === 'ACCEPTED' ? 'TransferAccept' : 'TransferReject',
      actor: id.username, actorMsp: id.mspId, ts: ctx.now,
      note: `${t.fromUnit} → ${t.toUnit} ${decision === 'ACCEPTED' ? 'đồng ý' : 'từ chối'}${note ? ': ' + note : ''}`,
    });
  }
  return { transferId, status: decision };
}

function ledgerFail(code, message) {
  const e = new Error(message);
  e.code = code;
  return e;
}

module.exports = { CONTRACT, ORGS, ROLES, MSP_OF_ROLE };
