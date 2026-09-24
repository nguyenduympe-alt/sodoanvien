import React, { useEffect, useState, useCallback } from 'react';
import { api, fmtTime, short, ROLE_LABEL } from '../api.js';
import { StatusPill, Modal, Empty, Loading, useToast, Hash } from '../components.jsx';

const TABS = [['reconcile', '🔍 Đối soát'], ['backup', '💾 Sao lưu & Phục hồi'], ['peers', '📡 Peer mạng'], ['users', '👤 Tài khoản'], ['system', '⚙️ Hệ thống']];

export default function Admin({ me }) {
  const [tab, setTab] = useState('reconcile');
  return (
    <>
      <div className="page-head">
        <div><h2>Quản trị hệ thống</h2><p>Đối soát on-chain/off-chain · sao lưu có kiểm chứng · vận hành mạng Fabric mô phỏng</p></div>
      </div>
      <div className="tabs" style={{ marginBottom: 16 }}>
        {TABS.map(([k, v]) => <button key={k} className={tab === k ? 'active' : ''} onClick={() => setTab(k)}>{v}</button>)}
      </div>
      {tab === 'reconcile' && <ReconcileTab />}
      {tab === 'backup' && <BackupTab />}
      {tab === 'peers' && <PeersTab />}
      {tab === 'users' && <UsersTab />}
      {tab === 'system' && <SystemTab />}
    </>
  );
}

/* ================= Đối soát + cảnh báo + demo tamper ================= */
function ReconcileTab() {
  const [report, setReport] = useState(null);
  const [alerts, setAlerts] = useState(null);
  const [busy, setBusy] = useState(false);
  const [members, setMembers] = useState([]);
  const toast = useToast();

  const loadAlerts = useCallback(() => { api.get('/admin/alerts').then((d) => setAlerts(d.alerts)).catch(() => {}); }, []);
  useEffect(() => {
    loadAlerts();
    api.get('/members').then((d) => setMembers(d.members)).catch(() => {});
  }, [loadAlerts]);

  const run = async () => {
    setBusy(true);
    try {
      const r = await api.post('/admin/reconcile');
      setReport(r);
      toast(`Đối soát xong: ${r.matched}/${r.checked} hồ sơ khớp hash`, r.anomalies.length ? 'err' : 'ok');
      loadAlerts();
    } catch (e) { toast(e.message, 'err'); } finally { setBusy(false); }
  };
  const tamper = async (m) => {
    try {
      await api.post(`/admin/dev/tamper/${m.id}`, { field: 'phone', value: '0900000000 (sửa trái phép)' });
      toast('Đã giả lập sửa trái phép off-chain DB (không ghi ledger). Bấm "Chạy đối soát" để phát hiện.', 'info');
    } catch (e) { toast(e.message, 'err'); }
  };
  const resolve = async (id) => { await api.post(`/admin/alerts/${id}/resolve`); loadAlerts(); };

  return (
    <div className="grid cols-2">
      <div className="card">
        <div className="card-h"><b>Đối soát on-chain / off-chain</b>
          <button className="btn primary sm" disabled={busy} onClick={run}>{busy ? <span className="spin" /> : '▶'} Chạy đối soát</button>
        </div>
        <div className="card-b">
          <div className="note blue" style={{ marginBottom: 12 }}>
            Hệ thống tính lại hash SHA-256 (JSON canonical) của từng hồ sơ off-chain rồi so với hash trên ledger
            (đề cương mục 8.9). Lệch hash → hồ sơ <b>khóa tự động</b> + phát cảnh báo + ghi sự kiện ReportAnomaly.
          </div>
          {!report ? <Empty icon="🔍" text="Chưa chạy đối soát trong phiên này" /> : (
            <>
              <div className="grid cols-3" style={{ marginBottom: 10 }}>
                <MiniStat label="Đã kiểm tra" v={report.checked} bg="#e0e7ff" />
                <MiniStat label="Khớp" v={report.matched} bg="#dcfce7" />
                <MiniStat label="Lệch" v={report.anomalies.length} bg="#fee2e2" />
              </div>
              {report.anomalies.map((a) => (
                <div key={a.memberId} className="note" style={{ marginBottom: 6 }}>
                  <b>{a.code}</b> — {a.reason}
                </div>
              ))}
            </>
          )}
          <div style={{ marginTop: 14, borderTop: '1px dashed var(--line)', paddingTop: 12 }}>
            <b style={{ fontSize: 13 }}>🧪 Công cụ demo (kịch bản 6 — sửa trái phép):</b>
            <p style={{ fontSize: 12.5, color: 'var(--muted)', margin: '4px 0 8px' }}>
              Ghi thẳng vào off-chain DB KHÔNG tính lại hash — mô phỏng kẻ xấu can thiệp CSDL.
            </p>
            <select id="tamper-target" style={{ width: '100%', border: '1px solid #d1d5db', borderRadius: 10, padding: '8px 10px', marginBottom: 8 }}>
              {members.map((m) => <option key={m.id} value={m.id}>{m.fullName} ({m.memberCode})</option>)}
            </select>
            <button className="btn danger sm" onClick={() => tamper({ id: document.getElementById('tamper-target').value })}>⚡ Giả lập can thiệp dữ liệu</button>
          </div>
        </div>
      </div>

      <div className="card">
        <div className="card-h"><b>Cảnh báo</b><span className="pill bad">{(alerts || []).filter((a) => a.status === 'OPEN').length} đang mở</span></div>
        <div className="card-b">
          {!alerts ? <Loading /> : alerts.length === 0 ? <Empty icon="🔔" text="Không có cảnh báo — hệ thống ổn định" /> : alerts.map((a) => (
            <div key={a.id} className="alert-item">
              <span style={{ fontSize: 17 }}>{a.severity === 'CRITICAL' ? '🚨' : a.type === 'SYNC' ? '⚠️' : '🔔'}</span>
              <div style={{ flex: 1, fontSize: 13 }}>
                <b>{a.type}</b> {a.fullName ? `· ${a.fullName} (${a.memberId})` : ''} <StatusPill status={a.status} />
                <div style={{ color: 'var(--muted)', fontSize: 12.5 }}>{a.message}</div>
                <small style={{ color: 'var(--muted)' }}>{fmtTime(a.createdAt)}</small>
              </div>
              {a.status === 'OPEN' && <button className="btn sm" onClick={() => resolve(a.id)}>Xử lí xong</button>}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function MiniStat({ label, v, bg }) {
  return (
    <div className="card stat" style={{ padding: 10 }}>
      <div className="ic" style={{ background: bg, width: 36, height: 36 }}>{v}</div>
      <div><span>{label}</span></div>
    </div>
  );
}

/* ================= Snapshot / phục hồi ================= */
function BackupTab() {
  const [items, setItems] = useState(null);
  const [busy, setBusy] = useState(false);
  const toast = useToast();

  const load = useCallback(() => { api.get('/admin/backups').then((d) => setItems(d.backups)).catch(() => {}); }, []);
  useEffect(() => { load(); }, [load]);

  const create = async () => {
    setBusy(true);
    try {
      const r = await api.post('/admin/backup');
      toast(`Đã tạo ${r.snapshotId} — DailyBackupHash ghi lên ledger (block ${r.tx.blockNumber})`, 'ok');
      load();
    } catch (e) { toast(e.message, 'err'); } finally { setBusy(false); }
  };
  const restore = async (b) => {
    if (!confirm(`Phục hồi toàn bộ dữ liệu từ ${b.snapshotId}?\nChỉ snapshot có hash khớp ledger mới được dùng.`)) return;
    try {
      const r = await api.post('/admin/restore', { snapshotId: b.snapshotId });
      toast(`✅ Phục hồi xong · ConfirmRecovery đã ghi lên ledger · đối soát: ${r.reconcile.matched}/${r.reconcile.checked} khớp`, 'ok');
    } catch (e) { toast(e.message, 'err'); }
  };

  return (
    <div className="card">
      <div className="card-h">
        <b>Snapshot &amp; phục hồi có kiểm chứng (DailyBackupHash · ConfirmRecovery)</b>
        <button className="btn primary sm" disabled={busy} onClick={create}>{busy ? <span className="spin" /> : '💾'} Tạo snapshot + ghi hash</button>
      </div>
      <div className="card-b">
        <div className="note blue" style={{ marginBottom: 12 }}>
          Hệ thống <b>không mặc định tin bản sao lưu</b>: snapshot phải có hash khớp với giá trị đã ghi trên ledger
          mới được dùng để phục hồi (đề cương mục 8.9).
        </div>
        {!items ? <Loading /> : items.length === 0 ? <Empty icon="💾" text="Chưa có snapshot nào" /> : (
          <div className="table-wrap">
            <table className="tbl">
              <thead><tr><th>Snapshot</th><th>Thời điểm</th><th>Hash (off-chain)</th><th>Trạng thái ledger</th><th></th></tr></thead>
              <tbody>
                {items.map((b) => (
                  <tr key={b.snapshotId}>
                    <td><code style={{ fontSize: 12 }}>{b.snapshotId}</code><div style={{ fontSize: 11, color: 'var(--muted)' }}>{Object.entries(b.stats || {}).map(([k, v]) => `${k}:${v}`).join(' · ')}</div></td>
                    <td>{fmtTime(b.createdAt)}</td>
                    <td><Hash value={b.snapshotHash} n={10} /></td>
                    <td>{b.ledger.recorded
                      ? <span className={`pill ${b.ledger.hashMatch ? 'ok' : 'bad'}`}>{b.ledger.hashMatch ? '✓ Khớp ledger' : '✗ Lệch hash!'}</span>
                      : <span className="pill bad">Chưa ghi ledger</span>}<div style={{ fontSize: 11, color: 'var(--muted)' }}>{b.ledger.status}</div></td>
                    <td>{b.ledger.recorded && b.ledger.hashMatch && <button className="btn sm" onClick={() => restore(b)}>♻️ Phục hồi</button>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

/* ================= Peer ================= */
function PeersTab() {
  const [orgs, setOrgs] = useState(null);
  const toast = useToast();
  const load = useCallback(() => { api.get('/admin/peers').then((d) => setOrgs(d.orgs)).catch(() => {}); }, []);
  useEffect(() => { load(); }, [load]);
  const toggle = async (o) => {
    try {
      await api.post('/admin/peers', { mspId: o.mspId, online: !o.peerOnline });
      toast(`Peer ${o.peer} ${o.peerOnline ? 'OFFLINE' : 'ONLINE'} — thử lập giao dịch để xem endorsement`, 'info');
      load();
    } catch (e) { toast(e.message, 'err'); }
  };
  if (!orgs) return <Loading />;
  return (
    <div className="card">
      <div className="card-h"><b>Peer các tổ chức trong mạng Fabric (mô phỏng)</b></div>
      <div className="card-b">
        <div className="note blue" style={{ marginBottom: 12 }}>
          Tắt peer của một tổ chức rồi lập yêu cầu chuyển sinh hoạt → giao dịch không đủ chữ ký endorsement sẽ bị hoãn
          và có thể <b>gửi lại</b> khi peer hoạt động trở lại (kịch bản 7 của đề cương).
        </div>
        {orgs.map((o) => (
          <div key={o.mspId} className="alert-item">
            <span className={`dot ${o.peerOnline ? 'on' : 'off'}`} style={{ marginTop: 5 }} />
            <div style={{ flex: 1 }}>
              <b style={{ fontSize: 13.5 }}>{o.name}</b>
              <div style={{ fontSize: 12, color: 'var(--muted)' }}>{o.mspId} · {o.peer}</div>
            </div>
            <span className={`pill ${o.peerOnline ? 'ok' : 'gray'}`}>{o.peerOnline ? 'Online' : 'Offline'}</span>
            <button className="btn sm" onClick={() => toggle(o)}>{o.peerOnline ? 'Tắt peer' : 'Bật peer'}</button>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ================= Tài khoản ================= */
function UsersTab() {
  const [users, setUsers] = useState(null);
  const [show, setShow] = useState(false);
  const toast = useToast();
  const load = useCallback(() => { api.get('/admin/users').then((d) => setUsers(d.users)).catch(() => {}); }, []);
  useEffect(() => { load(); }, [load]);

  const toggleActive = async (u) => {
    try { await api.patch(`/admin/users/${u.id}`, { active: !u.active }); toast(`${u.username} đã ${u.active ? 'bị khóa' : 'được mở'}`, 'ok'); load(); }
    catch (e) { toast(e.message, 'err'); }
  };
  const resetPw = async (u) => {
    const pw = prompt(`Mật khẩu mới cho ${u.username}:`, '123456');
    if (!pw) return;
    try { await api.patch(`/admin/users/${u.id}`, { password: pw }); toast('Đã đặt lại mật khẩu', 'ok'); } catch (e) { toast(e.message, 'err'); }
  };

  if (!users) return <Loading />;
  return (
    <div className="card">
      <div className="card-h"><b>Tài khoản người dùng</b><button className="btn primary sm" onClick={() => setShow(true)}>＋ Tạo tài khoản</button></div>
      <div className="table-wrap">
        <table className="tbl">
          <thead><tr><th>Tài khoản</th><th>Vai trò</th><th>Đơn vị</th><th>Trạng thái</th><th></th></tr></thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.id}>
                <td><b>{u.username}</b><div style={{ fontSize: 11.5, color: 'var(--muted)' }}>{u.displayName}</div></td>
                <td><span className="pill info">{ROLE_LABEL[u.role]}</span></td>
                <td>{u.unitName || u.unitId || '—'}</td>
                <td>{u.active ? <span className="pill ok">Hoạt động</span> : <span className="pill bad">Đã khóa</span>}</td>
                <td style={{ whiteSpace: 'nowrap' }}>
                  <button className="btn sm" onClick={() => resetPw(u)}>Đổi MK</button>{' '}
                  {u.username !== 'quantri' && <button className="btn sm danger" onClick={() => toggleActive(u)}>{u.active ? 'Khóa' : 'Mở'}</button>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {show && <NewUserModal onClose={() => setShow(false)} onDone={() => { setShow(false); load(); }} />}
    </div>
  );
}

function NewUserModal({ onClose, onDone }) {
  const [f, setF] = useState({ username: '', displayName: '', role: 'CHI_DOAN', unitId: '', password: '123456' });
  const [busy, setBusy] = useState(false);
  const toast = useToast();
  const submit = async () => {
    setBusy(true);
    try { await api.post('/admin/users', f); toast('Đã tạo tài khoản', 'ok'); onDone(); }
    catch (e) { toast(e.message, 'err'); } finally { setBusy(false); }
  };
  const set = (k) => (e) => setF((s) => ({ ...s, [k]: e.target.value }));
  return (
    <Modal title="Tạo tài khoản" onClose={onClose}>
      <div className="form-row">
        <div className="field"><label>Tên đăng nhập *</label><input value={f.username} onChange={set('username')} /></div>
        <div className="field"><label>Họ tên hiển thị *</label><input value={f.displayName} onChange={set('displayName')} /></div>
        <div className="field"><label>Vai trò</label>
          <select value={f.role} onChange={set('role')}>
            {Object.entries(ROLE_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select></div>
        <div className="field"><label>Đơn vị (nếu có)</label><input value={f.unitId} onChange={set('unitId')} placeholder="CD-01 / LC-01" /></div>
        <div className="field"><label>Mật khẩu</label><input value={f.password} onChange={set('password')} /></div>
      </div>
      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
        <button className="btn" onClick={onClose}>Hủy</button>
        <button className="btn primary" disabled={busy || !f.username || !f.displayName} onClick={submit}>Tạo</button>
      </div>
    </Modal>
  );
}

/* ================= Hệ thống ================= */
function SystemTab() {
  const [ov, setOv] = useState(null);
  const toast = useToast();
  useEffect(() => { api.get('/admin/overview').then(setOv).catch(() => {}); }, []);
  return (
    <div className="grid cols-2">
      <div className="card">
        <div className="card-h"><b>Thông số hệ thống</b></div>
        <div className="card-b">
          {!ov ? <Loading /> : (
            <dl className="kv">
              <dt>Chế độ ledger</dt><dd><span className="pill info">{ov.counts ? '' : ''}</span> {ov.orgs?.length ? 'Simulator/Fabric Gateway' : ''} — xem biến môi trường LEDGER_MODE</dd>
              <dt>Hồ sơ đoàn viên</dt><dd>{ov.counts?.members}</dd>
              <dt>Tài khoản</dt><dd>{ov.counts?.users}</dd>
              <dt>Hoạt động ghi nhận</dt><dd>{ov.counts?.activities}</dd>
              <dt>Chờ chuyển sinh hoạt</dt><dd>{ov.counts?.transfersPending}</dd>
              <dt>Cảnh báo đang mở</dt><dd>{ov.counts?.alertsOpen}</dd>
              <dt>Phục hồi gần nhất</dt><dd>{ov.lastRecovery ? `${ov.lastRecovery.recoveryId} · ${fmtTime(ov.lastRecovery.at)}` : '—'}</dd>
            </dl>
          )}
        </div>
      </div>
      <div className="card">
        <div className="card-h"><b>Vận hành</b></div>
        <div className="card-b">
          <p style={{ fontSize: 13, color: 'var(--muted)' }}>
            Nạp lại toàn bộ dữ liệu demo (xóa mọi thay đổi, seed lại 7 đoàn viên + 1 yêu cầu chuyển đang chờ).
          </p>
          <button className="btn danger" onClick={async () => {
            if (!confirm('Nạp lại toàn bộ dữ liệu demo? Mọi thay đổi hiện tại sẽ mất.')) return;
            try { await api.post('/admin/reseed'); toast('Đã nạp lại dữ liệu demo', 'ok'); setOv(null); api.get('/admin/overview').then(setOv); }
            catch (e) { toast(e.message, 'err'); }
          }}>♻️ Nạp lại dữ liệu demo</button>
          <div className="note" style={{ marginTop: 14, fontSize: 12.5 }}>
            Tài khoản demo dùng mật khẩu <b>123456</b> — chỉ dùng cho nguyên mẫu, không dùng production.
          </div>
        </div>
      </div>
    </div>
  );
}
