import React, { useState, useEffect } from 'react';
import { BrowserRouter, Routes, Route, NavLink, Navigate } from 'react-router-dom';
import Dashboard from './pages/Dashboard';
import AIHub from './pages/AIHub';
import DriveManager from './pages/DriveManager';
import KakaoManager from './pages/KakaoManager';
import Scheduler from './pages/Scheduler';
import Terminal from './pages/Terminal';
import EmailManager from './pages/EmailManager';
import Login from './pages/Login';
import { useWebSocket } from './hooks/useWebSocket';
import './App.css';

function App() {
  const [auth, setAuth] = useState(localStorage.getItem('server-token') || '');
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const { lastMessage, connected } = useWebSocket(auth);

  useEffect(() => {
    if (auth) {
      fetch('/api/auth/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: auth })
      }).then(r => r.json()).then(d => {
        if (!d.valid) { setAuth(''); localStorage.removeItem('server-token'); }
      }).catch(() => {});
    }
  }, [auth]);

  if (!auth) return <Login onLogin={token => { setAuth(token); localStorage.setItem('server-token', token); }} />;

  const navItems = [
    { path: '/', icon: '📊', label: '대시보드' },
    { path: '/ai', icon: '🤖', label: 'AI Hub' },
    { path: '/drive', icon: '📁', label: 'Drive' },
    { path: '/email', icon: '📧', label: '이메일' },
    { path: '/kakao', icon: '💬', label: '카카오' },
    { path: '/scheduler', icon: '⏰', label: '스케줄러' },
    { path: '/terminal', icon: '💻', label: '터미널' },
  ];

  return (
    <BrowserRouter>
      <div className="app-layout">
        {/* 모바일 헤더 */}
        <header className="mobile-header">
          <button className="menu-btn" onClick={() => setSidebarOpen(!sidebarOpen)}>☰</button>
          <h1>🖥️ 맥미니 AI</h1>
          <span className={`status-dot ${connected ? 'online' : 'offline'}`} />
        </header>

        {/* 사이드바 */}
        <nav className={`sidebar ${sidebarOpen ? 'open' : ''}`}>
          <div className="sidebar-header">
            <h2>🖥️ Mac Mini</h2>
            <span className="version">v1.0</span>
          </div>
          <ul className="nav-list">
            {navItems.map(item => (
              <li key={item.path}>
                <NavLink
                  to={item.path}
                  className={({ isActive }) => isActive ? 'nav-link active' : 'nav-link'}
                  onClick={() => setSidebarOpen(false)}
                  end={item.path === '/'}
                >
                  <span className="nav-icon">{item.icon}</span>
                  <span className="nav-label">{item.label}</span>
                </NavLink>
              </li>
            ))}
          </ul>
          <div className="sidebar-footer">
            <button className="logout-btn" onClick={() => { setAuth(''); localStorage.removeItem('server-token'); }}>
              🔓 로그아웃
            </button>
          </div>
        </nav>

        {/* 오버레이 */}
        {sidebarOpen && <div className="overlay" onClick={() => setSidebarOpen(false)} />}

        {/* 메인 콘텐츠 */}
        <main className="main-content">
          <Routes>
            <Route path="/" element={<Dashboard lastMessage={lastMessage} />} />
            <Route path="/ai" element={<AIHub />} />
            <Route path="/drive" element={<DriveManager />} />
            <Route path="/email" element={<EmailManager />} />
            <Route path="/kakao" element={<KakaoManager />} />
            <Route path="/scheduler" element={<Scheduler />} />
            <Route path="/terminal" element={<Terminal />} />
            <Route path="*" element={<Navigate to="/" />} />
          </Routes>
        </main>
      </div>
    </BrowserRouter>
  );
}

export default App;
