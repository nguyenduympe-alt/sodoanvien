import React, { useEffect, useState } from 'react';
import { api, getToken, getUser, setSession, ROLE_LABEL } from './api.js';
import { DoanEmblem } from './components.jsx';
import Login from './pages/Login.jsx';
import Dashboard from './pages/Dashboard.jsx';
import Members from './pages/Members.jsx';
import MemberDetail from './pages/MemberDetail.jsx';
import MemberCard from './pages/MemberCard.jsx';
import Intake from './pages/Intake.jsx';
import Transfers from './pages/Transfers.jsx';
import Ledger from './pages/Ledger.jsx';
import Admin from './pages/Admin.jsx';
import Verify from './pages/Verify.jsx';
import Docs from './pages/Docs.jsx';
import Assistant from './pages/Assistant.jsx';

/* ---------- Router dạng hash — không cần thêm thư viện ---------- */
function useHashRoute() {
  const [hash, setHash] = useState(window.location.hash || '#/');
  useEffect(() => {
    const fn = () => setHash(window.location.hash || '#/');
    window.addEventListener('hashchange', fn);
    return () => window.removeEventListener('hashchange', fn);
  }, []);
  return hash.replace(/^#/, '') || '/';
}

const NAV = [
  { group: 'Tổng quan' },
  { path: '/', label: 'Bảng điều khiển', ico: '📊' },
  { path: '/members', label: 'Đoàn viên', ico: '👥', roles: ['CHI_DOAN', 'LIEN_CHI', 'DOAN_TRUONG', 'QUAN_TRI'] },
  { path: '/intake', label: 'Nhập từ ảnh VNeID', ico: '📸', roles: ['CHI_DOAN', 'LIEN_CHI', 'DOAN_TRUONG', 'QUAN_TRI'] },
  { path: '/transfers', label: 'Chuyển sinh hoạt', ico: '🔁' },
  { path: '/mycard', label: 'Thẻ đoàn viên', ico: '🪪', roles: ['DOAN_VIEN'] },
  { group: 'Blockchain' },
  { path: '/ledger', label: 'Sổ cái (Ledger)', ico: '⛓️' },
  { path: '/assistant', label: 'Trợ lí AI', ico: '🤖' },
  { path: '/verify', label: 'Xác minh công khai', ico: '🛡️', public: true },
  { group: 'Hệ thống' },
  { path: '/admin', label: 'Quản trị & Đối soát', ico: '🛠️', roles: ['QUAN_TRI'] },
  { path: '/docs', label: 'Tài liệu', ico: '📄' },
];

export default function App() {
  const route = useHashRoute();
  const [me, setMe] = useState(getUser());
  const [drawer, setDrawer] = useState(false);
  const [theme, setTheme] = useState(localStorage.getItem('sdv_theme') || 'doando');

  useEffect(() => {
    document.body.dataset.theme = theme === 'aodoan' ? 'aodoan' : '';
    localStorage.setItem('sdv_theme', theme);
  }, [theme]);
  useEffect(() => { setDrawer(false); window.scrollTo(0, 0); }, [route]);
  const toggleTheme = () => setTheme((t) => (t === 'aodoan' ? 'doando' : 'aodoan'));

  if (route.startsWith('/verify') && !me) {
    return <Verify publicOnly />;
  }
  if (!getToken() || !me) return <Login onLogin={(u) => setMe(u)} />;

  const logout = () => { setSession(null, null); setMe(null); window.location.hash = '#/'; };
  const visibleNav = NAV.filter((n) => !n.roles || n.roles.includes(me.role));

  const bottomItems = [
    { path: '/', ico: '📊', label: 'Tổng quan' },
    { path: '/members', ico: '👥', label: 'Đoàn viên', roles: ['CHI_DOAN', 'LIEN_CHI', 'DOAN_TRUONG', 'QUAN_TRI'] },
    { path: '/intake', ico: '📸', label: 'Nhập ảnh', roles: ['CHI_DOAN', 'LIEN_CHI', 'DOAN_TRUONG', 'QUAN_TRI'] },
    { path: '/mycard', ico: '🪪', label: 'Thẻ ĐV', roles: ['DOAN_VIEN'] },
    { path: '/transfers', ico: '🔁', label: 'Chuyển' },
    { path: '/ledger', ico: '⛓️', label: 'Ledger' },
    { path: '/assistant', ico: '🤖', label: 'AI' },
    { path: '/admin', ico: '🛠️', label: 'Quản trị', roles: ['QUAN_TRI'] },
  ].filter((n) => !n.roles || n.roles.includes(me.role)).slice(0, 5);

  const isActive = (p) => (p === '/' ? route === '/' : route.startsWith(p));

  const Sidebar = (
    <>
      <aside className={`sidebar ${drawer ? 'open' : ''}`}>
        <div className="brand">
          <div className="logo"><DoanEmblem size={26} /></div>
          <h1>Sổ Đoàn viên số<small>Lớp xác thực Hyperledger Fabric</small></h1>
        </div>
        <nav className="nav">
          {visibleNav.map((n, i) => n.group
            ? <div className="group" key={i}>{n.group}</div>
            : <a key={n.path} href={`#${n.path}`} className={isActive(n.path) ? 'active' : ''}>
                <span className="ico">{n.ico}</span>{n.label}
              </a>)}
        </nav>
        <div className="me-card">
          <b>{me.displayName}</b>
          <span>{ROLE_LABEL[me.role]}{me.unitId ? ` · ${me.unitId}` : ''}</span>
          <button className="btn-logout" onClick={toggleTheme}>
            {theme === 'aodoan' ? '🔴 Giao diện Đoàn đỏ' : '👕 Giao diện Áo Đoàn xanh'}
          </button>
          <button className="btn-logout" onClick={logout}>Đăng xuất</button>
        </div>
      </aside>
      <div className={`scrim ${drawer ? 'show' : ''}`} onClick={() => setDrawer(false)} />
    </>
  );

  return (
    <div className="app">
      {Sidebar}
      <header className="m-topbar">
        <button className="hamburger" onClick={() => setDrawer(true)}>☰</button>
        <div className="logo"><DoanEmblem size={22} /></div>
        <b>Sổ Đoàn viên số</b>
        <button className="hamburger" style={{ marginLeft: 'auto' }} onClick={toggleTheme} title="Đổi giao diện">
          {theme === 'aodoan' ? '🔴' : '👕'}
        </button>
        <span style={{ fontSize: 12, opacity: .9 }}>{me.displayName.split(' ').slice(-2).join(' ')}</span>
      </header>
      <main className="main">
        {route === '/' && <Dashboard me={me} />}
        {route === '/members' && <Members me={me} />}
        {route === '/intake' && <Intake me={me} />}
        {route.startsWith('/members/') && route.endsWith('/card') && <MemberCard me={me} id={route.split('/')[2]} />}
        {route.startsWith('/members/') && !route.endsWith('/card') && <MemberDetail me={me} id={route.split('/')[2]} />}
        {route === '/mycard' && <MemberCard me={me} />}
        {route === '/transfers' && <Transfers me={me} />}
        {route === '/ledger' && <Ledger me={me} />}
        {route === '/admin' && <Admin me={me} />}
        {route.startsWith('/verify') && <Verify />}
        {route === '/docs' && <Docs me={me} />}
        {route === '/assistant' && <Assistant me={me} />}
      </main>
      <nav className="bottom-nav">
        {bottomItems.map((n) => (
          <a key={n.path} href={`#${n.path}`} className={isActive(n.path) ? 'active' : ''}>
            <span className="ico">{n.ico}</span>{n.label}
          </a>
        ))}
      </nav>
    </div>
  );
}
