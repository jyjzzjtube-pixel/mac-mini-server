import React, { useState, useEffect, useCallback } from 'react';
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, AreaChart, Area } from 'recharts';

export default function Dashboard({ lastMessage }) {
  const [system, setSystem] = useState(null);
  const [pm2, setPm2] = useState([]);
  const [tailscale, setTailscale] = useState(null);
  const [metrics, setMetrics] = useState([]);
  const [notifications, setNotifications] = useState([]);

  const fetchData = useCallback(async () => {
    try {
      const [sysResp, pm2Resp, tsResp] = await Promise.all([
        fetch('/api/system/realtime').then(r => r.json()),
        fetch('/api/system/pm2').then(r => r.json()),
        fetch('/api/system/tailscale').then(r => r.json())
      ]);
      setSystem(sysResp);
      setPm2(pm2Resp.processes || []);
      setTailscale(tsResp);
    } catch (e) { console.error(e); }
  }, []);

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 15000);
    return () => clearInterval(interval);
  }, [fetchData]);

  // WebSocket 실시간 메트릭 수집
  useEffect(() => {
    if (lastMessage?.type === 'system-stats') {
      const d = lastMessage.data;
      setMetrics(prev => {
        const next = [...prev, {
          time: new Date().toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' }),
          cpu: parseFloat(d.cpu.load),
          ram: parseFloat(d.memory.usedPercent),
          temp: d.temperature || 0
        }];
        return next.slice(-30); // 최근 30포인트
      });
    }
  }, [lastMessage]);

  const cpuLoad = system ? parseFloat(system.cpu.load) : 0;
  const ramPercent = system ? parseFloat(system.memory.usedPercent) : 0;
  const ramGB = system ? (system.memory.used / 1073741824).toFixed(1) : '0';
  const ramTotal = system ? (system.memory.total / 1073741824).toFixed(0) : '16';
  const temp = system?.temperature || '--';

  const cpuClass = cpuLoad > 80 ? 'danger' : cpuLoad > 50 ? 'warning' : '';
  const ramClass = ramPercent > 90 ? 'danger' : ramPercent > 70 ? 'warning' : '';

  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">📊 대시보드</h1>
        <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
          {tailscale?.connected ? `📡 ${tailscale.self?.ip}` : '🔴 Tailscale 미연결'}
        </span>
      </div>

      {/* 메인 스탯 */}
      <div className="stats-grid">
        <div className={`stat-card ${cpuClass}`}>
          <div className="stat-value">{cpuLoad}%</div>
          <div className="stat-label">CPU 사용량</div>
          <div className="progress-bar" style={{ marginTop: 8 }}>
            <div className={`progress-fill ${cpuLoad > 80 ? 'danger' : cpuLoad > 50 ? 'warn' : 'good'}`}
              style={{ width: `${cpuLoad}%` }} />
          </div>
        </div>

        <div className={`stat-card ${ramClass}`}>
          <div className="stat-value">{ramPercent}%</div>
          <div className="stat-label">RAM {ramGB}/{ramTotal}GB</div>
          <div className="progress-bar" style={{ marginTop: 8 }}>
            <div className={`progress-fill ${ramPercent > 90 ? 'danger' : ramPercent > 70 ? 'warn' : 'good'}`}
              style={{ width: `${ramPercent}%` }} />
          </div>
        </div>

        <div className="stat-card">
          <div className="stat-value">{temp}°</div>
          <div className="stat-label">CPU 온도</div>
        </div>

        <div className={`stat-card ${pm2.length > 0 ? 'success' : ''}`}>
          <div className="stat-value">{pm2.length}</div>
          <div className="stat-label">PM2 프로세스</div>
        </div>
      </div>

      {/* 실시간 차트 */}
      {metrics.length > 2 && (
        <div className="card">
          <div className="card-title"><span className="icon">📈</span> 실시간 모니터</div>
          <ResponsiveContainer width="100%" height={200}>
            <AreaChart data={metrics}>
              <defs>
                <linearGradient id="cpuGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#18ffff" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="#18ffff" stopOpacity={0} />
                </linearGradient>
                <linearGradient id="ramGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#7c4dff" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="#7c4dff" stopOpacity={0} />
                </linearGradient>
              </defs>
              <XAxis dataKey="time" stroke="#555577" fontSize={10} />
              <YAxis stroke="#555577" fontSize={10} domain={[0, 100]} />
              <Tooltip
                contentStyle={{ background: '#16163a', border: '1px solid #252550', borderRadius: 8, fontSize: 12 }}
                labelStyle={{ color: '#e8e8f0' }}
              />
              <Area type="monotone" dataKey="cpu" name="CPU %" stroke="#18ffff" fill="url(#cpuGrad)" strokeWidth={2} />
              <Area type="monotone" dataKey="ram" name="RAM %" stroke="#7c4dff" fill="url(#ramGrad)" strokeWidth={2} />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* PM2 프로세스 */}
      <div className="card">
        <div className="card-title">
          <span className="icon">⚙️</span> PM2 서비스
          <button className="btn btn-sm btn-secondary" style={{ marginLeft: 'auto' }}
            onClick={() => fetch('/api/system/pm2/restart', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({}) })}>
            🔄 전체 재시작
          </button>
        </div>
        {pm2.length === 0 ? (
          <p style={{ color: 'var(--text-muted)', fontSize: '13px' }}>PM2 프로세스 없음</p>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr><th>이름</th><th>상태</th><th>CPU</th><th>메모리</th><th>재시작</th></tr>
              </thead>
              <tbody>
                {pm2.map((p, i) => (
                  <tr key={i}>
                    <td style={{ fontFamily: 'var(--font-mono)' }}>{p.name}</td>
                    <td>
                      <span className={`badge ${p.status === 'online' ? 'badge-success' : 'badge-danger'}`}>
                        {p.status}
                      </span>
                    </td>
                    <td>{p.cpu}%</td>
                    <td>{p.memory ? (p.memory / 1048576).toFixed(0) + 'MB' : '-'}</td>
                    <td>{p.restarts}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Tailscale */}
      <div className="card">
        <div className="card-title"><span className="icon">🌐</span> Tailscale VPN</div>
        {tailscale?.connected ? (
          <div>
            <p style={{ color: 'var(--success)', marginBottom: 8 }}>
              ✅ 연결됨 — {tailscale.self?.hostname} ({tailscale.self?.ip})
            </p>
            {tailscale.peers?.length > 0 && (
              <div>
                <p style={{ color: 'var(--text-muted)', fontSize: 12, marginBottom: 4 }}>연결된 기기:</p>
                {tailscale.peers.map((p, i) => (
                  <span key={i} className={`badge ${p.online ? 'badge-success' : 'badge-warning'}`}
                    style={{ marginRight: 6, marginBottom: 4 }}>
                    {p.hostname} ({p.ip})
                  </span>
                ))}
              </div>
            )}
          </div>
        ) : (
          <p style={{ color: 'var(--warning)' }}>⚠️ Tailscale 미연결 — tailscale up 실행 필요</p>
        )}
      </div>
    </div>
  );
}
