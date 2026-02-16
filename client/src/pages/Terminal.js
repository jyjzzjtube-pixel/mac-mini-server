import React, { useState, useRef, useEffect } from 'react';

export default function Terminal() {
  const [command, setCommand] = useState('');
  const [output, setOutput] = useState([
    { type: 'info', text: '🖥️ 맥미니 M4 AI 홈서버 터미널' },
    { type: 'info', text: '웹 기반 원격 명령어 실행 (보안 제한 적용)' },
    { type: 'info', text: '────────────────────────────────' }
  ]);
  const [loading, setLoading] = useState(false);
  const [history, setHistory] = useState([]);
  const [historyIdx, setHistoryIdx] = useState(-1);
  const [logs, setLogs] = useState('');
  const [showLogs, setShowLogs] = useState(false);
  const termRef = useRef(null);
  const inputRef = useRef(null);

  useEffect(() => {
    termRef.current?.scrollTo(0, termRef.current.scrollHeight);
  }, [output]);

  const execute = async () => {
    if (!command.trim() || loading) return;
    const cmd = command.trim();
    setCommand('');
    setHistory(prev => [...prev, cmd]);
    setHistoryIdx(-1);
    setOutput(prev => [...prev, { type: 'cmd', text: `$ ${cmd}` }]);
    setLoading(true);

    // 특수 명령어
    if (cmd === 'clear') {
      setOutput([]);
      setLoading(false);
      return;
    }

    try {
      const resp = await fetch('/api/system/exec', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ command: cmd })
      });
      const data = await resp.json();

      if (data.stdout) {
        setOutput(prev => [...prev, { type: 'stdout', text: data.stdout }]);
      }
      if (data.stderr) {
        setOutput(prev => [...prev, { type: 'stderr', text: data.stderr }]);
      }
      if (data.error && !data.stdout && !data.stderr) {
        setOutput(prev => [...prev, { type: 'stderr', text: `오류: ${data.error}` }]);
      }
    } catch (err) {
      setOutput(prev => [...prev, { type: 'stderr', text: `연결 오류: ${err.message}` }]);
    }
    setLoading(false);
    inputRef.current?.focus();
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter') {
      execute();
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (history.length > 0) {
        const idx = historyIdx === -1 ? history.length - 1 : Math.max(0, historyIdx - 1);
        setHistoryIdx(idx);
        setCommand(history[idx]);
      }
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (historyIdx >= 0) {
        const idx = historyIdx + 1;
        if (idx >= history.length) {
          setHistoryIdx(-1);
          setCommand('');
        } else {
          setHistoryIdx(idx);
          setCommand(history[idx]);
        }
      }
    }
  };

  const loadLogs = async (type = 'out') => {
    try {
      const resp = await fetch(`/api/system/logs?type=${type}&lines=50`);
      const data = await resp.json();
      setLogs(data.logs || '로그 없음');
      setShowLogs(true);
    } catch (e) { setLogs('로그 로딩 실패'); setShowLogs(true); }
  };

  // 빠른 명령어
  const quickCommands = [
    { label: 'PM2 상태', cmd: 'pm2 status' },
    { label: '디스크', cmd: 'df -h' },
    { label: '메모리', cmd: 'free -h || vm_stat' },
    { label: 'IP', cmd: 'ifconfig | grep inet || ip addr' },
    { label: 'Tailscale', cmd: 'tailscale status' },
    { label: 'Node', cmd: 'node --version' },
    { label: '가동시간', cmd: 'uptime' },
    { label: '프로세스 TOP', cmd: 'ps aux --sort=-%cpu | head -10 || ps aux | head -10' },
  ];

  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">💻 터미널</h1>
        <div style={{ display: 'flex', gap: 6 }}>
          <button className="btn btn-sm btn-secondary" onClick={() => loadLogs('out')}>
            📄 서버 로그
          </button>
          <button className="btn btn-sm btn-secondary" onClick={() => loadLogs('error')}>
            ❌ 에러 로그
          </button>
        </div>
      </div>

      {/* 빠른 명령어 */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 12 }}>
        {quickCommands.map((q, i) => (
          <button key={i} className="btn btn-sm btn-secondary"
            onClick={() => { setCommand(q.cmd); inputRef.current?.focus(); }}>
            {q.label}
          </button>
        ))}
      </div>

      {/* 터미널 출력 */}
      <div className="terminal-box" ref={termRef}
        onClick={() => inputRef.current?.focus()}>
        {output.map((line, i) => (
          <div key={i} className={`terminal-line ${line.type}`}>
            {line.text}
          </div>
        ))}

        {/* 입력 라인 */}
        <div style={{ display: 'flex', alignItems: 'center', marginTop: 4 }}>
          <span style={{ color: '#18ffff', marginRight: 8, fontWeight: 700 }}>$</span>
          <input
            ref={inputRef}
            value={command}
            onChange={e => setCommand(e.target.value)}
            onKeyDown={handleKeyDown}
            disabled={loading}
            autoFocus
            style={{
              flex: 1,
              background: 'transparent',
              border: 'none',
              color: '#e8e8f0',
              fontFamily: 'var(--font-mono)',
              fontSize: 13,
              outline: 'none',
              caretColor: '#18ffff'
            }}
            placeholder={loading ? '실행 중...' : '명령어 입력...'}
          />
        </div>
      </div>

      {/* PM2 로그 */}
      {showLogs && (
        <div className="card" style={{ marginTop: 16 }}>
          <div className="card-title">
            <span className="icon">📜</span> 서버 로그
            <button className="btn btn-sm btn-secondary" onClick={() => setShowLogs(false)}
              style={{ marginLeft: 'auto' }}>✕</button>
          </div>
          <pre style={{
            background: '#0d0d0d',
            padding: 12,
            borderRadius: 8,
            fontFamily: 'var(--font-mono)',
            fontSize: 11,
            color: '#aaffaa',
            maxHeight: 300,
            overflow: 'auto',
            whiteSpace: 'pre-wrap',
            wordBreak: 'break-all'
          }}>
            {logs}
          </pre>
        </div>
      )}
    </div>
  );
}
