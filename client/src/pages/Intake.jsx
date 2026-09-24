// ============ NHẬP HỒ SƠ TỪ ẢNH VNeID / CCCD + TỰ TẠO TÀI KHOẢN ============
// Kênh 1: Quét QR định danh mức 2 trên app VNeID (giải mã OFFLINE bằng jsQR trong trình duyệt)
// Kênh 2: AI Vision đọc ảnh chụp (cần AI_API_KEY model vision)
// Kênh 3: Nhập tay
// Kênh nào cũng qua bước cán bộ XÁC NHẬN trước khi tạo hồ sơ + tài khoản (human-in-the-loop)
import React, { useEffect, useRef, useState } from 'react';
import jsQR from 'jsqr';
import { api, ACTIVITY_TYPES } from '../api.js';
import { qrSvg } from '../lib/qr.js';
import { Loading, useToast } from '../components.jsx';

const DEMO_QR = 'SDV1|205123456783|Nguyen Van Tam|2005-05-10|Nam';

export default function Intake({ me }) {
  // ---- trạng thái chung ----
  const [tab, setTab] = useState('qr');
  const [form, setForm] = useState({ fullName: '', dob: '', gender: 'Nam', idNumber: '', className: '', joinDate: new Date().toISOString().slice(0, 10), createAccount: true, username: '' });
  const [source, setSource] = useState(null); // 'vneid_qr' | 'ai_ocr' | 'manual'
  const [units, setUnits] = useState([]);
  const [unitId, setUnitId] = useState(me.unitId || '');
  const [done, setDone] = useState(null);
  const [ai, setAi] = useState(null);
  const toast = useToast();

  useEffect(() => {
    api.get('/stats').then((s) => setUnits(s.byUnit)).catch(() => {});
    api.get('/intake/status').then(setAi).catch(() => {});
  }, []);

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));
  const applyFields = (fields, src) => {
    setForm((f) => ({
      ...f,
      fullName: fields.fullName || fields.hoTen || f.fullName,
      dob: fields.dob || fields.ngaySinh || f.dob,
      gender: ['Nam', 'Nữ', 'NAM', 'NỮ'].includes(fields.gender) ? (fields.gender.toUpperCase() === 'NAM' ? 'Nam' : 'Nữ') : f.gender,
      idNumber: (fields.idNumber || fields.cccd || fields.soCccd || '').replace(/\D/g, '').slice(0, 12) || f.idNumber,
    }));
    setSource(src);
  };

  const submit = async () => {
    if (!form.fullName.trim()) return toast('Chưa có họ tên — hãy quét QR, đọc AI hoặc nhập tay', 'err');
    try {
      const r = await api.post('/intake/enroll', {
        ...form,
        unitId,
        source: source || 'manual',
        memberCode: undefined,
      });
      setDone(r);
      toast(`✅ Đã tạo hồ sơ ${r.member.memberCode}${r.account ? ` + tài khoản ${r.account.username}` : ''}`, 'ok');
    } catch (e) { toast(e.message, 'err'); }
  };

  const reset = () => {
    setDone(null);
    setForm({ fullName: '', dob: '', gender: 'Nam', idNumber: '', className: '', joinDate: new Date().toISOString().slice(0, 10), createAccount: true, username: '' });
    setSource(null);
  };

  return (
    <>
      <div className="page-head">
        <div>
          <h2>📸 Nhập hồ sơ từ ảnh VNeID / CCCD</h2>
          <p>Chụp QR định danh mức 2 trên app VNeID (hoặc ảnh CCCD) → hệ thống đọc dữ liệu → cán bộ xác nhận → tự tạo hồ sơ + tài khoản</p>
        </div>
      </div>

      {done ? (
        <DonePanel done={done} onAnother={reset} />
      ) : (
        <div className="grid" style={{ gridTemplateColumns: 'minmax(0,1.1fr) minmax(300px,1fr)', alignItems: 'start' }}>
          {/* ===== CỘT TRÁI: CHỤP / QUÉT ===== */}
          <div className="card">
            <div className="card-h"><b>Bước 1 · Chụp ảnh / quét mã</b>
              <span className="pill gray">{source === 'vneid_qr' ? 'Nguồn: QR VNeID' : source === 'ai_ocr' ? 'Nguồn: AI đọc ảnh' : source === 'manual' ? 'Nguồn: nhập tay' : 'Chưa có dữ liệu'}</span>
            </div>
            <div className="card-b">
              <div className="tabs" style={{ marginBottom: 12 }}>
                {[['qr', '📷 Quét QR VNeID'], ['ai', '🤖 AI đọc ảnh'], ['manual', '⌨️ Nhập tay']].map(([k, v]) => (
                  <button key={k} className={tab === k ? 'active' : ''} onClick={() => { setTab(k); if (k === 'manual') setSource('manual'); }}>{v}</button>
                ))}
              </div>
              {tab === 'qr' && <QrScanner onDecoded={(fields) => { applyFields(fields, 'vneid_qr'); toast('Đã đọc QR định danh — kiểm tra thông tin bên phải', 'ok'); }} />}
              {tab === 'ai' && (
                <AiReader me={me} ai={ai}
                  onExtracted={(fields) => { applyFields(fields, 'ai_ocr'); toast('AI đã trích xuất — kiểm tra kỹ thông tin bên phải', 'ok'); }} />
              )}
              {tab === 'manual' && (
                <div className="note blue" style={{ fontSize: 12.5 }}>
                  Nhập trực tiếp thông tin ở bảng bên phải rồi bấm "Tạo hồ sơ &amp; tài khoản". Nếu có CCCD, cán bộ có thể chạy
                  <b> 🇻🇳 Xác thực định danh</b> trong trang hồ sơ sau khi tạo.
                </div>
              )}
            </div>
          </div>

          {/* ===== CỘT PHẢI: XEM TRƯỚC + XÁC NHẬN ===== */}
          <div className="card">
            <div className="card-h"><b>Bước 2 · Kiểm tra &amp; xác nhận</b></div>
            <div className="card-b">
              <div className="form-row">
                <div className="field" style={{ gridColumn: '1/-1' }}><label>Họ và tên *</label>
                  <input value={form.fullName} onChange={set('fullName')} placeholder="Nguyễn Văn A" /></div>
                <div className="field"><label>Ngày sinh</label><input type="date" value={form.dob} onChange={set('dob')} /></div>
                <div className="field"><label>Giới tính</label>
                  <select value={form.gender} onChange={set('gender')}><option>Nam</option><option>Nữ</option></select></div>
                <div className="field" style={{ gridColumn: '1/-1' }}><label>Số CCCD (12 số — chỉ lưu off-chain)</label>
                  <input value={form.idNumber} onChange={(e) => setForm((f) => ({ ...f, idNumber: e.target.value.replace(/\D/g, '').slice(0, 12) }))} placeholder="Từ QR/ảnh VNeID" /></div>
                <div className="field"><label>Lớp</label><input value={form.className} onChange={set('className')} placeholder="DI25A1" /></div>
                <div className="field"><label>Ngày kết nạp</label><input type="date" value={form.joinDate} onChange={set('joinDate')} /></div>
                {me.role === 'DOAN_TRUONG' && (
                  <div className="field" style={{ gridColumn: '1/-1' }}><label>Chi đoàn tiếp nhận</label>
                    <select value={unitId} onChange={(e) => setUnitId(e.target.value)}>
                      {units.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
                    </select></div>
                )}
                {me.role === 'CHI_DOAN' && (
                  <div className="field" style={{ gridColumn: '1/-1' }}><label>Chi đoàn</label><input value={me.unitId} disabled /></div>
                )}
              </div>

              <label style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 13.5, margin: '4px 0 12px', cursor: 'pointer' }}>
                <input type="checkbox" checked={form.createAccount} onChange={(e) => setForm((f) => ({ ...f, createAccount: e.target.checked }))} />
                <b>Tự tạo tài khoản đăng nhập cho học sinh</b> (vai trò Đoàn viên)
              </label>
              {form.createAccount && (
                <div className="note blue" style={{ fontSize: 12, marginBottom: 12 }}>
                  Hệ thống tự sinh tên đăng nhập từ họ tên (có dấu bình thường hóa không dấu) + mật khẩu tạm ngẫu nhiên.
                  Mật khẩu hiển thị <b>một lần duy nhất</b> sau khi tạo — hãy ghi lại/bàn giao cho học sinh.
                </div>
              )}

              <div className="note" style={{ fontSize: 12, marginBottom: 12 }}>
                Dữ liệu cá nhân (CCCD…) chỉ lưu ở CSDL off-chain. Ledger chỉ nhận mã băm hồ sơ
                {source === 'vneid_qr' ? ' + vết xác thực định danh (nguồn QR VNeID mức 2).' : '.'}
              </div>
              <button className="btn primary" style={{ width: '100%', justifyContent: 'center', padding: 11 }} disabled={!form.fullName.trim()} onClick={submit}>
                ⛓️ Tạo hồ sơ &amp; tài khoản
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

/* ================= Kênh 1: Quét QR VNeID bằng camera ================= */
function QrScanner({ onDecoded }) {
  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const [camOn, setCamOn] = useState(false);
  const [camErr, setCamErr] = useState('');
  const [shot, setShot] = useState(null); // dataURL ảnh chụp
  const [status, setStatus] = useState('');
  const demo = qrSvg(DEMO_QR, { ecl: 'M' });

  useEffect(() => () => stopCam(), []);

  const startCam = async () => {
    setCamErr('');
    if (!navigator.mediaDevices?.getUserMedia) { setCamErr('Thiết bị/trình duyệt không hỗ trợ camera'); return; }
    if (!window.isSecureContext) { setCamErr('Camera chỉ hoạt động trên HTTPS (hoặc localhost). Hãy truy cập qua tên miền có HTTPS, hoặc dùng "Tải ảnh lên".'); return; }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment', width: { ideal: 1280 }, height: { ideal: 960 } } });
      streamRef.current = stream;
      videoRef.current.srcObject = stream;
      await videoRef.current.play();
      setCamOn(true);
    } catch (e) { setCamErr('Không mở được camera: ' + e.message + ' — có thể trình duyệt chặn quyền, hãy cho phép hoặc dùng "Tải ảnh lên".'); }
  };
  const stopCam = () => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null; setCamOn(false);
  };
  const capture = () => {
    const v = videoRef.current;
    const c = document.createElement('canvas');
    c.width = v.videoWidth; c.height = v.videoHeight;
    c.getContext('2d').drawImage(v, 0, 0);
    const dataUrl = c.toDataURL('image/jpeg', 0.85);
    setShot(dataUrl);
    decode(dataUrl);
  };
  const onFile = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => { setShot(reader.result); decode(reader.result); };
    reader.readAsDataURL(file);
  };
  const decode = (dataUrl) => {
    setStatus('Đang giải mã…');
    const img = new Image();
    img.onload = () => {
      const c = document.createElement('canvas');
      // phóng to nhẹ giúp QR nhỏ trên ảnh xa
      const scale = Math.max(1, 900 / Math.max(img.width, img.height));
      c.width = img.width * scale; c.height = img.height * scale;
      const ctx = c.getContext('2d', { willReadFrequently: true });
      ctx.drawImage(img, 0, 0, c.width, c.height);
      const imageData = ctx.getImageData(0, 0, c.width, c.height);
      const code = jsQR(imageData.data, imageData.width, imageData.height, { inversionAttempts: 'attemptBoth' });
      if (code?.data) {
        const fields = parseQr(code.data);
        if (fields) { setStatus('✅ Đã đọc được QR: ' + code.data.slice(0, 60)); onDecoded(fields); return; }
        setStatus('Đọc được QR nhưng không đúng định dạng định danh: ' + code.data.slice(0, 80));
      } else {
        setStatus('❌ Không tìm thấy QR trong ảnh — chụp gần/bright hơn rồi thử lại.');
      }
    };
    img.src = dataUrl;
  };

  return (
    <div>
      {!camOn ? (
        <>
          <button className="btn primary" style={{ width: '100%', justifyContent: 'center', padding: 10 }} onClick={startCam}>📷 Bật camera để quét QR</button>
          <label className="btn" style={{ width: '100%', justifyContent: 'center', marginTop: 8, cursor: 'pointer' }}>
            🖼️ Tải ảnh chụp QR lên
            <input type="file" accept="image/*" capture="environment" hidden onChange={onFile} />
          </label>
        </>
      ) : (
        <>
          <video ref={videoRef} style={{ width: '100%', borderRadius: 12, background: '#000' }} playsInline muted />
          <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
            <button className="btn primary" style={{ flex: 1, justifyContent: 'center' }} onClick={capture}>📸 Chụp &amp; giải mã</button>
            <button className="btn" onClick={stopCam}>Tắt camera</button>
          </div>
        </>
      )}
      {camErr && <div className="note" style={{ marginTop: 8, fontSize: 12.5 }}>{camErr}</div>}
      {status && <div className="note blue" style={{ marginTop: 8, fontSize: 12.5 }}>{status}</div>}
      {shot && <img src={shot} alt="ảnh chụp" style={{ width: '100%', borderRadius: 10, marginTop: 8, border: '1px solid var(--line)' }} />}

      {/* QR mẫu để thử ngay: mở trên điện thoại khác rồi dùng camera quét */}
      <details style={{ marginTop: 12 }}>
        <summary style={{ fontSize: 12.5, color: 'var(--info)', cursor: 'pointer' }}>🧪 Chưa có app VNeID? Dùng QR mẫu để thử</summary>
        <div style={{ display: 'flex', gap: 12, alignItems: 'center', marginTop: 8 }}>
          <div style={{ background: '#fff', padding: 8, borderRadius: 12, border: '1px solid var(--line)' }}>
            <svg viewBox={`0 0 ${demo.size} ${demo.size}`} width="110" height="110" shapeRendering="crispEdges">
              <rect width={demo.size} height={demo.size} fill="#fff" />
              <path d={demo.d} fill="#111827" />
            </svg>
          </div>
          <div style={{ fontSize: 12, color: 'var(--muted)' }}>
            Hiển thị QR này trên máy/điện thoại khác rồi quét bằng camera. Nội dung mô phỏng payload định danh mức 2:
            <code style={{ display: 'block', marginTop: 4, wordBreak: 'break-all' }}>{DEMO_QR}</code>
          </div>
        </div>
      </details>
    </div>
  );
}

/* Giải mã nội dung QR định danh */
function parseQr(text) {
  const out = {};
  try {
    if (text.trim().startsWith('{')) {
      const j = JSON.parse(text);
      out.fullName = j.fullName || j.hoTen || null;
      out.dob = j.dob || j.ngaySinh || null;
      out.gender = j.gender || j.gioiTinh || null;
      out.idNumber = j.idNumber || j.cccd || j.soCccd || null;
    } else {
      const p = text.split('|');
      if (p[0] === 'SDV1' && p.length >= 5) {
        out.idNumber = p[1]; out.fullName = p[2]; out.dob = p[3]; out.gender = p[4];
      }
    }
  } catch { /* không phải JSON */ }
  if (!out.idNumber) {
    const m = String(text).match(/\b(\d{12})\b/);
    if (m) out.idNumber = m[1];
  }
  return (out.idNumber || out.fullName) ? out : null;
}

/* ================= Kênh 2: AI Vision đọc ảnh ================= */
function AiReader({ me, ai, onExtracted }) {
  const [busy, setBusy] = useState(false);
  const [preview, setPreview] = useState(null);
  const [err, setErr] = useState('');
  const [meta, setMeta] = useState(null);

  const handle = async (dataUrl) => {
    setPreview(dataUrl); setErr(''); setMeta(null); setBusy(true);
    try {
      const small = await downscale(dataUrl, 1600);
      const r = await api.post('/intake/extract', { image: small });
      setMeta(r);
      onExtracted(r.fields || {});
    } catch (e) {
      setErr(e.data?.code === 'AI_NOT_CONFIGURED'
        ? 'AI chưa được cấu hình trên server. Điền AI_API_KEY vào server/.env (gợi ý model: gpt-4o-mini hoặc gpt-4o) rồi khởi động lại. Trong lúc đó dùng kênh Quét QR VNeID hoặc Nhập tay.'
        : e.message);
    } finally { setBusy(false); }
  };
  const onFile = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => handle(reader.result);
    reader.readAsDataURL(file);
  };

  return (
    <div>
      <label className="btn primary" style={{ width: '100%', justifyContent: 'center', padding: 10, cursor: 'pointer' }}>
        {busy ? <span className="spin" /> : '🤖'} Chụp/tải ảnh màn hình VNeID hoặc thẻ CCCD
        <input type="file" accept="image/*" capture="environment" hidden onChange={onFile} />
      </label>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 8, alignItems: 'center' }}>
        <span className={`pill ${ai?.aiConfigured ? 'ok' : 'warn'}`}>
          {ai ? (ai.aiConfigured ? `🤖 Model: ${ai.visionModel}` : '⚠️ Chưa cấu hình AI_API_KEY') : '…'}
        </span>
        <span className="pill info">Pipeline 2 lượt + tự kiểm tra</span>
      </div>
      <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 8 }}>
        Ảnh gửi tới mô hình AI Vision (chuẩn OpenAI-compatible) để trích xuất họ tên, ngày sinh, giới tính, số CCCD —
        kèm <b>độ tin cậy</b> và <b>cảnh báo</b> nếu ảnh mờ/chói. Ảnh được thu nhỏ (1600px, chất lượng cao) trước khi gửi và
        <b> KHÔNG được lưu</b> trong hệ thống. Mẹo: chụp thẳng màn hình, đủ sáng, chữ to chiếm phần lớn khung hình.
      </div>
      {err && <div className="note" style={{ marginTop: 8, fontSize: 12.5 }}>{err}</div>}
      {meta && (
        <div className="note blue" style={{ marginTop: 8, fontSize: 12.5 }}>
          ✅ Đã đọc (lượt {meta.pass || 1}){meta.fields?.confidence != null ? ` · độ tin cậy ${Math.round(meta.fields.confidence * 100)}%` : ''}.
          {meta.fields?.warnings?.length ? (
            <div style={{ marginTop: 4 }}>⚠️ {meta.fields.warnings.join(' · ')}</div>
          ) : (
            <div style={{ marginTop: 4 }}>Không có cảnh báo — vẫn hãy rà lại tên/ngày sinh/CCCD trước khi tạo.</div>
          )}
        </div>
      )}
      {preview && <img src={preview} alt="ảnh đã tải" style={{ width: '100%', borderRadius: 10, marginTop: 8, border: '1px solid var(--line)' }} />}
    </div>
  );
}

async function downscale(dataUrl, max = 1280) {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const scale = Math.min(1, max / Math.max(img.width, img.height));
      const c = document.createElement('canvas');
      c.width = Math.round(img.width * scale); c.height = Math.round(img.height * scale);
      c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
      resolve(c.toDataURL('image/jpeg', 0.9));
    };
    img.src = dataUrl;
  });
}

/* ================= Kết quả: hồ sơ + tài khoản ================= */
function DonePanel({ done, onAnother }) {
  const { member, account } = done;
  const [showPw, setShowPw] = useState(true);
  const toast = useToast();
  const copy = async (text, label) => {
    try { await navigator.clipboard.writeText(text); toast(`Đã sao chép ${label}`, 'ok'); }
    catch { toast('Trình duyệt chặn clipboard', 'err'); }
  };
  return (
    <div style={{ maxWidth: 620, margin: '0 auto' }}>
      <div className="card">
        <div className="card-h"><b>🎉 Đã tạo thành công</b></div>
        <div className="card-b">
          <dl className="kv">
            <dt>Họ tên</dt><dd><b>{member.fullName}</b></dd>
            <dt>Mã hồ sơ</dt><dd><code>{member.id}</code></dd>
            <dt>Mã đoàn viên</dt><dd>{member.memberCode}</dd>
            <dt>Định danh</dt><dd>{member.idVerifyStatus === 'VERIFIED' ? <span className="pill ok">🇻🇳 Đã xác thực (nguồn QR VNeID/AI)</span> : <span className="pill gray">Chưa xác thực — có thể xác thực sau</span>}</dd>
            <dt>Hash trên ledger</dt><dd><span className="hash">{member.profileHash}</span></dd>
          </dl>

          {account && (
            <div className="note blue" style={{ marginTop: 12 }}>
              <b style={{ fontSize: 13.5 }}>🔑 Tài khoản cho học sinh</b>
              <div className="form-row" style={{ marginTop: 8 }}>
                <div className="field"><label>Tên đăng nhập</label>
                  <div style={{ display: 'flex', gap: 6 }}>
                    <input readOnly value={account.username} style={{ fontFamily: 'monospace' }} />
                    <button className="btn sm" onClick={() => copy(account.username, 'tên đăng nhập')}>📋</button>
                  </div>
                </div>
                <div className="field"><label>Mật khẩu tạm (hiện 1 lần duy nhất)</label>
                  <div style={{ display: 'flex', gap: 6 }}>
                    <input readOnly value={account.password} type={showPw ? 'text' : 'password'} style={{ fontFamily: 'monospace' }} />
                    <button className="btn sm" onClick={() => setShowPw(!showPw)}>{showPw ? '🙈' : '👁'}</button>
                    <button className="btn sm" onClick={() => copy(account.password, 'mật khẩu')}>📋</button>
                  </div>
                </div>
              </div>
              Hướng dẫn học sinh: đăng nhập → đổi mật khẩu ngay. Cán bộ ghi mật khẩu vào biên bản bàn giao.
            </div>
          )}

          <div style={{ display: 'flex', gap: 8, marginTop: 14, flexWrap: 'wrap' }}>
            <a className="btn primary" href={`#/members/${member.id}/card`}>🪪 In thẻ QR cho học sinh</a>
            <a className="btn" href={`#/members/${member.id}`}>Mở hồ sơ</a>
            <button className="btn" onClick={onAnother}>＋ Tiếp tục nhập người khác</button>
          </div>
        </div>
      </div>
    </div>
  );
}
