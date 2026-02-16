import React, { useState, useEffect } from 'react';

export default function KakaoManager() {
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(false);
  const [uploadResults, setUploadResults] = useState([]);

  useEffect(() => {
    loadHistory();
  }, []);

  const loadHistory = async () => {
    try {
      const resp = await fetch('/api/kakao/history');
      const data = await resp.json();
      setHistory(data.history || []);
    } catch (e) { console.error(e); }
  };

  const handleManualUpload = async (e) => {
    const files = e.target.files;
    if (!files?.length) return;

    const formData = new FormData();
    Array.from(files).forEach(f => formData.append('files', f));

    setLoading(true);
    try {
      const resp = await fetch('/api/kakao/manual-upload', { method: 'POST', body: formData });
      const data = await resp.json();
      if (data.success) {
        setUploadResults(data.results || []);
      }
    } catch (e) { console.error(e); }
    setLoading(false);
    e.target.value = '';
  };

  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">💬 카카오 관리</h1>
        <label className="btn btn-sm btn-primary" style={{ cursor: 'pointer' }}>
          📤 파일 업로드
          <input type="file" hidden multiple onChange={handleManualUpload} />
        </label>
      </div>

      {/* 설명 카드 */}
      <div className="card">
        <div className="card-title"><span className="icon">📋</span> 사용 방법</div>
        <div style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.8 }}>
          <p><strong>1. 자동 수신:</strong> 카카오톡 봇이 메시지/파일을 수신하면 자동으로 AI 분석 → 드라이브 업로드</p>
          <p><strong>2. 수동 업로드:</strong> 카카오톡 대화 내보내기 파일을 위 버튼으로 업로드</p>
          <p><strong>3. AI 분류:</strong> Gemini가 파일 내용 분석 → 카테고리별 드라이브 폴더에 자동 정리</p>
        </div>
      </div>

      {/* 업로드 결과 */}
      {uploadResults.length > 0 && (
        <div className="card">
          <div className="card-title"><span className="icon">🤖</span> AI 분석 결과</div>
          {uploadResults.map((r, i) => (
            <div key={i} style={{
              padding: '10px 0',
              borderBottom: '1px solid var(--border)',
              fontSize: 13
            }}>
              <div style={{ fontWeight: 500, marginBottom: 4 }}>📄 {r.filename}</div>
              {r.analysis && (
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  <span className="badge badge-info">{r.analysis.category}</span>
                  <span style={{ color: 'var(--text-muted)' }}>{r.analysis.summary}</span>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* 수신 이력 */}
      <div className="card">
        <div className="card-title">
          <span className="icon">📜</span> 수신 이력
          <button className="btn btn-sm btn-secondary" onClick={loadHistory}
            style={{ marginLeft: 'auto' }}>🔄</button>
        </div>

        {loading ? (
          <p className="loading" style={{ textAlign: 'center', color: 'var(--text-muted)' }}>로딩 중...</p>
        ) : history.length === 0 ? (
          <p style={{ textAlign: 'center', color: 'var(--text-muted)', padding: 20 }}>
            아직 수신된 메시지가 없습니다
          </p>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr><th>보낸 사람</th><th>채팅방</th><th>메시지</th><th>파일</th><th>시간</th></tr>
              </thead>
              <tbody>
                {history.map((h, i) => (
                  <tr key={i}>
                    <td>{h.sender || '-'}</td>
                    <td>{h.chat_room || '-'}</td>
                    <td style={{ maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {h.message || '-'}
                    </td>
                    <td>
                      {h.file_name ? (
                        <span className="badge badge-info">{h.file_name}</span>
                      ) : '-'}
                    </td>
                    <td style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                      {h.received_at ? new Date(h.received_at).toLocaleString('ko-KR') : '-'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* 웹훅 URL 안내 */}
      <div className="card">
        <div className="card-title"><span className="icon">🔗</span> 웹훅 설정</div>
        <div style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
          <p style={{ marginBottom: 8 }}>카카오톡 봇에서 아래 URL로 메시지를 전달하세요:</p>
          <code style={{
            display: 'block',
            background: 'var(--bg-primary)',
            padding: '10px 14px',
            borderRadius: 8,
            fontFamily: 'var(--font-mono)',
            fontSize: 12,
            color: 'var(--accent)',
            wordBreak: 'break-all'
          }}>
            POST http://[서버IP]:3000/api/kakao/webhook
          </code>
          <p style={{ marginTop: 8, fontSize: 11, color: 'var(--text-muted)' }}>
            body: {'{'} message, senderName, chatRoom, fileUrl {'}'}
          </p>
        </div>
      </div>
    </div>
  );
}
