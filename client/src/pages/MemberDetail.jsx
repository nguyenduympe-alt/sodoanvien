import React, { useEffect, useState, useCallback } from 'react';
import { api, fmtTime, short, ACTIVITY_TYPES, ROLE_LABEL } from '../api.js';
import { StatusPill, Modal, Hash, Empty, Loading, useToast, SyncBadge } from '../components.jsx';

export default function MemberDetail({ me, id }) {
  const [d, setD] = useState(null);
  const [err, setErr] = useState('');
  const [showEdit, setShowEdit] = useState(false);
  const [showActivity, setShowActivity] = useState(false);
  const [showTransfer, setShowTransfer] = useState(false);
  const [showIdentity, setShowIdentity] = useState(false);
  const toast = useToast();

  const load = useCallback(() => {
    api.get(`/members/${id}`).then(setD).catch((e) => setErr(e.message));
  }, [id]);
  useEffect(() => { load(); }, [load]);

  if (err) return <div className="note" style={{ marginTop: 20 }}>{err} <a className="btn sm" href="#/members">← Danh sách</a></div>;
  if (!d) return <Loading />;
  const { member: m, activities, transfers, history, verify } = d;
  const canEdit = (me.role === 'CHI_DOAN' && me.unitId === m.unitId) || me.role === 'DOAN_TRUONG';

  return (
    <>
      <div className="page-head">
        <div>
          <a href="#/members" style={{ fontSize: 12.5, color: 'var(--info)' }}>← Danh sách đoàn viên</a>
          <h2 style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            {m.fullName} <StatusPill status={m.status} /> <SyncBadge verify={verify} />
            <IdBadge m={m} />
          </h2>
          <p><code>{m.id}</code> · Mã ĐV: <b>{m.memberCode}</b> · {m.unitName || m.unitId}</p>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <a className="btn" href={`#/members/${m.id}/card`}>🪪 Thẻ &amp; QR</a>
          {((me.role === 'CHI_DOAN' && me.unitId === m.unitId) || me.role === 'DOAN_TRUONG') && (
            <>
              <button className="btn" onClick={() => setShowIdentity(true)}>🇻🇳 Xác thực định danh</button>
              <button className="btn" onClick={() => setShowEdit(true)}>✏️ Cập nhật hồ sơ</button>
              <button className="btn" onClick={() => setShowActivity(true)}>🏅 Ghi hoạt động</button>
              {m.status === 'ACTIVE' && <button className="btn gold" onClick={() => setShowTransfer(true)}>🔁 Chuyển sinh hoạt</button>}
            </>
          )}
        </div>
      </div>

      <div className="grid cols-2" style={{ marginBottom: 14 }}>
        <div className="card">
          <div className="card-h"><b>Thông tin hồ sơ</b>
            <button className="btn sm" onClick={async () => {
              try {
                const r = await api.post(`/members/${m.id}/verify`, {});
                toast(r.match ? '✅ Hash khớp với ledger — dữ liệu toàn vẹn' : '❌ Hash LỆCH với ledger!', r.match ? 'ok' : 'err');
              } catch (e) { toast(e.message, 'err'); }
            }}>🛡️ Xác minh hash</button>
          </div>
          <div className="card-b">
            <dl className="kv">
              <dt>Ngày sinh</dt><dd>{m.dob || '—'} {m.gender ? `(${m.gender})` : ''}</dd>
              <dt>Lớp</dt><dd>{m.className || '—'}</dd>
              <dt>CCCD</dt><dd>{m.cccd || '—'} <span className="pill gray">off-chain only</span></dd>
              <dt>Điện thoại</dt><dd>{m.phone || '—'}</dd>
              <dt>Email</dt><dd>{m.email || '—'}</dd>
              <dt>Ngày kết nạp</dt><dd>{m.joinDate || '—'}</dd>
              <dt>Nơi kết nạp</dt><dd>{m.joinPlace || '—'}</dd>
              <dt>Địa chỉ</dt><dd>{m.homeAddress || '—'}</dd>
              <dt>Định danh điện tử</dt><dd><IdBadge m={m} detailed /></dd>
              <dt>Hash hiện tại</dt><dd><Hash value={verify.offchainHash} n={20} /></dd>
              <dt>Hash trên ledger</dt><dd><Hash value={verify.ledgerHash} n={20} /></dd>
              <dt>Giao dịch cuối</dt><dd><Hash value={m.lastTxId} /></dd>
            </dl>
          </div>
        </div>

        <div className="card">
          <div className="card-h"><b>Lịch sử giao dịch trên ledger</b><span className="pill info">{history.length} giao dịch</span></div>
          <div className="card-b" style={{ maxHeight: 430, overflowY: 'auto' }}>
            {history.length === 0 ? <Empty icon="⛓️" /> : (
              <div className="tl">
                {history.slice().reverse().map((h, i) => (
                  <div className="tl-item" key={i}>
                    <b style={{ fontSize: 13 }}>{fnLabel(h.type)}</b> <Hash value={h.txId} n={8} />
                    <div style={{ fontSize: 12.5 }}>{h.note || h.changeType || ''}</div>
                    <small>{fmtTime(h.ts)} · {h.actor} <span className="pill gray" style={{ fontSize: 10 }}>{h.actorMsp}</span></small>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="grid cols-2">
        <div className="card">
          <div className="card-h"><b>Hoạt động · Đánh giá · Khen thưởng · Kỉ luật</b></div>
          <div className="card-b">
            {activities.length === 0 ? <Empty icon="🏅" text="Chưa ghi nhận hoạt động" /> : activities.map((a) => (
              <div key={a.id} className="alert-item">
                <span style={{ fontSize: 18 }}>{actIcon(a.type)}</span>
                <div style={{ flex: 1 }}>
                  <b style={{ fontSize: 13.5 }}>{a.title}</b> <span className="pill gray">{typeLabel(a.type)}</span>
                  <div style={{ fontSize: 12.5, color: 'var(--muted)' }}>{a.detail}</div>
                  <small style={{ color: 'var(--muted)' }}>{a.activityDate} · tx <Hash value={a.txId} n={8} /></small>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="card">
          <div className="card-h"><b>Lịch sử chuyển sinh hoạt</b></div>
          <div className="card-b">
            {transfers.length === 0 ? <Empty icon="🔁" text="Chưa có yêu cầu chuyển sinh hoạt" /> : transfers.map((t) => (
              <div key={t.id} className="alert-item">
                <div style={{ flex: 1 }}>
                  <b style={{ fontSize: 13 }}>{t.fromName || t.fromUnit} → {t.toName || t.toUnit}</b> <StatusPill status={t.status} />
                  <div style={{ fontSize: 12.5, color: 'var(--muted)' }}>Lí do: {t.reason || '—'}</div>
                  <small style={{ color: 'var(--muted)' }}>Lập: {fmtTime(t.requestedAt)}{t.decidedAt ? ` · Duyệt: ${fmtTime(t.decidedAt)} bởi ${t.decidedBy}` : ''}</small>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {showEdit && <EditModal m={m} onClose={() => setShowEdit(false)} onDone={() => { setShowEdit(false); load(); }} />}
      {showIdentity && <IdentityModal m={m} onClose={() => setShowIdentity(false)} onDone={() => { setShowIdentity(false); load(); }} />}
      {showActivity && <ActivityModal m={m} onClose={() => setShowActivity(false)} onDone={() => { setShowActivity(false); load(); }} />}
      {showTransfer && <TransferModal m={m} onClose={() => setShowTransfer(false)} onDone={() => { setShowTransfer(false); load(); }} />}
    </>
  );
}

// Huy hiệu trạng thái định danh điện tử
function IdBadge({ m, detailed }) {
  if (m.idVerifyStatus === 'VERIFIED') {
    return <span className="pill ok" title={`MĐĐĐ ${m.mdid || ''} · ref ${m.idVerifyRef || ''} · ${m.idVerifyAt || ''}`}>🇻🇳 VNeID mức 2 ✓{detailed ? ` · ${m.mdid || ''}` : ''}</span>;
  }
  if (m.idVerifyStatus === 'FAILED') return <span className="pill bad" title={`Lần thử gần nhất: ${m.idVerifyAt || ''}`}>🇻🇳 Xác thực thất bại</span>;
  return <span className="pill gray">🇻🇳 Chưa xác thực định danh</span>;
}

// Modal xác thực định danh điện tử qua bộ kết nối VNeID/eKYC
function IdentityModal({ m, onClose, onDone }) {
  const [form, setForm] = useState({ cccd: m.cccd || '', fullName: m.fullName || '', dob: m.dob || '' });
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState(null);
  const toast = useToast();
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));
  const submit = async () => {
    setBusy(true); setResult(null);
    try {
      const r = await api.post(`/members/${m.id}/verify-identity`, form);
      toast(`✅ Định danh đã xác thực (mức ${r.result.level}) — đã ghi vết lên ledger`, 'ok');
      onDone();
    } catch (e) {
      setResult(e.data || { error: e.message });
      toast(e.message, 'err');
    } finally { setBusy(false); }
  };
  return (
    <Modal title={`Xác thực định danh điện tử — ${m.fullName}`} onClose={onClose}>
      <div className="note blue" style={{ marginBottom: 12, fontSize: 12.5 }}>
        Hệ thống gửi số CCCD tới <b>bộ kết nối định danh</b> (VNeID mức 2 / eKYC) và chỉ ghi <b>vết kết quả</b> lên blockchain —
        không lưu dữ liệu cá nhân lên sổ cái. Hiện dùng <b>provider mô phỏng</b>:
        CCCD đuôi <b>0</b> → không tìm thấy; đuôi <b>9</b> → lệch thông tin; còn lại → xác thực đạt.
        Khi Đoàn trường ký hợp đồng dịch vụ, chỉ cần cấu hình <code>VNEID_PROVIDER=http</code>.
      </div>
      <div className="form-row">
        <div className="field"><label>Số CCCD (12 số)</label>
          <input value={form.cccd} onChange={set('cccd')} placeholder="vd: 205123456789" maxLength={12} /></div>
        <div className="field"><label>Họ tên (so khớp)</label><input value={form.fullName} onChange={set('fullName')} /></div>
        <div className="field"><label>Ngày sinh (so khớp)</label><input type="date" value={form.dob} onChange={set('dob')} /></div>
      </div>
      {result && <div className="note" style={{ marginBottom: 10 }}>{result.error}</div>}
      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
        <button className="btn" onClick={onClose}>Hủy</button>
        <button className="btn primary" disabled={busy || form.cccd.length !== 12} onClick={submit}>
          {busy ? <span className="spin" /> : '🛡️'} Gửi xác thực &amp; ghi ledger
        </button>
      </div>
    </Modal>
  );
}

const fnLabel = (t) => ({ CreateMemberProfile: 'Tạo hồ sơ', IdentityVerified: 'Xác thực định danh', UpdateMemberProfile: 'Cập nhật hồ sơ', RecordActivity: 'Ghi hoạt động', TransferRequest: 'Lập chuyển sinh hoạt', TransferAccept: 'Tiếp nhận chuyển', TransferReject: 'Từ chối chuyển', UnlockMember: 'Mở khóa hồ sơ' }[t] || t);
const typeLabel = (t) => (ACTIVITY_TYPES.find(([k]) => k === t) || [, t])[1];
const actIcon = (t) => ({ HOAT_DONG: '🤝', DANH_GIA: '📝', KHEN_THUONG: '🏆', KY_LUAT: '⚠️' }[t] || '🏅');

function EditModal({ m, onClose, onDone }) {
    const [form, setForm] = useState(Object.fromEntries(['fullName', 'dob', 'gender', 'className', 'phone', 'email', 'homeAddress', 'joinPlace', 'joinDate'].map((k) => [k, m[k] || ''])));
  const [busy, setBusy] = useState(false);
  const toast = useToast();
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));
  const submit = async () => {
    setBusy(true);
    try { await api.patch(`/members/${m.id}`, form); toast('Đã cập nhật + ghi hash mới lên ledger', 'ok'); onDone(); }
    catch (e) { toast(e.message, 'err'); } finally { setBusy(false); }
  };
  return (
    <Modal title={`Cập nhật hồ sơ ${m.id} (UpdateMemberProfile)`} onClose={onClose}>
      <div className="form-row">
        <div className="field"><label>Họ tên</label><input value={form.fullName} onChange={set('fullName')} /></div>
        <div className="field"><label>Lớp</label><input value={form.className} onChange={set('className')} /></div>
        <div className="field"><label>Điện thoại</label><input value={form.phone} onChange={set('phone')} /></div>
        <div className="field"><label>Email</label><input value={form.email} onChange={set('email')} /></div>
        <div className="field" style={{ gridColumn: '1/-1' }}><label>Địa chỉ</label><input value={form.homeAddress} onChange={set('homeAddress')} /></div>
      </div>
      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
        <button className="btn" onClick={onClose}>Hủy</button>
        <button className="btn primary" disabled={busy} onClick={submit}>{busy ? <span className="spin" /> : '💾'} Lưu &amp; ghi ledger</button>
      </div>
    </Modal>
  );
}

function ActivityModal({ m, onClose, onDone }) {
  const [form, setForm] = useState({ type: 'HOAT_DONG', title: '', detail: '', activityDate: new Date().toISOString().slice(0, 10) });
  const [busy, setBusy] = useState(false);
  const toast = useToast();
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));
  const submit = async () => {
    setBusy(true);
    try { await api.post(`/members/${m.id}/activities`, form); toast('Đã ghi hoạt động lên ledger (RecordActivity)', 'ok'); onDone(); }
    catch (e) { toast(e.message, 'err'); } finally { setBusy(false); }
  };
  return (
    <Modal title={`Ghi nhận hoạt động — ${m.fullName}`} onClose={onClose}>
      <div className="field"><label>Loại</label>
        <select value={form.type} onChange={set('type')}>{ACTIVITY_TYPES.map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></div>
      <div className="field"><label>Tiêu đề *</label><input value={form.title} onChange={set('title')} placeholder="vd: Tham gia Mùa hè xanh 2026" /></div>
      <div className="field"><label>Mô tả</label><textarea rows={3} value={form.detail} onChange={set('detail')} /></div>
      <div className="field"><label>Ngày</label><input type="date" value={form.activityDate} onChange={set('activityDate')} /></div>
      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
        <button className="btn" onClick={onClose}>Hủy</button>
        <button className="btn primary" disabled={busy || !form.title} onClick={submit}>{busy ? <span className="spin" /> : '⛓️'} Ghi lên ledger</button>
      </div>
    </Modal>
  );
}

function TransferModal({ m, onClose, onDone }) {
  const [units, setUnits] = useState([]);
  const [form, setForm] = useState({ toUnit: '', reason: '' });
  const [busy, setBusy] = useState(false);
  const toast = useToast();
  useEffect(() => {
    // Lấy danh sách chi đoàn khác từ /admin/peers? — dùng /stats (byUnit) đơn giản hơn
    api.get('/stats').then((s) => setUnits(s.byUnit.filter((u) => u.id !== m.unitId))).catch(() => {});
  }, [m.unitId]);
  const submit = async () => {
    setBusy(true);
    try {
      const r = await api.post('/transfers', { memberId: m.id, toUnit: form.toUnit, reason: form.reason });
      if (r.deferred) toast('⏳ Peer offline — yêu cầu đã lưu chờ, gửi lại khi peer hoạt động', 'info');
      else toast(`Đã lập TransferRequest ${r.transfer.id} — chờ đơn vị tiếp nhận duyệt`, 'ok');
      onDone();
    } catch (e) { toast(e.message, 'err'); } finally { setBusy(false); }
  };
  return (
    <Modal title={`Chuyển sinh hoạt — ${m.fullName}`} onClose={onClose}>
      <div className="note blue" style={{ marginBottom: 12 }}>
        Quy trình 2 bước: <b>TransferRequest</b> (đơn vị chuyển đi lập) → <b>TransferAccept/Reject</b> (đơn vị tiếp nhận hoặc cấp trên duyệt).
      </div>
      <div className="field"><label>Chi đoàn tiếp nhận *</label>
        <select value={form.toUnit} onChange={(e) => setForm((f) => ({ ...f, toUnit: e.target.value }))}>
          <option value="">— chọn chi đoàn —</option>
          {units.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
        </select></div>
      <div className="field"><label>Lí do chuyển</label><textarea rows={3} value={form.reason} onChange={(e) => setForm((f) => ({ ...f, reason: e.target.value }))} placeholder="vd: Chuyển ngành học, chuyển nơi học tập…" /></div>
      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
        <button className="btn" onClick={onClose}>Hủy</button>
        <button className="btn gold" disabled={busy || !form.toUnit} onClick={submit}>{busy ? <span className="spin" /> : '🔁'} Lập yêu cầu</button>
      </div>
    </Modal>
  );
}
