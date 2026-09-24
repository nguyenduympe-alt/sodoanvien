import React, { useEffect, useState, useCallback } from 'react';
import { api, STATUS_LABEL, ACTIVITY_TYPES } from '../api.js';
import { StatusPill, Modal, Empty, Loading, useToast, Hash } from '../components.jsx';

export default function Members({ me }) {
  const [data, setData] = useState(null);
  const [units, setUnits] = useState([]);
  const [q, setQ] = useState('');
  const [unit, setUnit] = useState('');
  const [status, setStatus] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const toast = useToast();

  const load = useCallback(() => {
    const p = new URLSearchParams();
    if (q) p.set('query', q);
    if (unit) p.set('unitId', unit);
    if (status) p.set('status', status);
    api.get(`/members?${p}`).then(setData).catch((e) => toast(e.message, 'err'));
  }, [q, unit, status]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    if (me.role !== 'DOAN_VIEN') api.get('/ledger/orgs').catch(() => {});
    api.get('/stats').then((s) => setUnits(s.byUnit)).catch(() => {});
  }, []);

  return (
    <>
      <div className="page-head">
        <div><h2>Danh sách đoàn viên</h2><p>Mã định danh nội bộ (DV-…), không dùng CCCD làm khóa — mục 8.6 đề cương</p></div>
        {(me.role === 'CHI_DOAN' || me.role === 'DOAN_TRUONG') && (
          <div style={{ display: 'flex', gap: 8 }}>
            <a className="btn" href="#/intake">📸 Nhập từ ảnh VNeID</a>
            <button className="btn primary" onClick={() => setShowCreate(true)}>＋ Kết nạp</button>
          </div>
        )}
      </div>

      <div className="card" style={{ padding: 12, marginBottom: 14 }}>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <input style={{ flex: 2, minWidth: 180, border: '1px solid #d1d5db', borderRadius: 10, padding: '8px 12px' }}
                 placeholder="🔍 Tìm theo họ tên, mã đoàn viên, mã hồ sơ…" value={q} onChange={(e) => setQ(e.target.value)} />
          {me.role !== 'DOAN_VIEN' &&
            <select style={{ border: '1px solid #d1d5db', borderRadius: 10, padding: '8px 12px' }} value={unit} onChange={(e) => setUnit(e.target.value)}>
              <option value="">Tất cả đơn vị</option>
              {units.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
            </select>}
          <select style={{ border: '1px solid #d1d5db', borderRadius: 10, padding: '8px 12px' }} value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="">Mọi trạng thái</option>
            {Object.entries(STATUS_LABEL).slice(0, 3).map(([k, [v]]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </div>
      </div>

      {!data ? <Loading /> : data.members.length === 0 ? <Empty icon="👥" text="Không có đoàn viên nào khớp bộ lọc" /> : (
        <div className="card">
          <div className="table-wrap">
            <table className="tbl">
              <thead>
                <tr><th>Mã hồ sơ</th><th>Họ tên</th><th>Đơn vị</th><th>Ngày kết nạp</th><th>Hash hồ sơ</th><th>Trạng thái</th></tr>
              </thead>
              <tbody>
                {data.members.map((m) => (
                  <tr key={m.id} className="click" onClick={() => { window.location.hash = `#/members/${m.id}`; }}>
                    <td><code style={{ fontSize: 12 }}>{m.id}</code><div style={{ fontSize: 11, color: 'var(--muted)' }}>{m.memberCode}</div></td>
                    <td><b>{m.fullName}</b><div style={{ fontSize: 11.5, color: 'var(--muted)' }}>{m.className}</div></td>
                    <td>{m.unitName || m.unitId}</td>
                    <td>{m.joinDate || '—'}</td>
                    <td><Hash value={m.profileHash} /></td>
                    <td><StatusPill status={m.status} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {showCreate && <CreateModal units={units} me={me} onClose={() => setShowCreate(false)} onDone={() => { setShowCreate(false); load(); }} />}
    </>
  );
}

function CreateModal({ units, me, onClose, onDone }) {
  const [form, setForm] = useState({
    memberCode: '', fullName: '', dob: '', gender: 'Nam', className: '',
    unitId: me.unitId || (units[0]?.id ?? ''), joinDate: new Date().toISOString().slice(0, 10),
    joinPlace: 'Đoàn trường Đại học Cần Thơ', phone: '', email: '', homeAddress: '', cccd: '',
  });
  const [busy, setBusy] = useState(false);
  const toast = useToast();
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const submit = async () => {
    setBusy(true);
    try {
      const r = await api.post('/members', form);
      toast(`Đã tạo hồ sơ ${r.member.id} · hash ghi lên ledger (block ${r.tx.blockNumber})`, 'ok');
      onDone();
    } catch (e) { toast(e.message, 'err'); } finally { setBusy(false); }
  };

  return (
    <Modal title="Kết nạp đoàn viên mới (CreateMemberProfile)" onClose={onClose} wide>
      <div className="form-row">
        <div className="field"><label>Mã đoàn viên *</label><input value={form.memberCode} onChange={set('memberCode')} placeholder="DV20260123" /></div>
        <div className="field"><label>Họ và tên *</label><input value={form.fullName} onChange={set('fullName')} /></div>
        <div className="field"><label>Ngày sinh</label><input type="date" value={form.dob} onChange={set('dob')} /></div>
        <div className="field"><label>Giới tính</label>
          <select value={form.gender} onChange={set('gender')}><option>Nam</option><option>Nữ</option></select></div>
        <div className="field"><label>Lớp</label><input value={form.className} onChange={set('className')} placeholder="DI24A1" /></div>
        <div className="field"><label>Chi đoàn</label>
          {me.role === 'CHI_DOAN'
            ? <input value={me.unitId} disabled />
            : <select value={form.unitId} onChange={set('unitId')}>{units.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}</select>}
        </div>
        <div className="field"><label>Ngày kết nạp</label><input type="date" value={form.joinDate} onChange={set('joinDate')} /></div>
        <div className="field"><label>Nơi kết nạp</label><input value={form.joinPlace} onChange={set('joinPlace')} /></div>
        <div className="field"><label>Số điện thoại</label><input value={form.phone} onChange={set('phone')} /></div>
        <div className="field"><label>CCCD (chỉ lưu off-chain)</label><input value={form.cccd} onChange={set('cccd')} placeholder="Không bao giờ lên blockchain" /></div>
        <div className="field" style={{ gridColumn: '1/-1' }}><label>Địa chỉ</label><input value={form.homeAddress} onChange={set('homeAddress')} /></div>
      </div>
      <div className="note blue" style={{ marginBottom: 12 }}>
        Khi tạo hồ sơ: dữ liệu chi tiết lưu vào CSDL off-chain, mã băm SHA-256 của hồ sơ được ghi lên ledger qua giao dịch
        <b> CreateMemberProfile</b>.
      </div>
      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
        <button className="btn" onClick={onClose}>Hủy</button>
        <button className="btn primary" disabled={busy || !form.memberCode || !form.fullName} onClick={submit}>
          {busy ? <span className="spin" /> : '⛓️'} Tạo hồ sơ &amp; ghi ledger
        </button>
      </div>
    </Modal>
  );
}
