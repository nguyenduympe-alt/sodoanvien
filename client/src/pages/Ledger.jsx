import React, { useEffect, useState, useCallback } from 'react';
import { api, fmtTime, short } from '../api.js';
import { Modal, Hash, Empty, Loading, useToast } from '../components.jsx';

export default function Ledger({ me }) {
  const [d, setD] = useState(null);
  const [limit, setLimit] = useState(15);
  const [tx, setTx] = useState(null);
  const toast = useToast();

  const load = useCallback(() => {
    api.get(`/ledger/blocks?limit=${limit}`).then(setD).catch((e) => toast(e.message, 'err'));
  }, [limit]);
  useEffect(() => { load(); }, [load]);

  const openTx = async (txId) => {
    try { setTx(await api.get(`/ledger/tx/${txId}`)); } catch (e) { toast(e.message, 'err'); }
  };

  return (
    <>
      <div className="page-head">
        <div><h2>Sổ cái phân tán (Fabric Ledger)</h2>
          <p>Mỗi block chứa hash của block trước — sửa bất kì giao dịch nào cũng làm gãy chuỗi băm</p></div>
        <span className="pill info">{d ? `${d.total} blocks` : '…'}</span>
      </div>

      {!d ? <Loading /> : d.blocks.length === 0 ? <Empty icon="⛓️" /> : (
        <div className="grid" style={{ gap: 10 }}>
          {d.blocks.map((b) => (
            <div className="card" key={b.number} style={{ padding: '12px 16px' }}>
              <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'baseline' }}>
                <b style={{ fontSize: 15 }}>Block #{b.number}</b>
                <code style={{ fontSize: 11.5, color: 'var(--muted)' }}>prev {short(b.prevHash, 8)}</code>
                <code style={{ fontSize: 11.5 }}>hash {short(b.hash, 8)}</code>
                <span style={{ marginLeft: 'auto', fontSize: 12, color: 'var(--muted)' }}>{fmtTime(b.timestamp)}</span>
              </div>
              <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 6 }}>
                {b.txs.map((t) => (
                  <div key={t.txId} className="alert-item" style={{ borderBottom: 'none', padding: '6px 0', cursor: 'pointer' }} onClick={() => openTx(t.txId)}>
                    <span className="pill ok" style={{ fontSize: 10.5 }}>VALID</span>
                    <div style={{ flex: 1, fontSize: 13 }}>
                      <code style={{ fontWeight: 700 }}>{t.fn}</code>
                      {t.result?.memberId ? <span style={{ color: 'var(--muted)' }}> · {t.result.memberId}</span> : null}
                      {t.result?.snapshotId ? <span style={{ color: 'var(--muted)' }}> · {t.result.snapshotId}</span> : null}
                      <div style={{ fontSize: 11.5, color: 'var(--muted)' }}>
                        {t.caller?.username} · {t.caller?.mspId} · endorsement: {(t.endorsements || []).map((e) => e.mspId.replace('MSP', '')).join(' + ')}
                      </div>
                    </div>
                    <code style={{ fontSize: 11 }}>{short(t.txId, 6)}</code>
                  </div>
                ))}
                {b.txs[0]?.fn === 'GENESIS' && <div className="empty" style={{ padding: 8 }}>Block khởi tạo mạng (genesis)</div>}
              </div>
            </div>
          ))}
        </div>
      )}

      {d && d.blocks.length > 0 && (
        <div style={{ display: 'flex', gap: 8, marginTop: 14, justifyContent: 'center' }}>
          <button className="btn" disabled={d.blocks.length < limit} onClick={() => setLimit((l) => l + 15)}>Xem thêm block cũ hơn</button>
        </div>
      )}

      {tx && (
        <Modal title={`Giao dịch ${tx.fn}`} onClose={() => setTx(null)} wide>
          <dl className="kv">
            <dt>Transaction ID</dt><dd><span className="hash">{tx.txId}</span></dd>
            <dt>Block</dt><dd>#{tx.block}</dd>
            <dt>Trạng thái</dt><dd><span className="pill ok">{tx.status}</span></dd>
            <dt>Người gửi</dt><dd>{tx.caller?.username} ({tx.caller?.role}) · {tx.caller?.mspId}</dd>
            <dt>Endorsement</dt><dd>{(tx.endorsements || []).map((e) => e.mspId).join(', ') || '—'}</dd>
            <dt>Thời điểm</dt><dd>{fmtTime(tx.timestamp)}</dd>
            <dt>Tham số</dt><dd><pre style={{ margin: 0, whiteSpace: 'pre-wrap', fontSize: 11.5, background: '#f8f9fb', padding: 10, borderRadius: 8 }}>{JSON.stringify(tx.args, null, 2)}</pre></dd>
            <dt>Kết quả</dt><dd><pre style={{ margin: 0, whiteSpace: 'pre-wrap', fontSize: 11.5, background: '#f8f9fb', padding: 10, borderRadius: 8 }}>{JSON.stringify(tx.result, null, 2)}</pre></dd>
          </dl>
        </Modal>
      )}
    </>
  );
}
