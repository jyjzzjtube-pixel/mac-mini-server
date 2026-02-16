import React, { useState, useEffect } from 'react';

export default function DriveManager() {
  const [connected, setConnected] = useState(false);
  const [files, setFiles] = useState([]);
  const [folders, setFolders] = useState([]);
  const [currentFolder, setCurrentFolder] = useState(null);
  const [folderStack, setFolderStack] = useState([]);
  const [loading, setLoading] = useState(false);
  const [syncLogs, setSyncLogs] = useState([]);

  useEffect(() => {
    checkConnection();
  }, []);

  const checkConnection = async () => {
    try {
      const resp = await fetch('/api/auth/google/status');
      const data = await resp.json();
      setConnected(data.connected);
      if (data.connected) loadFiles();
    } catch (e) { console.error(e); }
  };

  const connectGoogle = async () => {
    try {
      const resp = await fetch('/api/auth/google');
      const data = await resp.json();
      if (data.url) window.open(data.url, '_blank', 'width=500,height=600');
    } catch (e) { console.error(e); }
  };

  const loadFiles = async (folderId) => {
    setLoading(true);
    try {
      const url = folderId ? `/api/drive/files?folderId=${folderId}` : '/api/drive/files';
      const resp = await fetch(url);
      const data = await resp.json();
      setFiles(data.files || []);
    } catch (e) { console.error(e); }
    setLoading(false);
  };

  const navigateFolder = (folder) => {
    setFolderStack(prev => [...prev, currentFolder]);
    setCurrentFolder(folder);
    loadFiles(folder.id);
  };

  const goBack = () => {
    const prev = folderStack.pop();
    setFolderStack([...folderStack]);
    setCurrentFolder(prev || null);
    loadFiles(prev?.id);
  };

  const handleUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const formData = new FormData();
    formData.append('file', file);
    if (currentFolder) formData.append('folderId', currentFolder.id);

    setLoading(true);
    try {
      const resp = await fetch('/api/drive/upload', { method: 'POST', body: formData });
      const data = await resp.json();
      if (data.success) {
        loadFiles(currentFolder?.id);
      }
    } catch (e) { console.error(e); }
    setLoading(false);
    e.target.value = '';
  };

  const handleClassifyUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const formData = new FormData();
    formData.append('file', file);

    setLoading(true);
    try {
      const resp = await fetch('/api/drive/classify-upload', { method: 'POST', body: formData });
      const data = await resp.json();
      if (data.success) {
        setSyncLogs(prev => [{
          time: new Date().toLocaleTimeString(),
          action: `AI 분류: ${data.classification?.category} → ${data.file?.name}`,
          status: 'success'
        }, ...prev.slice(0, 19)]);
        loadFiles(currentFolder?.id);
      }
    } catch (e) { console.error(e); }
    setLoading(false);
    e.target.value = '';
  };

  const createFolder = async () => {
    const name = prompt('폴더 이름:');
    if (!name) return;

    try {
      const resp = await fetch('/api/drive/create-folder', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, parentId: currentFolder?.id })
      });
      const data = await resp.json();
      if (data.success) loadFiles(currentFolder?.id);
    } catch (e) { console.error(e); }
  };

  const formatSize = (bytes) => {
    if (!bytes) return '-';
    if (bytes < 1024) return bytes + 'B';
    if (bytes < 1048576) return (bytes / 1024).toFixed(0) + 'KB';
    if (bytes < 1073741824) return (bytes / 1048576).toFixed(1) + 'MB';
    return (bytes / 1073741824).toFixed(1) + 'GB';
  };

  const getIcon = (mimeType) => {
    if (!mimeType) return '📄';
    if (mimeType.includes('folder')) return '📁';
    if (mimeType.includes('image')) return '🖼️';
    if (mimeType.includes('pdf')) return '📕';
    if (mimeType.includes('spreadsheet') || mimeType.includes('excel')) return '📊';
    if (mimeType.includes('document') || mimeType.includes('word')) return '📝';
    if (mimeType.includes('presentation')) return '📽️';
    if (mimeType.includes('video')) return '🎬';
    if (mimeType.includes('audio')) return '🎵';
    if (mimeType.includes('zip') || mimeType.includes('compressed')) return '📦';
    return '📄';
  };

  if (!connected) {
    return (
      <div>
        <h1 className="page-title" style={{ marginBottom: 20 }}>📁 드라이브 관리</h1>
        <div className="card" style={{ textAlign: 'center', padding: 40 }}>
          <div style={{ fontSize: 48, marginBottom: 16 }}>🔗</div>
          <h2 style={{ fontSize: 18, marginBottom: 8, color: 'var(--text-primary)' }}>
            구글 드라이브 연결 필요
          </h2>
          <p style={{ color: 'var(--text-muted)', marginBottom: 20, fontSize: 13 }}>
            파일 동기화 및 AI 분류를 위해 Google 계정을 연결해주세요.
          </p>
          <button className="btn btn-primary" onClick={connectGoogle}>
            🔐 Google 계정 연결
          </button>
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">📁 드라이브 관리</h1>
        <div style={{ display: 'flex', gap: 8 }}>
          <label className="btn btn-sm btn-primary" style={{ cursor: 'pointer' }}>
            📤 업로드
            <input type="file" hidden onChange={handleUpload} />
          </label>
          <label className="btn btn-sm btn-secondary" style={{ cursor: 'pointer' }}>
            🤖 AI 분류 업로드
            <input type="file" hidden onChange={handleClassifyUpload} />
          </label>
          <button className="btn btn-sm btn-secondary" onClick={createFolder}>📁+</button>
        </div>
      </div>

      {/* 경로 */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 16, fontSize: 13 }}>
        <button className="btn btn-sm btn-secondary"
          onClick={() => { setCurrentFolder(null); setFolderStack([]); loadFiles(); }}
          style={{ padding: '4px 8px' }}>
          🏠
        </button>
        {currentFolder && (
          <>
            <button className="btn btn-sm btn-secondary" onClick={goBack}
              style={{ padding: '4px 8px' }}>◀</button>
            <span style={{ color: 'var(--accent)' }}>{currentFolder.name}</span>
          </>
        )}
      </div>

      {/* 파일 목록 */}
      <div className="card">
        {loading ? (
          <p className="loading" style={{ textAlign: 'center', padding: 20, color: 'var(--text-muted)' }}>
            로딩 중...
          </p>
        ) : files.length === 0 ? (
          <p style={{ textAlign: 'center', padding: 20, color: 'var(--text-muted)' }}>빈 폴더</p>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr><th>이름</th><th>크기</th><th>수정일</th></tr>
              </thead>
              <tbody>
                {files.map(file => (
                  <tr key={file.id}
                    style={{ cursor: file.mimeType?.includes('folder') ? 'pointer' : 'default' }}
                    onClick={() => file.mimeType?.includes('folder') && navigateFolder(file)}>
                    <td>
                      <span style={{ marginRight: 6 }}>{getIcon(file.mimeType)}</span>
                      {file.mimeType?.includes('folder') ? (
                        <span style={{ color: 'var(--accent)' }}>{file.name}</span>
                      ) : file.webViewLink ? (
                        <a href={file.webViewLink} target="_blank" rel="noreferrer"
                          style={{ color: 'var(--text-primary)', textDecoration: 'none' }}>
                          {file.name}
                        </a>
                      ) : file.name}
                    </td>
                    <td style={{ fontSize: 12, color: 'var(--text-muted)' }}>{formatSize(file.size)}</td>
                    <td style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                      {file.modifiedTime ? new Date(file.modifiedTime).toLocaleDateString('ko-KR') : '-'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* AI 분류 로그 */}
      {syncLogs.length > 0 && (
        <div className="card">
          <div className="card-title"><span className="icon">🤖</span> AI 분류 이력</div>
          {syncLogs.map((log, i) => (
            <div key={i} style={{ fontSize: 12, padding: '4px 0', color: 'var(--text-secondary)', borderBottom: '1px solid var(--border)' }}>
              <span style={{ color: 'var(--text-muted)', marginRight: 8 }}>{log.time}</span>
              <span className={`badge badge-${log.status === 'success' ? 'success' : 'danger'}`}
                style={{ marginRight: 8 }}>{log.status}</span>
              {log.action}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
