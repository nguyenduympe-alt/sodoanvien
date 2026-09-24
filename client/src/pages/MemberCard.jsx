// Trang thẻ đoàn viên số + QR xác minh (in được ra thẻ vật lý)
import React, { useEffect, useRef, useState } from 'react';
import { api, fmtTime } from '../api.js';
import { qrSvg, verifyUrl } from '../lib/qr.js';
import { StatusPill, SyncBadge, Loading, useToast, DoanEmblem } from '../components.jsx';

export default function MemberCard({ me, id }) {
  const memberId = id || me.memberId;
  const [d, setD] = useState(null);
  const [err, setErr] = useState('');
  const qrRef = useRef(null);
  const toast = useToast();

  useEffect(() => {
    api.get(`/members/${memberId}`).then(setD).catch((e) => setErr(e.message));
  }, [memberId]);

  // Khi in: ẩn toàn bộ khung giao diện, chỉ giữ thẻ
  useEffect(() => {
    document.body.classList.add('print-card');
    return () => document.body.classList.remove('print-card');
  }, []);

  if (err) return <div className="note" style={{ marginTop: 20 }}>{err} <a className="btn sm" href="#/members">← Danh sách</a></div>;
  if (!d) return <Loading />;
  const { member: m, verify } = d;
  const url = verifyUrl(m.memberCode, verify.offchainHash || m.profileHash || '');
  const qr = qrSvg(url, { ecl: 'M' });

  const copyLink = async () => {
    try { await navigator.clipboard.writeText(url); toast('Đã sao chép liên kết xác minh', 'ok'); }
    catch { toast('Trình duyệt chặn clipboard — hãy copy thủ công', 'err'); }
  };
  const downloadQr = () => {
    const svg = qrRef.current?.querySelector('svg');
    if (!svg) return;
    const blob = new Blob([new XMLSerializer().serializeToString(svg)], { type: 'image/svg+xml' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `QR-${m.memberCode}.svg`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  return (
    <>
      <div className="page-head no-print">
        <div>
          <a href={me.role === 'DOAN_VIEN' ? '#/' : `#/members/${m.id}`} style={{ fontSize: 12.5, color: 'var(--info)' }}>← Quay lại</a>
          <h2>🪪 Thẻ đoàn viên số</h2>
          <p>Mã QR chứa mã đoàn viên + hash hồ sơ — quét bằng điện thoại là xác minh ngay trên ledger blockchain</p>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button className="btn primary" onClick={() => window.print()}>🖨️ In thẻ</button>
          <button className="btn" onClick={downloadQr}>⬇️ Tải QR (SVG)</button>
          <button className="btn" onClick={copyLink}>🔗 Sao chép link</button>
        </div>
      </div>

      <div style={{ display: 'grid', gap: 20, justifyItems: 'center' }}>
        {/* ---------- Mặt thẻ ---------- */}
        <div className="dvc-card" id="dvc-card">
          <div className="dvc-pattern" aria-hidden="true" />
          <div className="dvc-head">
            <span className="dvc-star"><DoanEmblem size={30} /></span>
            <div>
              <div className="dvc-org">ĐOÀN TNCS HỒ CHÍ MINH · ĐẠI HỌC CẦN THƠ</div>
              <div className="dvc-title">THẺ ĐOÀN VIÊN SỐ</div>
            </div>
          </div>
          <div className="dvc-body">
            <div className="dvc-info">
              <div className="dvc-name">{m.fullName}</div>
              <div className="dvc-code">{m.memberCode} · <span>{m.id}</span></div>
              {m.idVerifyStatus === 'VERIFIED' && <div className="dvc-vneid">🇻🇳 ĐỊNH DANH ĐIỆN TỬ MỨC 2 ✓</div>}
              <dl className="dvc-meta">
                <div><dt>Ngày sinh</dt><dd>{m.dob || '—'}</dd></div>
                <div><dt>Chi đoàn</dt><dd>{m.unitName || m.unitId}</dd></div>
                <div><dt>Kết nạp</dt><dd>{m.joinDate || '—'} · {m.joinPlace || 'Đoàn trường'}</dd></div>
              </dl>
            </div>
            <div className="dvc-qr">
              <svg viewBox={`0 0 ${qr.size} ${qr.size}`} width="104" height="104" shapeRendering="crispEdges">
                <rect width={qr.size} height={qr.size} fill="#fff" />
                <path d={qr.d} fill="#111827" />
              </svg>
              <span>QUÉT ĐỂ XÁC MINH</span>
            </div>
          </div>
          <div className="dvc-foot">
            <span>Hồ sơ được ghi vết trên chuỗi khối Hyperledger Fabric</span>
            <b>{m.status === 'ACTIVE' ? 'ĐANG SINH HOẠT' : m.status === 'TRANSFER_PENDING' ? 'CHỜ CHUYỂN SINH HOẠT' : 'HỒ SƠ BỊ KHÓA'}</b>
          </div>
        </div>

        {/* ---------- Thông tin kỹ thuật cho cán bộ / in kèm ---------- */}
        <div className="card" style={{ width: 'min(560px,100%)' }}>
          <div className="card-h"><b>Thông tin xác minh in kèm (mặt sau thẻ)</b><SyncBadge verify={verify} /></div>
          <div className="card-b">
            <dl className="kv">
              <dt>Link xác minh</dt><dd style={{ wordBreak: 'break-all', fontSize: 12 }}><a style={{ color: 'var(--info)' }} href={url}>{url}</a></dd>
              <dt>Hash hồ sơ</dt><dd><span className="hash">{m.profileHash}</span></dd>
              <dt>Giao dịch cuối</dt><dd><span className="hash">{m.lastTxId}</span></dd>
              <dt>Trạng thái ledger</dt><dd>{verify.ledgerHash ? (verify.consistent ? <span className="pill ok">Khớp với ledger ✓</span> : <span className="pill bad">Lệch hash — cần đối soát!</span>) : <span className="pill gray">Chưa đối soát</span>}</dd>
              <dt>Cập nhật cuối</dt><dd>{fmtTime(m.updatedAt)}</dd>
            </dl>
            <div className="note blue" style={{ marginTop: 10, fontSize: 12.5 }}>
              Cách dùng: in thẻ (khổ thẻ ATM, nên in cán laminated), dán lên thẻ đoàn viên/kẹp hồ sơ. Khi cần xác minh,
              mở camera điện thoại quét QR — hệ thống trả về trạng thái đoàn viên và đối chiếu hash với sổ cái.
            </div>
          </div>
        </div>

        {/* Ẩn trên màn hình, chỉ hiện khi in: mã QR phóng to */}
        <div ref={qrRef} className="dvc-qr-print" aria-hidden="true">
          <svg viewBox={`0 0 ${qr.size} ${qr.size}`} width="180" height="180" shapeRendering="crispEdges">
            <rect width={qr.size} height={qr.size} fill="#fff" />
            <path d={qr.d} fill="#111827" />
          </svg>
        </div>
      </div>
    </>
  );
}
