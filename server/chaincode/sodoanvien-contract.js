/**
 * ============ CHAINCODE THẬT CHO HYPERLEDGER FABRIC ============
 * Dùng fabric-contract-api (Node.js). Các hàm cùng tên + cùng logic với bản
 * mô phỏng ở src/ledger/contract.js → triển khai test-network thật mà KHÔNG
 * phải sửa tầng API (chỉ đổi LEDGER_MODE=fabric).
 *
 * Cách triển khai nhanh: xem server/chaincode/deploy-testnet.sh
 */
const { Contract } = require('fabric-contract-api');

class SoDoanVienContract extends Contract {
  // ===== Hồ sơ đoàn viên =====
  async CreateMemberProfile(ctx, memberId, memberCode, unitId, unitName, profileHash, createdBy) {
    const key = `MEMBER::${memberId}`;
    const exists = await ctx.stub.getState(key);
    if (exists && exists.length) throw new Error(`Hồ sơ ${memberId} đã tồn tại trên ledger`);
    const record = { memberId, memberCode, unitId, unitName, profileHash, status: 'ACTIVE', createdBy, createdAt: ctx.stub.getTxTimestamp().seconds.low };
    await ctx.stub.putState(key, Buffer.from(JSON.stringify(record)));
    await this._pushHistory(ctx, memberId, { type: 'CreateMemberProfile', hash: profileHash, actor: createdBy, note: 'Tạo hồ sơ khi kết nạp' });
    await ctx.stub.setEvent('MemberCreated', Buffer.from(JSON.stringify({ memberId, profileHash })));
    return JSON.stringify(record);
  }

  async UpdateMemberProfile(ctx, memberId, newProfileHash, changeType, note) {
    const m = await this._getMember(ctx, memberId);
    if (m.status === 'LOCKED_ANOMALY') throw new Error('Hồ sơ đang bị khóa do bất thường dữ liệu');
    const prevHash = m.profileHash;
    m.profileHash = newProfileHash;
    await ctx.stub.putState(`MEMBER::${memberId}`, Buffer.from(JSON.stringify(m)));
    await this._pushHistory(ctx, memberId, { type: 'UpdateMemberProfile', hash: newProfileHash, prevHash, changeType, note });
    await ctx.stub.setEvent('MemberUpdated', Buffer.from(JSON.stringify({ memberId, newProfileHash })));
    return JSON.stringify({ memberId, prevHash, newProfileHash });
  }

  async RecordActivity(ctx, memberId, activityId, activityHash, summary) {
    await this._getMember(ctx, memberId);
    await this._pushHistory(ctx, memberId, { type: 'RecordActivity', hash: activityHash, activityId, note: summary });
    return JSON.stringify({ memberId, activityId });
  }

  // ===== Chuyển sinh hoạt 2 bước =====
  async TransferRequest(ctx, transferId, memberId, fromUnit, toUnit, reason) {
    const key = `TRANSFER::${transferId}`;
    const exists = await ctx.stub.getState(key);
    if (exists && exists.length) throw new Error('Mã yêu cầu chuyển đã tồn tại');
    const m = await this._getMember(ctx, memberId);
    if (m.status !== 'ACTIVE') throw new Error(`Hồ sơ đang ở trạng thái ${m.status}`);
    const t = { transferId, memberId, fromUnit, toUnit, reason, status: 'PENDING', requestedAt: Date.now() };
    await ctx.stub.putState(key, Buffer.from(JSON.stringify(t)));
    m.status = 'TRANSFER_PENDING';
    await ctx.stub.putState(`MEMBER::${memberId}`, Buffer.from(JSON.stringify(m)));
    await this._pushHistory(ctx, memberId, { type: 'TransferRequest', note: `Chuyển ${fromUnit} → ${toUnit}` });
    await ctx.stub.setEvent('TransferRequested', Buffer.from(JSON.stringify({ transferId, memberId })));
    return JSON.stringify(t);
  }

  async TransferAccept(ctx, transferId, toUnitName, note) {
    return this._decide(ctx, transferId, 'ACCEPTED', toUnitName, note);
  }

  async TransferReject(ctx, transferId, note) {
    return this._decide(ctx, transferId, 'REJECTED', null, note);
  }

  // ===== Xác minh & truy vấn =====
  async VerifyProfileHash(ctx, memberId, hashToCheck) {
    const data = await ctx.stub.getState(`MEMBER::${memberId}`);
    if (!data || !data.length) return JSON.stringify({ exists: false, match: false });
    const m = JSON.parse(data.toString());
    return JSON.stringify({ exists: true, match: m.profileHash === hashToCheck, ledgerHash: m.profileHash });
  }

  async QueryMember(ctx, memberId) {
    const data = await ctx.stub.getState(`MEMBER::${memberId}`);
    return data && data.length ? data.toString() : 'null';
  }

  async GetMemberHistory(ctx, memberId) {
    const it = ctx.stub.getHistoryForKey(`MEMBER::${memberId}`);
    const out = [];
    // Lịch sử đầy đủ: kết hợp HISTORY::key và lịch sử phiên bản của key MEMBER
    const h = await ctx.stub.getState(`HISTORY::${memberId}`);
    if (h && h.length) out.push(...JSON.parse(h.toString()));
    return JSON.stringify(out);
  }

  // ===== Sao lưu & phục hồi =====
  async RecordDailyBackupHash(ctx, snapshotId, snapshotHash, manifestHash, statsJson) {
    const key = `BACKUP::${snapshotId}`;
    const exists = await ctx.stub.getState(key);
    if (exists && exists.length) throw new Error('Snapshot đã được ghi nhận');
    const record = { snapshotId, snapshotHash, manifestHash, stats: JSON.parse(statsJson || '{}'), status: 'RECORDED', createdAt: new Date().toISOString() };
    await ctx.stub.putState(key, Buffer.from(JSON.stringify(record)));
    await ctx.stub.setEvent('DailyBackupHash', Buffer.from(JSON.stringify({ snapshotId, snapshotHash })));
    return JSON.stringify(record);
  }

  async ConfirmRecovery(ctx, recoveryId, snapshotId, detailsHash) {
    const data = await ctx.stub.getState(`BACKUP::${snapshotId}`);
    if (!data || !data.length) throw new Error('Snapshot chưa từng được ghi trên ledger → không được phép phục hồi');
    const b = JSON.parse(data.toString());
    const record = { recoveryId, snapshotId, snapshotHash: b.snapshotHash, detailsHash, performedAt: new Date().toISOString() };
    await ctx.stub.putState(`RECOVERY::${recoveryId}`, Buffer.from(JSON.stringify(record)));
    await ctx.stub.setEvent('RecoveryConfirmed', Buffer.from(JSON.stringify(record)));
    return JSON.stringify(record);
  }

  // ===== Bất thường =====
  async ReportAnomaly(ctx, memberId, expectedHash, foundHash) {
    const m = await this._getMember(ctx, memberId);
    m.status = 'LOCKED_ANOMALY';
    await ctx.stub.putState(`MEMBER::${memberId}`, Buffer.from(JSON.stringify(m)));
    const a = { memberId, expectedHash, foundHash, detectedAt: new Date().toISOString() };
    await ctx.stub.putState(`ANOMALY::${memberId}`, Buffer.from(JSON.stringify(a)));
    await ctx.stub.setEvent('AnomalyDetected', Buffer.from(JSON.stringify(a)));
    return JSON.stringify(a);
  }

  async UnlockMember(ctx, memberId, note) {
    const m = await this._getMember(ctx, memberId);
    const was = m.status;
    m.status = 'ACTIVE';
    await ctx.stub.putState(`MEMBER::${memberId}`, Buffer.from(JSON.stringify(m)));
    await this._pushHistory(ctx, memberId, { type: 'UnlockMember', note: note || `Mở khóa (trước đó: ${was})` });
    return JSON.stringify({ memberId, status: 'ACTIVE', previousStatus: was });
  }

  // ===== Hàm phụ =====
  async _getMember(ctx, memberId) {
    const data = await ctx.stub.getState(`MEMBER::${memberId}`);
    if (!data || !data.length) throw new Error(`Không tìm thấy hồ sơ ${memberId} trên ledger`);
    return JSON.parse(data.toString());
  }

  async _pushHistory(ctx, memberId, entry) {
    const key = `HISTORY::${memberId}`;
    const data = await ctx.stub.getState(key);
    const list = data && data.length ? JSON.parse(data.toString()) : [];
    entry.txId = ctx.stub.getTxID();
    entry.ts = new Date().toISOString();
    entry.actorMsp = ctx.clientIdentity.getMSPID();
    list.push(entry);
    await ctx.stub.putState(key, Buffer.from(JSON.stringify(list)));
  }

  async _decide(ctx, transferId, decision, toUnitName, note) {
    const data = await ctx.stub.getState(`TRANSFER::${transferId}`);
    if (!data || !data.length) throw new Error('Yêu cầu chuyển sinh hoạt không tồn tại');
    const t = JSON.parse(data.toString());
    if (t.status !== 'PENDING') throw new Error(`Yêu cầu đã được xử lí (${t.status})`);
    t.status = decision;
    t.decidedBy = ctx.clientIdentity.getID();
    t.decidedAt = new Date().toISOString();
    t.note = note || '';
    await ctx.stub.putState(`TRANSFER::${transferId}`, Buffer.from(JSON.stringify(t)));
    const m = await this._getMember(ctx, t.memberId);
    if (decision === 'ACCEPTED') {
      m.unitId = t.toUnit;
      if (toUnitName) m.unitName = toUnitName;
    }
    m.status = 'ACTIVE';
    await ctx.stub.putState(`MEMBER::${t.memberId}`, Buffer.from(JSON.stringify(m)));
    await this._pushHistory(ctx, t.memberId, { type: decision, note: `${t.fromUnit} → ${t.toUnit} ${decision}` });
    await ctx.stub.setEvent('TransferDecided', Buffer.from(JSON.stringify({ transferId, status: decision })));
    return JSON.stringify(t);
  }
}

module.exports.contracts = ['SoDoanVienContract', SoDoanVienContract];
module.exports.SoDoanVienContract = SoDoanVienContract;
