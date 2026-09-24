import React, { useEffect, useState, useCallback } from 'react';
import { api, fmtTime } from '../api.js';
import { StatusPill, Modal, Empty, Loading, useToast } from '../components.jsx';

export default function Transfers({ me }) {
  const [items, setItems] = useState(null);
  const [tab, setTab] = useState('ALL');
  const toast = useToast();

  const load = useCallback(() => {
    api.get('/transfers').then((d) => setItems(d.transfers)).catch((e) => toast(e.message, 'err'));
  }, []);
  useEffect(() => { load(); }, [load]);

  const decide = async (t, decision) => {
    const note = prompt(decision === 'ACCEPTED' ? 'Ghi chú khi tiếp nhận (tùy chọn):' : 'Lí do từ chối (tùy chọn):');
    if (note === null) return;
    try {
      await api.post(`/transfers/${t.id}/${decision === 'ACCEPTED' ? 'accept' : 'reject'}`, { note, newClassName: '' });
      toast(decision === 'ACCEPTED' ? '✅ Đã tiếp nhận — hash mới đã ghi lên ledger' : 'Đã từ chối yêu cầu', decision === 'ACCEPTED' ? 'ok' : 'info');
      load();
    } catch (e) { toast(e.message, 'err'); }
  };
  const retry = async (t) => {
    try { await api.post(`/transfers/${t.id}/retry`); toast('Đã gửi lại yêu cầu lên ledger', 'ok'); load(); }
    catch (e) { toast(e.message, 'err'); }
  };

  if (!items) return <Loading />;
  const filtered = tab === 'ALL' ? items : items.filter((t) => t.status === tab);
  const canDecide = (t) =>
    t.status === 'PENDING' && t.txId &&
    ((me.role === 'CHI_DOAN' && me.unitId === t.toUnit) || ['LIEN_CHI', 'DOAN_TRUONG'].includes(me.role));

  return (
    <>
      <div className="page-head">
        <div><h2>Chuyển sinh hoạt đoàn viên</h2><p>Mô hình 2 bước theo mục 8.7: TransferRequest → TransferAccept/Reject</p></div>
      </div>
      <div className="tabs" style={{ marginBottom: 14 }}>
        {[['ALL', 'Tất cả'], ['PENDING', 'Chờ duyệt'], ['ACCEPTED', 'Đã tiếp nhận'], ['REJECTED', 'Đã từ chối']].map(([k, v]) => (
          <button key={k} className={tab === k ? 'active' : ''} onClick={() => setTab(k)}>
            {v}{k === 'PENDING' ? ` (${items.filter((t) => t.status === 'PENDING').length})` : ''}
          </button>
        ))}
      </div>
      {filtered.length === 0 ? <Empty icon="🔁" text="Không có yêu cầu nào" /> : (
        <div className="grid" style={{ gap: 10 }}>
          {filtered.map((t) => (
            <div className="card" key={t.id} style={{ padding: '13px 16px' }}>
              <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
                <div style={{ flex: 1, minWidth: 220 }}>
                  <b>{t.fullName}</b> <code style={{ fontSize: 11.5 }}>{t.id}</code> <StatusPill status={t.status} />
                  {!t.txId && <span className="pill warn" title="Peer từng offline khi lập yêu cầu">⏳ Chưa ghi ledger — cần gửi lại</span>}
                  <div style={{ fontSize: 13, marginTop: 3 }}>
                    {t.fromName || t.fromUnit} <b style={{ color: 'var(--red)' }}>→</b> {t.toName || t.toUnit}
                  </div>
                  <div style={{ fontSize: 12.5, color: 'var(--muted)' }}>Lí do: {t.reason || '—'}</div>
                  <small style={{ color: 'var(--muted)' }}>
                    Lập bởi {t.requestedBy} · {fmtTime(t.requestedAt)}
                    {t.decidedAt ? ` · Duyệt bởi ${t.decidedBy} · ${fmtTime(t.decidedAt)}` : ''}
                  </small>
                </div>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  {!t.txId && (me.role === 'CHI_DOAN' || me.role === 'DOAN_TRUONG') &&
                    <button className="btn sm" onClick={() => retry(t)}>↻ Gửi lại lên ledger</button>}
                  {canDecide(t) && <>
                    <button className="btn sm primary" onClick={() => decide(t, 'ACCEPTED')}>✓ Tiếp nhận</button>
                    <button className="btn sm danger" onClick={() => decide(t, 'REJECTED')}>✕ Từ chối</button>
                  </>}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </>
  );
}
