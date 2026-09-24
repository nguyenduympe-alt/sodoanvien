import React, { useState, useEffect } from 'react';
import { api, setSession, ROLE_LABEL } from '../api.js';
import { DoanEmblem } from '../components.jsx';

const DEMO = [
  ['quantri', 'Quản trị hệ thống'],
  ['doantruong', 'Cán bộ Đoàn trường'],
  ['lienchicntt', 'Liên chi đoàn CNTT&TT'],
  ['chidoan01', 'Bí thư Chi đoàn CNTT K45A'],
  ['doanvien01', 'Đoàn viên (tự xem hồ sơ)'],
];

export default function Login({ onLogin }) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e?.preventDefault();
    setBusy(true); setErr('');
    try {
      const { token, user } = await api.post('/auth/login', { username, password });
      setSession(token, user);
      onLogin(user);
      window.location.hash = '#/';
    } catch (ex) {
      setErr(ex.message);
    } finally { setBusy(false); }
  };

  // Nền trang đăng nhập phủ kín cả vùng lộ ra khi cuộn quá đáy / thanh địa chỉ co lại (không còn dải trắng sữa)
  useEffect(() => {
    document.body.classList.add('login-page');
    const meta = document.querySelector('meta[name="theme-color"]');
    const prev = meta && meta.getAttribute('content');
    // đọc màu sau khi App áp theme (effect của cha chạy sau effect của con)
    const raf = requestAnimationFrame(() => {
      const c1 = getComputedStyle(document.body).getPropertyValue('--card-c1').trim();
      if (meta && c1) meta.setAttribute('content', c1);
    });
    return () => { cancelAnimationFrame(raf); document.body.classList.remove('login-page'); if (meta && prev) meta.setAttribute('content', prev); };
  }, []);

  const quick = (u) => { setUsername(u); setPassword('123456'); setErr(''); setTimeout(() => submit(), 30); };

  return (
    <div className="login-wrap">
      <div className="login-card">
        <div className="login-hero">
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <DoanEmblem size={56} />
            <span style={{ fontSize: 30 }}>⛓️</span>
          </div>
          <h1>Hệ thống định danh &amp;<br />quản lí sổ Đoàn viên</h1>
          <p>Trên nền tảng chuỗi khối cấp phép <b>Hyperledger Fabric</b> — nguyên mẫu luận văn thạc sĩ, ĐH Cần Thơ.</p>
          <div className="feat"><span>🔒</span><span>Hồ sơ lưu off-chain, mã băm SHA-256 ghi vết lên ledger — chống sửa đổi trái phép.</span></div>
          <div className="feat"><span>🔁</span><span>Chuyển sinh hoạt 2 bước: TransferRequest → TransferAccept/Reject.</span></div>
          <div className="feat"><span>🛡️</span><span>Đối soát on-chain/off-chain, sao lưu có kiểm chứng DailyBackupHash.</span></div>
          <div className="feat"><span>📱</span><span>Giao diện tương thích máy tính và điện thoại.</span></div>
        </div>
        <div className="login-form">
          <h2 style={{ margin: '0 0 4px' }}>Đăng nhập</h2>
          <p style={{ margin: '0 0 14px', color: 'var(--muted)', fontSize: 13 }}>Dùng tài khoản ứng dụng (không cần chứng thư Fabric).</p>
          <form onSubmit={submit}>
            <div className="field">
              <label>Tên đăng nhập</label>
              <input value={username} onChange={(e) => setUsername(e.target.value)} placeholder="vd: chidoan01" autoFocus />
            </div>
            <div className="field">
              <label>Mật khẩu</label>
              <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••" />
            </div>
            {err && <div className="note" style={{ marginBottom: 10 }}>{err}</div>}
            <button className="btn primary" style={{ width: '100%', justifyContent: 'center', padding: 11 }} disabled={busy || !username || !password}>
              {busy ? <span className="spin" /> : '🔑'} Đăng nhập
            </button>
          </form>
          <div style={{ marginTop: 18, fontSize: 12.5, color: 'var(--muted)' }}>Tài khoản demo (mật khẩu chung: <b>123456</b>):</div>
          <div className="quick">
            {DEMO.map(([u, label]) => (
              <button key={u} onClick={() => quick(u)}>
                <b>{u}</b> — {label}
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
