import React, { useState } from 'react';

export default function Login({ onLogin }) {
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      const resp = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password })
      });
      const data = await resp.json();

      if (data.success) {
        onLogin(data.token);
      } else {
        setError(data.error || '로그인 실패');
      }
    } catch (err) {
      setError('서버 연결 실패');
    }
    setLoading(false);
  };

  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      background: '#0a0a1a',
      padding: '20px'
    }}>
      <form onSubmit={handleSubmit} style={{
        background: '#16163a',
        border: '1px solid #252550',
        borderRadius: '20px',
        padding: '40px 32px',
        width: '100%',
        maxWidth: '360px',
        textAlign: 'center'
      }}>
        <div style={{ fontSize: '48px', marginBottom: '12px' }}>🖥️</div>
        <h1 style={{ fontSize: '20px', color: '#e8e8f0', marginBottom: '4px' }}>
          맥미니 AI 서버
        </h1>
        <p style={{ fontSize: '12px', color: '#8888aa', marginBottom: '28px' }}>
          Mac Mini M4 홈서버 관리 대시보드
        </p>

        <input
          type="password"
          className="input"
          placeholder="관리자 비밀번호"
          value={password}
          onChange={e => setPassword(e.target.value)}
          autoFocus
          style={{ marginBottom: '16px', textAlign: 'center' }}
        />

        {error && (
          <p style={{ color: '#ff5252', fontSize: '13px', marginBottom: '12px' }}>{error}</p>
        )}

        <button
          type="submit"
          className="btn btn-primary"
          disabled={loading}
          style={{ width: '100%', justifyContent: 'center', padding: '12px' }}
        >
          {loading ? '⏳ 로그인 중...' : '🔐 로그인'}
        </button>
      </form>
    </div>
  );
}
