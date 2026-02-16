import React, { useState, useEffect } from 'react';

export default function EmailManager() {
  const [status, setStatus] = useState(null);
  const [history, setHistory] = useState([]);
  const [driveUploads, setDriveUploads] = useState([]);
  const [setupGuide, setSetupGuide] = useState(null);
  const [checking, setChecking] = useState(false);
  const [showGuide, setShowGuide] = useState(false);

  useEffect(() => {
    loadStatus();
    loadHistory();
    loadDriveUploads();
  }, []);

  const loadStatus = async () => {
    try {
      const resp = await fetch('/api/email/status');
      const data = await resp.json();
      setStatus(data);
    } catch (e) { console.error(e); }
  };

  const loadHistory = async () => {
    try {
      const resp = await fetch('/api/email/history');
      const data = await resp.json();
      setHistory(data.history || []);
    } catch (e) { console.error(e); }
  };

  const loadDriveUploads = async () => {
    try {
      const resp = await fetch('/api/email/drive-uploads');
      const data = await resp.json();
      setDriveUploads(data.uploads || []);
    } catch (e) { console.error(e); }
  };

  const loadGuide = async () => {
    try {
      const resp = await fetch('/api/email/setup-guide');
      const data = await resp.json();
      setSetupGuide(data);
      setShowGuide(true);
    } catch (e) { console.error(e); }
  };

  const checkNow = async () => {
    setChecking(true);
    try {
      const resp = await fetch('/api/email/check', { method: 'POST' });
      const data = await resp.json();
      if (data.success) {
        loadHistory();
        loadDriveUploads();
        loadStatus();
      }
    } catch (e) { console.error(e); }
    setChecking(false);
  };

  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">📧 이메일 관리</h1>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn btn-sm btn-primary" onClick={checkNow} disabled={checking}>
            {checking ? '⏳ 확인 중...' : '🔍 지금 확인'}
          </button>
          <button className="btn btn-sm btn-secondary" onClick={loadGuide}>📋 설정 가이드</button>
        </div>
      </div>

      {/* 상태 카드 */}
      <div className="stats-grid">
        <div className={`stat-card ${status?.connected ? 'success' : 'danger'}`}>
          <div className="stat-value">{status?.connected ? '✅' : '❌'}</div>
          <div className="stat-label">Gmail 연결</div>
        </div>
        <div className="stat-card">
          <div className="stat-value">{status?.unread || 0}</div>
          <div className="stat-label">미읽은 메일</div>
        </div>
        <div className="stat-card">
          <div className="stat-value">{status?.processed || 0}</div>
          <div className="stat-label">AI 처리 완료</div>
        </div>
        <div className="stat-card">
          <div className="stat-value">{driveUploads.length}</div>
          <div className="stat-label">드라이브 업로드</div>
        </div>
      </div>

      {/* 자동화 흐름 */}
      <div className="card">
        <div className="card-title"><span className="icon">🔄</span> 자동화 흐름</div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
          {[
            { icon: '📨', text: '네이버 수신' },
            { icon: '→', text: '' },
            { icon: '📧', text: 'Gmail 전달' },
            { icon: '→', text: '' },
            { icon: '✨', text: 'Gemini 요약' },
            { icon: '→', text: '' },
            { icon: '📱', text: '알림 전송' },
            { icon: '→', text: '' },
            { icon: '🤖', text: 'AI 분류' },
            { icon: '→', text: '' },
            { icon: '📁', text: '드라이브 업로드' }
          ].map((item, i) => (
            <div key={i} style={{
              padding: item.text ? '8px 14px' : '0 4px',
              background: item.text ? 'var(--bg-primary)' : 'transparent',
              borderRadius: 8,
              fontSize: item.text ? 12 : 16,
              color: item.text ? 'var(--text-primary)' : 'var(--accent)',
              textAlign: 'center'
            }}>
              <div style={{ fontSize: item.text ? 18 : 14 }}>{item.icon}</div>
              {item.text && <div>{item.text}</div>}
            </div>
          ))}
        </div>
      </div>

      {/* 설정 가이드 */}
      {showGuide && setupGuide && (
        <div className="card">
          <div className="card-title">
            <span className="icon">📋</span> 네이버 메일 자동 전달 설정
            <button className="btn btn-sm btn-secondary" onClick={() => setShowGuide(false)}
              style={{ marginLeft: 'auto' }}>✕</button>
          </div>
          {setupGuide.steps?.map((step, i) => (
            <div key={i} style={{ marginBottom: 16 }}>
              <h3 style={{ fontSize: 14, color: 'var(--accent)', marginBottom: 6 }}>
                {step.step}단계: {step.title}
              </h3>
              <p style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 6 }}>{step.description}</p>
              <ol style={{ paddingLeft: 20, fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.8 }}>
                {step.detail?.map((d, j) => <li key={j}>{d}</li>)}
              </ol>
            </div>
          ))}
        </div>
      )}

      {/* 이메일 처리 이력 */}
      <div className="card">
        <div className="card-title">
          <span className="icon">📜</span> 이메일 처리 이력
          <button className="btn btn-sm btn-secondary" onClick={loadHistory}
            style={{ marginLeft: 'auto' }}>🔄</button>
        </div>
        {history.length === 0 ? (
          <p style={{ textAlign: 'center', color: 'var(--text-muted)', padding: 20 }}>
            아직 처리된 이메일이 없습니다
          </p>
        ) : (
          history.map((h, i) => (
            <div key={i} style={{
              padding: '10px 0',
              borderBottom: '1px solid var(--border)',
              fontSize: 13
            }}>
              <div style={{ fontWeight: 500, marginBottom: 4 }}>{h.title}</div>
              <div style={{ color: 'var(--text-muted)', fontSize: 12, whiteSpace: 'pre-wrap' }}>
                {h.message?.substring(0, 200)}
              </div>
              <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>
                {h.created_at ? new Date(h.created_at).toLocaleString('ko-KR') : ''}
              </div>
            </div>
          ))
        )}
      </div>

      {/* 드라이브 업로드 이력 */}
      {driveUploads.length > 0 && (
        <div className="card">
          <div className="card-title"><span className="icon">📁</span> 드라이브 자동 업로드 이력</div>
          <div className="table-wrap">
            <table>
              <thead><tr><th>파일명</th><th>카테고리</th><th>폴더</th><th>시간</th></tr></thead>
              <tbody>
                {driveUploads.map((u, i) => (
                  <tr key={i}>
                    <td>{u.filename}</td>
                    <td><span className="badge badge-info">{u.category}</span></td>
                    <td style={{ fontSize: 12 }}>{u.folder_path}</td>
                    <td style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                      {u.synced_at ? new Date(u.synced_at).toLocaleString('ko-KR') : ''}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
