import React, { useEffect, useState } from 'react';
import { api, fmtTime, short, ROLE_LABEL, ACTIVITY_TYPES, STATUS_LABEL } from '../api.js';
import { Loading, Empty, useToast, StatusPill } from '../components.jsx';
import { Donut, Legend, VBars, HBars, PALETTE } from '../charts.jsx';

const typeLabel = (t) => (ACTIVITY_TYPES.find(([k]) => k === t) || [, t])[1];
const typeIcon = (t) => ({ HOAT_DONG: '🤝', DANH_GIA: '📝', KHEN_THUONG: '🏆', KY_LUAT: '⚠️' }[t] || '🏅');

export default function Dashboard({ me }) {
  const [stats, setStats] = useState(null);
  const toast = useToast();

  useEffect(() => {
    api.get('/stats').then(setStats).catch((e) => toast(e.message, 'err'));
  }, []);

  if (!stats) return <Loading />;
  const maxUnit = Math.max(1, ...stats.byUnit.map((u) => u.members));

  // Chuẩn bị dữ liệu biểu đồ
  const actData = stats.activityByType
    .map((a, i) => ({ label: typeLabel(a.type), value: a.n, color: PALETTE[i % PALETTE.length] }));
  const genderData = stats.byGender.map((g, i) => ({
    label: g.gender, value: g.n, color: { Nam: '#2563eb', Nữ: '#db2777' }[g.gender] || PALETTE[i % PALETTE.length],
  }));
  let joinData = stats.joinTrend.map((j) => ({ label: j.ym.slice(5) + '/' + j.ym.slice(2, 4), value: j.n }));
  if (joinData.length > 14) {
    const byYear = {};
    for (const j of stats.joinTrend) byYear[j.ym.slice(0, 4)] = (byYear[j.ym.slice(0, 4)] || 0) + j.n;
    joinData = Object.entries(byYear).map(([label, value]) => ({ label, value }));
  }
  const txByFn = Object.entries(stats.ledger.txStats?.byFn || {})
    .map(([k, v]) => ({ label: k, value: v })).sort((a, b) => b.value - a.value);
  const transferMap = Object.fromEntries((stats.transfers || []).map((t) => [t.status, t.n]));
  const rec = stats.lastReconcile;

  return (
    <>
      <div className="page-head">
        <div>
          <h2>Xin chào, {me.displayName} 👋</h2>
          <p>{ROLE_LABEL[me.role]} · mọi số liệu đều theo phạm vi quyền của bạn</p>
        </div>
        <a className="btn primary" href="#/members">＋ Quản lí đoàn viên</a>
      </div>

      {/* ===== Hàng chỉ số ===== */}
      <div className="grid cols-4" style={{ marginBottom: 14 }}>
        <Stat ic="👥" bg="#fee2e2" label="Đoàn viên" value={stats.total} sub={stats.membersNoActivity ? `${stats.membersNoActivity} chưa có hoạt động` : undefined} />
        <Stat ic="✅" bg="#dcfce7" label="Đang hoạt động" value={stats.active} />
        <Stat ic="🔁" bg="#fef3c7" label="Chờ chuyển sinh hoạt" value={stats.transferPending} />
        <Stat ic="🔒" bg="#e0e7ff" label="Bị khóa bất thường" value={stats.locked} />
      </div>

      {/* ===== Hàng biểu đồ cấu trúc ===== */}
      <div className="grid cols-3" style={{ marginBottom: 14 }}>
        <div className="card">
          <div className="card-h"><b>Hoạt động theo loại</b><span className="pill info">{stats.activities} lượt</span></div>
          <div className="card-b" style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
            {actData.length === 0 ? <Empty icon="🏅" text="Chưa có hoạt động" /> : (
              <>
                <Donut data={actData} center={stats.activities} />
                <div style={{ flex: 1, minWidth: 150 }}><Legend data={actData} /></div>
              </>
            )}
          </div>
        </div>

        <div className="card">
          <div className="card-h"><b>Xu hướng kết nạp</b><span className="pill gray">{joinData.length > 8 ? 'theo năm' : 'theo tháng'}</span></div>
          <div className="card-b">
            <VBars data={joinData} height={158} />
          </div>
        </div>

        <div className="card">
          <div className="card-h"><b>Cấu trúc giới tính</b></div>
          <div className="card-b" style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
            {genderData.length === 0 ? <Empty icon="👥" /> : (
              <>
                <Donut data={genderData} center={stats.total} size={132} />
                <div style={{ flex: 1, minWidth: 130 }}><Legend data={genderData} /></div>
              </>
            )}
          </div>
        </div>
      </div>

      {/* ===== Hàng đơn vị + phân bố giao dịch ===== */}
      <div className="grid cols-2" style={{ marginBottom: 14 }}>
        <div className="card">
          <div className="card-h"><b>Đoàn viên theo đơn vị</b>
            <a className="btn sm ghost" href="#/members">Xem danh sách →</a>
          </div>
          <div className="card-b">
            <HBars data={stats.byUnit.map((u) => ({ label: u.name, value: u.members }))} />
            <div className="note blue" style={{ marginTop: 10, fontSize: 12 }}>
              💡 Sức chứa ghi nhận: đơn vị có thanh tỉ lệ cao nhất đang quản lí nhiều đoàn viên nhất trong phạm vi của bạn.
            </div>
          </div>
        </div>

        <div className="card">
          <div className="card-h">
            <b>Giao dịch trên sổ cái</b>
            <span className={`pill ${stats.ledger.mode === 'fabric' ? 'ok' : 'info'}`}>{stats.ledger.mode === 'fabric' ? 'Fabric thật' : 'Mô phỏng'}</span>
          </div>
          <div className="card-b">
            <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', marginBottom: 10 }}>
              <MiniKpi label="Blocks" v={stats.ledger.blocks} ic="📦" />
              <MiniKpi label="Giao dịch" v={stats.ledger.txStats?.txs || 0} ic="⛓️" />
              <MiniKpi label="Loại giao dịch" v={txByFn.length} ic="🧩" />
            </div>
            <HBars data={txByFn} color="#2563eb" />
            {stats.ledger.txStats?.lastTs && (
              <small style={{ color: 'var(--muted)' }}>Giao dịch gần nhất: {fmtTime(stats.ledger.txStats.lastTs)}</small>
            )}
          </div>
        </div>
      </div>

      {/* ===== Hàng chuyển sinh hoạt + đối soát ===== */}
      <div className="grid cols-2" style={{ marginBottom: 14 }}>
        <div className="card">
          <div className="card-h"><b>Chuyển sinh hoạt</b><a className="btn sm ghost" href="#/transfers">Tất cả →</a></div>
          <div className="card-b">
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 10 }}>
              {['PENDING', 'ACCEPTED', 'REJECTED'].map((s) => (
                <span key={s} className="pill" style={{ fontSize: 12 }}>
                  {STATUS_LABEL[s][0]}: <b>{transferMap[s] || 0}</b>
                </span>
              ))}
            </div>
            {(stats.recentTransfers || []).length === 0 ? <Empty icon="🔁" text="Chưa có yêu cầu chuyển" /> : stats.recentTransfers.map((t) => (
              <div key={t.id} className="alert-item">
                <div style={{ flex: 1, fontSize: 13 }}>
                  <b>{t.fullName}</b> <StatusPill status={t.status} />
                  <div style={{ color: 'var(--muted)', fontSize: 12 }}>{t.fromName || t.fromUnit} → {t.toName || t.toUnit} · {fmtTime(t.requestedAt)}</div>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="card">
          <div className="card-h"><b>Sức khỏe dữ liệu (đối soát hash)</b>
            {rec && <a className="btn sm ghost" href="#/admin">Quản trị →</a>}
          </div>
          <div className="card-b">
            {!rec ? (
              <>
                <Empty icon="🔍" text="Chưa chạy đối soát — vào Quản trị để chạy" />
                <div className="note" style={{ fontSize: 12.5 }}>
                  Đối soát so sánh hash off-chain với ledger: phát hiện sửa trái phép, khóa hồ sơ bất thường.
                </div>
              </>
            ) : (
              <>
                <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', marginBottom: 10 }}>
                  <MiniKpi label="Đã kiểm tra" v={rec.checked} ic="🔎" />
                  <MiniKpi label="Khớp hash" v={rec.matched} ic="✅" />
                  <MiniKpi label="Lệch" v={rec.anomalies} ic={rec.anomalies ? '🚨' : '🟢'} />
                </div>
                <div className={rec.anomalies ? 'note' : 'note blue'} style={{ fontSize: 12.5 }}>
                  Lần đối soát gần nhất: <b>{fmtTime(rec.at)}</b> bởi {rec.by}.
                  {rec.anomalies ? ` ${rec.anomalies} hồ sơ lệch hash đang được khóa chờ phục hồi snapshot.` : ' Toàn bộ hồ sơ khớp hash với ledger — dữ liệu toàn vẹn.'}
                </div>
                {stats.alertsOpen > 0 && (
                  <div className="note" style={{ marginTop: 8, fontSize: 12.5 }}>🔔 Có <b>{stats.alertsOpen}</b> cảnh báo đang mở cần xử lí.</div>
                )}
              </>
            )}
          </div>
        </div>
      </div>

      {/* ===== Hoạt động mới nhất ===== */}
      <div className="card">
        <div className="card-h"><b>Hoạt động mới nhất</b><a className="btn sm ghost" href="#/members">Xem hồ sơ →</a></div>
        <div className="card-b" style={{ display: 'grid', gap: 2 }}>
          {(stats.recentActivities || []).length === 0 ? <Empty icon="🏅" text="Chưa ghi nhận hoạt động nào" /> : stats.recentActivities.map((a) => (
            <a key={a.id} className="alert-item" href={`#/members/${a.memberId}`} style={{ cursor: 'pointer' }}>
              <span style={{ fontSize: 16 }}>{typeIcon(a.type)}</span>
              <div style={{ flex: 1, fontSize: 13 }}>
                <b>{a.title}</b> <span className="pill gray">{typeLabel(a.type)}</span>
                <div style={{ color: 'var(--muted)', fontSize: 12 }}>{a.fullName} ({a.memberCode}) · {a.activityDate}</div>
              </div>
              <span style={{ color: 'var(--muted)' }}>›</span>
            </a>
          ))}
        </div>
      </div>
    </>
  );
}

function Stat({ ic, bg, label, value, sub }) {
  return (
    <div className="card stat">
      <div className="ic" style={{ background: bg }}>{ic}</div>
      <div style={{ minWidth: 0 }}>
        <b>{value ?? '—'}</b><span>{label}</span>
        {sub && <div style={{ fontSize: 10.5, color: 'var(--gold)', fontWeight: 600, whiteSpace: 'nowrap' }}>⚠ {sub}</div>}
      </div>
    </div>
  );
}

function MiniKpi({ label, v, ic }) {
  return (
    <div style={{ background: 'var(--bg)', borderRadius: 12, padding: '8px 14px', display: 'flex', gap: 8, alignItems: 'center' }}>
      <span style={{ fontSize: 17 }}>{ic}</span>
      <div><b style={{ fontSize: 16, display: 'block', lineHeight: 1 }}>{v}</b><span style={{ fontSize: 10.5, color: 'var(--muted)' }}>{label}</span></div>
    </div>
  );
}
