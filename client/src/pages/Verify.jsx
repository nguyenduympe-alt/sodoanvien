import React, { useEffect, useRef, useState } from 'react';
import { api, short } from '../api.js';
import { useToast } from '../components.jsx';

// Trang xác minh công khai — không cần đăng nhập.
// Đích của mã QR trên thẻ đoàn viên: #/verify?code=<mã ĐV>&hash=<hash hồ sơ>
// Khi mở từ QR → tự động tra cứu và đối chiếu hash ngay.
export default function Verify({ publicOnly }) {
  const params = new URLSearchParams((window.location.hash.split('?')[1] || ''));
  const [code, setCode] = useState(params.get('code') || '');
  const [hash, setHash] = useState(params.get('hash') || '');
  const [r, setR] = useState(null);
  const [busy, setBusy] = useState(false);
  const fromQr = useRef(!!params.get('code'));
  const toast = useToast();

  const run = async (c, h) => {
    const theCode = (c ?? code).trim();
    if (!theCode) return;
    setBusy(true);
    try {
      const p = new URLSearchParams({ code: theCode });
      const theHash = (h ?? hash).trim();
      if (theHash) p.set('hash', theHash);
      setR(await api.get(`/verify?${p}`));
    } catch (ex) { toast(ex.message, 'err'); } finally { setBusy(false); }
  };

  // Mở từ QR → chạy xác minh luôn
  const ran = useRef(false);
  useEffect(() => {
    if (!ran.current && params.get('code')) {
      ran.current = true;
      run(params.get('code'), params.get('hash') || '');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div style={{ maxWidth: 640, margin: '0 auto' }}>
      {!publicOnly && (
        <div className="page-head">
          <div>
            <h2>🛡️ Xác minh công khai</h2>
            <p>Tra cứu trạng thái đoàn viên không cần đăng nhập — đích đến của mã QR trên thẻ đoàn viên</p>
          </div>
        </div>
      )}
      {fromQr.current && (
        <div className="note blue" style={{ marginBottom: 12, fontSize: 13 }}>
          📷 Mở từ mã QR trên thẻ đoàn viên — đang tự động xác minh…
        </div>
      )}
      <div className="card">
        <div className="card-b">
          <form onSubmit={(e) => { e.preventDefault(); run(); }}>
            <div className="field">
              <label>Mã đoàn viên</label>
              <input value={code} onChange={(e) => setCode(e.target.value)} placeholder="vd: DV20260001" />
            </div>
            <div className="field">
              <label>Mã băm cần đối chiếu (tùy chọn — có sẵn khi quét QR)</label>
              <input value={hash} onChange={(e) => setHash(e.target.value)} placeholder="Dán hash từ thẻ/giấy xác nhận…" style={{ fontFamily: 'monospace', fontSize: 12 }} />
            </div>
            <button className="btn primary" style={{ width: '100%', justifyContent: 'center' }} disabled={busy || !code}>
              {busy ? <span className="spin" /> : '🔎'} Tra cứu &amp; xác minh
            </button>
          </form>
        </div>
      </div>

      {r && (
        <div className="card" style={{ marginTop: 14 }}>
          <div className="card-b">
            {!r.found ? (
              <div className="note" style={{ textAlign: 'center', padding: 22 }}>
                <div style={{ fontSize: 38 }}>❓</div>
                Không tìm thấy đoàn viên với mã <b>{r.code}</b> trong hệ thống.
              </div>
            ) : (
              <>
                <div style={{ textAlign: 'center', padding: '8px 0 14px' }}>
                  {r.hashMatch === undefined ? (
                    <div style={{ fontSize: 40 }}>{r.status === 'ACTIVE' ? '✅' : r.status === 'TRANSFER_PENDING' ? '🔁' : '🔒'}</div>
                  ) : r.hashMatch ? (
                    <div style={{ fontSize: 40 }}>✅</div>
                  ) : (
                    <div style={{ fontSize: 40 }}>🚨</div>
                  )}
                  <div style={{ fontSize: 17, fontWeight: 800, marginTop: 4 }}>
                    {r.hashMatch === undefined
                      ? (r.status === 'ACTIVE' ? 'Đoàn viên đang sinh hoạt bình thường' : r.status === 'TRANSFER_PENDING' ? 'Đang chờ chuyển sinh hoạt' : 'Hồ sơ bị khóa — cần liên hệ Đoàn trường')
                      : (r.hashMatch ? 'HỒ SƠ CHÍNH ĐÁNG — HASH KHỚP LEDGER' : 'CẢNH BÁO: HASH KHÔNG KHỚP!')}
                  </div>
                  {r.hashMatch === false && (
                    <div style={{ color: 'var(--bad)', fontSize: 13, marginTop: 4 }}>
                      Thẻ/giấy xác nhận này không còn hợp lệ — vui lòng liên hệ Đoàn trường để kiểm tra.
                    </div>
                  )}
                </div>
                <dl className="kv">
                  <dt>Mã đoàn viên</dt><dd><b>{r.code}</b></dd>
                  <dt>Đơn vị sinh hoạt</dt><dd>{r.unit}</dd>
                  <dt>Trạng thái</dt><dd>{r.status === 'ACTIVE' ? <span className="pill ok">Đang sinh hoạt</span> : r.status === 'TRANSFER_PENDING' ? <span className="pill warn">Chờ chuyển sinh hoạt</span> : <span className="pill bad">Bị khóa</span>}</dd>
                  <dt>Hồ sơ trên ledger</dt><dd>{r.ledgerRecorded ? <span className="pill ok">Đã ghi vết blockchain ✓</span> : <span className="pill gray">Chưa ghi</span>}</dd>
                  {r.checkedHash && (
                    <>
                      <dt>Hash đối chiếu</dt><dd><span className="hash">{short(r.checkedHash, 16)}</span></dd>
                      <dt>Kết quả</dt><dd>{r.hashMatch ? <span className="pill ok">✓ Khớp — không bị giả mạo</span> : <span className="pill bad">✗ Không khớp</span>}</dd>
                    </>
                  )}
                </dl>
                <div style={{ textAlign: 'center', marginTop: 12, fontSize: 11.5, color: 'var(--muted)' }}>
                  Xác minh lúc {new Date().toLocaleString('vi-VN')} · Hệ thống sổ Đoàn viên trên chuỗi khối Hyperledger Fabric
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
