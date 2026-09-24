import React from 'react';

// Bộ biểu đồ SVG thuần — không cần thư viện ngoài, in ấn được, responsive

const PALETTE = ['#9f1d1d', '#f59e0b', '#2563eb', '#16a34a', '#7c3aed', '#0891b2', '#db2777', '#65a30d'];

/** Biểu đồ tròn (donut) — data: [{label, value, color?}] */
export function Donut({ data, size = 148, thickness = 24, center }) {
  const total = data.reduce((s, d) => s + d.value, 0) || 1;
  const r = (size - thickness) / 2;
  const c = size / 2;
  const circ = 2 * Math.PI * r;
  let acc = 0;
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} role="img">
      <circle cx={c} cy={c} r={r} fill="none" stroke="#f1f3f7" strokeWidth={thickness} />
      {data.filter((d) => d.value > 0).map((d, i) => {
        const frac = d.value / total;
        const el = (
          <circle key={i} cx={c} cy={c} r={r} fill="none" stroke={d.color || PALETTE[i % PALETTE.length]}
                  strokeWidth={thickness} strokeDasharray={`${Math.max(frac * circ - 1.5, 0.5)} ${circ}`}
                  strokeDashoffset={-acc * circ} transform={`rotate(-90 ${c} ${c})`} />
        );
        acc += frac;
        return el;
      })}
      {center !== undefined && (
        <>
          <text x={c} y={c} textAnchor="middle" dominantBaseline="central" fontSize={22} fontWeight={800} fill="#1f2937">{center}</text>
        </>
      )}
    </svg>
  );
}

export function Legend({ data, total }) {
  const sum = total ?? data.reduce((s, d) => s + d.value, 0);
  return (
    <div className="chart-legend">
      {data.map((d, i) => (
        <div key={i} className="lg-item">
          <span className="sw" style={{ background: d.color || PALETTE[i % PALETTE.length] }} />
          <span className="lg-lbl" title={d.label}>{d.label}</span>
          <b>{d.value}</b>
          <span className="lg-pct">{sum ? Math.round((d.value / sum) * 100) : 0}%</span>
        </div>
      ))}
    </div>
  );
}

/** Cột dọc — data: [{label, value}] */
export function VBars({ data, height = 150, color = '#9f1d1d', fmt }) {
  const max = Math.max(1, ...data.map((d) => d.value));
  const W = Math.max(280, data.length * 46);
  const pad = { t: 16, b: 22, l: 6, r: 6 };
  const iw = W - pad.l - pad.r;
  const ih = height - pad.t - pad.b;
  const bw = Math.min(34, iw / Math.max(data.length, 1) - 10);
  return (
    <div style={{ overflowX: 'auto' }}>
      <svg width={W} height={height} viewBox={`0 0 ${W} ${height}`}>
        <line x1={pad.l} y1={height - pad.b} x2={W - pad.r} y2={height - pad.b} stroke="#e5e7eb" />
        {data.map((d, i) => {
          const x = pad.l + (iw / data.length) * i + (iw / data.length - bw) / 2;
          const h = (d.value / max) * ih;
          return (
            <g key={i}>
              <rect x={x} y={height - pad.b - h} width={bw} height={Math.max(h, 2)} rx={5} fill={color} opacity={0.25 + 0.75 * (d.value / max)} />
              <text x={x + bw / 2} y={height - pad.b - h - 5} textAnchor="middle" fontSize={11.5} fontWeight={700} fill="#374151">{fmt ? fmt(d.value) : d.value}</text>
              <text x={x + bw / 2} y={height - pad.b + 14} textAnchor="middle" fontSize={10.5} fill="#6b7280">{d.label}</text>
            </g>
          );
        })}
        {data.length === 0 && <text x={W / 2} y={height / 2} textAnchor="middle" fill="#9ca3af" fontSize={12}>Chưa có dữ liệu</text>}
      </svg>
    </div>
  );
}

/** Cột ngang — data: [{label, value, color?}] */
export function HBars({ data, color = '#9f1d1d', fmt }) {
  const max = Math.max(1, ...data.map((d) => d.value));
  return (
    <div>
      {data.map((d, i) => (
        <div className="bar-row" key={i}>
          <div className="lbl" title={d.label}>{d.label}</div>
          <div className="track"><div className="fill" style={{ width: `${(d.value / max) * 100}%`, background: d.color || `linear-gradient(90deg, ${color}, #e05b5b)` }} /></div>
          <div className="num">{fmt ? fmt(d.value) : d.value}</div>
        </div>
      ))}
      {data.length === 0 && <div className="empty" style={{ padding: 10 }}>Chưa có dữ liệu</div>}
    </div>
  );
}

export { PALETTE };
