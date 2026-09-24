import React, { createContext, useContext, useState, useCallback } from 'react';
import { STATUS_LABEL } from './api';

/* ---------- Huy hiệu Đoàn TNCS Hồ Chí Minh (SVG vẽ tay, dùng mọi theme) ---------- */
export function DoanEmblem({ size = 28, title = 'Huy hiệu Đoàn TNCS Hồ Chí Minh' }) {
  const star = '32,13 33.47,16.98 37.71,17.15 34.38,19.77 35.53,23.85 32,21.5 28.47,23.85 29.62,19.77 26.29,17.15 30.53,16.98';
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" role="img" aria-label={title} style={{ display: 'block' }}>
      <g fill="none" stroke="#e6b422" strokeWidth="2.6" strokeLinecap="round">
        <path d="M23 55 C13 47 9 36 12 24" />
        <path d="M41 55 C51 47 55 36 52 24" />
      </g>
      <g fill="#f4c542">
        <circle cx="21" cy="49" r="2.3" /><circle cx="18" cy="44" r="2.3" /><circle cx="16" cy="38" r="2.3" />
        <circle cx="14" cy="32" r="2.3" /><circle cx="13" cy="27" r="2.3" />
        <circle cx="43" cy="49" r="2.3" /><circle cx="46" cy="44" r="2.3" /><circle cx="48" cy="38" r="2.3" />
        <circle cx="50" cy="32" r="2.3" /><circle cx="51" cy="27" r="2.3" />
      </g>
      <rect x="24" y="8" width="16" height="22" rx="1.6" fill="#da251d" />
      <polygon points={star} fill="#ffd83d" />
    </svg>
  );
}

/* ---------- Toast ---------- */
const ToastCtx = createContext(() => {});
export const useToast = () => useContext(ToastCtx);

export function ToastProvider({ children }) {
  const [items, setItems] = useState([]);
  const push = useCallback((msg, type = 'info') => {
    const id = Math.random().toString(36).slice(2);
    setItems((l) => [...l, { id, msg, type }]);
    setTimeout(() => setItems((l) => l.filter((t) => t.id !== id)), 5200);
  }, []);
  return (
    <ToastCtx.Provider value={push}>
      {children}
      <div className="toasts">
        {items.map((t) => (
          <div key={t.id} className={`toast ${t.type === 'err' ? 'err' : t.type === 'ok' ? 'ok' : ''}`}>{t.msg}</div>
        ))}
      </div>
    </ToastCtx.Provider>
  );
}

/* ---------- Modal ---------- */
export function Modal({ title, onClose, children, wide }) {
  return (
    <div className="modal-scrim" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose?.(); }}>
      <div className="modal" style={wide ? { maxWidth: 760 } : null}>
        <div className="m-h">
          <b>{title}</b>
          <button className="btn sm" onClick={onClose}>✕</button>
        </div>
        <div className="m-b">{children}</div>
      </div>
    </div>
  );
}

/* ---------- Pill trạng thái ---------- */
export function StatusPill({ status }) {
  const [label, cls] = STATUS_LABEL[status] || [status, 'gray'];
  return <span className={`pill ${cls}`}>{label}</span>;
}

export function Hash({ value, n = 14 }) {
  if (!value) return <span className="hash">—</span>;
  return <span className="hash">{String(value).slice(0, n)}…{String(value).slice(-6)}</span>;
}

export function Empty({ icon = '📭', text = 'Chưa có dữ liệu' }) {
  return <div className="empty"><span className="big">{icon}</span>{text}</div>;
}

export function Loading({ text = 'Đang tải…' }) {
  return <div className="loading-block"><div><span className="spin" /><div>{text}</div></div></div>;
}

/* ---------- Đồng bộ hash on/off-chain ---------- */
export function SyncBadge({ verify }) {
  if (!verify || verify.consistent === null || verify.consistent === undefined) return null;
  return verify.consistent
    ? <span className="pill ok" title={`Hash khớp ledger: ${verify.ledgerHash || ''}`}>✓ Khớp hash ledger</span>
    : <span className="pill bad" title="Hash off-chain khác với ledger">✗ Lệch hash</span>;
}
