import React, { useState, useEffect } from 'react';

export default function Scheduler() {
  const [jobs, setJobs] = useState([]);
  const [logs, setLogs] = useState([]);
  const [presets, setPresets] = useState([]);
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState({ name: '', cron: '', type: 'health-check', config: {} });
  const [tab, setTab] = useState('jobs');

  useEffect(() => {
    loadJobs();
    loadLogs();
    loadPresets();
  }, []);

  const loadJobs = async () => {
    try {
      const resp = await fetch('/api/scheduler/jobs');
      const data = await resp.json();
      setJobs(data.jobs || []);
    } catch (e) { console.error(e); }
  };

  const loadLogs = async () => {
    try {
      const resp = await fetch('/api/scheduler/logs?limit=30');
      const data = await resp.json();
      setLogs(data.logs || []);
    } catch (e) { console.error(e); }
  };

  const loadPresets = async () => {
    try {
      const resp = await fetch('/api/scheduler/presets');
      const data = await resp.json();
      setPresets(data.presets || []);
    } catch (e) { console.error(e); }
  };

  const addJob = async () => {
    if (!form.name || !form.cron) return;
    try {
      const resp = await fetch('/api/scheduler/jobs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form)
      });
      const data = await resp.json();
      if (data.success) {
        setShowAdd(false);
        setForm({ name: '', cron: '', type: 'health-check', config: {} });
        loadJobs();
      }
    } catch (e) { console.error(e); }
  };

  const toggleJob = async (job) => {
    try {
      await fetch(`/api/scheduler/jobs/${job.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled: !job.enabled })
      });
      loadJobs();
    } catch (e) { console.error(e); }
  };

  const runNow = async (jobId) => {
    try {
      await fetch(`/api/scheduler/jobs/${jobId}/run`, { method: 'POST' });
      setTimeout(loadLogs, 2000);
    } catch (e) { console.error(e); }
  };

  const deleteJob = async (jobId) => {
    if (!window.confirm('이 작업을 삭제하시겠습니까?')) return;
    try {
      await fetch(`/api/scheduler/jobs/${jobId}`, { method: 'DELETE' });
      loadJobs();
    } catch (e) { console.error(e); }
  };

  const usePreset = (preset) => {
    setForm({ name: preset.name, cron: preset.cron, type: preset.type, config: {} });
    setShowAdd(true);
  };

  const typeLabels = {
    'drive-sync': '📁 드라이브 동기화',
    'backup': '💾 백업',
    'ai-report': '🤖 AI 리포트',
    'health-check': '💚 헬스체크',
    'cleanup': '🧹 정리',
    'email-check': '📧 이메일',
    'custom-command': '⚡ 커스텀'
  };

  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">⏰ 스케줄러</h1>
        <button className="btn btn-sm btn-primary" onClick={() => setShowAdd(!showAdd)}>
          ➕ 작업 추가
        </button>
      </div>

      {/* 탭 */}
      <div className="toggle-wrap">
        <button className={`toggle-btn ${tab === 'jobs' ? 'active' : ''}`}
          onClick={() => setTab('jobs')}>작업 목록</button>
        <button className={`toggle-btn ${tab === 'logs' ? 'active' : ''}`}
          onClick={() => { setTab('logs'); loadLogs(); }}>실행 이력</button>
        <button className={`toggle-btn ${tab === 'presets' ? 'active' : ''}`}
          onClick={() => setTab('presets')}>프리셋</button>
      </div>

      {/* 작업 추가 폼 */}
      {showAdd && (
        <div className="card">
          <div className="card-title">➕ 새 작업</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <input className="input" placeholder="작업 이름" value={form.name}
              onChange={e => setForm({ ...form, name: e.target.value })} />
            <input className="input" placeholder="크론 표현식 (예: */5 * * * *)" value={form.cron}
              onChange={e => setForm({ ...form, cron: e.target.value })} />
            <select className="input" value={form.type}
              onChange={e => setForm({ ...form, type: e.target.value })}>
              {Object.entries(typeLabels).map(([k, v]) => (
                <option key={k} value={k}>{v}</option>
              ))}
            </select>
            <div style={{ display: 'flex', gap: 8 }}>
              <button className="btn btn-primary" onClick={addJob}>등록</button>
              <button className="btn btn-secondary" onClick={() => setShowAdd(false)}>취소</button>
            </div>
          </div>
        </div>
      )}

      {/* 작업 목록 */}
      {tab === 'jobs' && (
        <div className="card">
          {jobs.length === 0 ? (
            <p style={{ textAlign: 'center', color: 'var(--text-muted)', padding: 20 }}>
              등록된 작업 없음
            </p>
          ) : (
            jobs.map(job => (
              <div key={job.id} style={{
                display: 'flex',
                alignItems: 'center',
                padding: '12px 0',
                borderBottom: '1px solid var(--border)',
                gap: 10,
                flexWrap: 'wrap'
              }}>
                <div style={{ flex: 1, minWidth: 150 }}>
                  <div style={{ fontWeight: 500, fontSize: 14 }}>{job.name}</div>
                  <div style={{ fontSize: 11, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
                    {job.cron_expression}
                  </div>
                </div>
                <span className={`badge ${job.enabled ? 'badge-success' : 'badge-warning'}`}>
                  {typeLabels[job.type] || job.type}
                </span>
                <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                  {job.last_run ? `마지막: ${new Date(job.last_run).toLocaleString('ko-KR')}` : '미실행'}
                </span>
                <div style={{ display: 'flex', gap: 4 }}>
                  <button className="btn btn-sm btn-secondary" onClick={() => toggleJob(job)}>
                    {job.enabled ? '⏸' : '▶'}
                  </button>
                  <button className="btn btn-sm btn-secondary" onClick={() => runNow(job.id)}>
                    ⚡
                  </button>
                  <button className="btn btn-sm btn-danger" onClick={() => deleteJob(job.id)}>
                    🗑
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      )}

      {/* 실행 이력 */}
      {tab === 'logs' && (
        <div className="card">
          <div className="card-title">
            <span className="icon">📜</span> 실행 이력
            <button className="btn btn-sm btn-secondary" onClick={loadLogs}
              style={{ marginLeft: 'auto' }}>🔄</button>
          </div>
          {logs.length === 0 ? (
            <p style={{ textAlign: 'center', color: 'var(--text-muted)', padding: 20 }}>이력 없음</p>
          ) : (
            <div className="table-wrap">
              <table>
                <thead><tr><th>작업 ID</th><th>상태</th><th>메시지</th><th>소요</th><th>시간</th></tr></thead>
                <tbody>
                  {logs.map((log, i) => (
                    <tr key={i}>
                      <td>{log.job_id}</td>
                      <td>
                        <span className={`badge ${log.status === 'success' ? 'badge-success' : 'badge-danger'}`}>
                          {log.status}
                        </span>
                      </td>
                      <td style={{ maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: 12 }}>
                        {log.message}
                      </td>
                      <td style={{ fontSize: 12, fontFamily: 'var(--font-mono)' }}>
                        {log.duration_ms}ms
                      </td>
                      <td style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                        {log.executed_at ? new Date(log.executed_at).toLocaleString('ko-KR') : '-'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* 프리셋 */}
      {tab === 'presets' && (
        <div className="card">
          <div className="card-title"><span className="icon">📋</span> 프리셋 템플릿</div>
          {presets.map((p, i) => (
            <div key={i} style={{
              display: 'flex',
              alignItems: 'center',
              padding: '10px 0',
              borderBottom: '1px solid var(--border)',
              gap: 10
            }}>
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 500, fontSize: 14 }}>{p.name}</div>
                <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{p.desc}</div>
              </div>
              <span className="badge badge-info" style={{ fontFamily: 'var(--font-mono)' }}>
                {p.cron}
              </span>
              <button className="btn btn-sm btn-primary" onClick={() => usePreset(p)}>
                사용
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
