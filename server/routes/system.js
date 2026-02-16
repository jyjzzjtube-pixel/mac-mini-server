/**
 * 시스템 모니터링 + 원격 제어 라우터
 */
const express = require('express');
const router = express.Router();
const si = require('systeminformation');
const os = require('os');
const { execSync, exec } = require('child_process');
const path = require('path');
const fs = require('fs');

/**
 * GET /api/system/info - 시스템 전체 정보
 */
router.get('/info', async (req, res) => {
  try {
    const [cpu, mem, disk, osInfo, time, temp] = await Promise.all([
      si.cpu(),
      si.mem(),
      si.fsSize(),
      si.osInfo(),
      si.time(),
      si.cpuTemperature().catch(() => ({ main: null }))
    ]);

    res.json({
      hostname: os.hostname(),
      platform: osInfo.platform,
      distro: osInfo.distro,
      arch: osInfo.arch,
      kernel: osInfo.kernel,
      uptime: os.uptime(),
      cpu: {
        model: cpu.brand,
        cores: cpu.physicalCores,
        threads: cpu.cores,
        speed: cpu.speed,
        temperature: temp?.main || null
      },
      memory: {
        total: mem.total,
        used: mem.used,
        free: mem.free,
        usedPercent: ((mem.used / mem.total) * 100).toFixed(1)
      },
      disk: disk.map(d => ({
        fs: d.fs,
        type: d.type,
        size: d.size,
        used: d.used,
        available: d.available,
        usedPercent: d.use
      })),
      time: {
        current: time.current,
        uptime: time.uptime,
        timezone: time.timezone
      }
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /api/system/realtime - 실시간 CPU/RAM (간략)
 */
router.get('/realtime', async (req, res) => {
  try {
    const [load, mem, temp] = await Promise.all([
      si.currentLoad(),
      si.mem(),
      si.cpuTemperature().catch(() => ({ main: null }))
    ]);

    res.json({
      cpu: {
        load: load.currentLoad?.toFixed(1) || '0',
        cores: load.cpus?.map(c => c.load?.toFixed(1)) || []
      },
      memory: {
        total: mem.total,
        used: mem.used,
        usedPercent: ((mem.used / mem.total) * 100).toFixed(1)
      },
      temperature: temp?.main || null,
      timestamp: new Date().toISOString()
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /api/system/processes - 프로세스 목록
 */
router.get('/processes', async (req, res) => {
  try {
    const procs = await si.processes();
    const top = procs.list
      .sort((a, b) => b.cpu - a.cpu)
      .slice(0, 20)
      .map(p => ({
        pid: p.pid,
        name: p.name,
        cpu: p.cpu?.toFixed(1),
        mem: p.mem?.toFixed(1),
        state: p.state,
        started: p.started
      }));

    res.json({
      total: procs.all,
      running: procs.running,
      blocked: procs.blocked,
      top
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /api/system/network - 네트워크 정보
 */
router.get('/network', async (req, res) => {
  try {
    const [interfaces, stats] = await Promise.all([
      si.networkInterfaces(),
      si.networkStats()
    ]);

    // Tailscale 인터페이스 찾기
    const tailscale = interfaces.find(i =>
      i.iface?.includes('tailscale') || i.iface?.includes('utun') || i.ip4?.startsWith('100.')
    );

    res.json({
      interfaces: interfaces.map(i => ({
        iface: i.iface,
        ip4: i.ip4,
        ip6: i.ip6,
        mac: i.mac,
        type: i.type,
        speed: i.speed,
        internal: i.internal
      })),
      stats: stats.map(s => ({
        iface: s.iface,
        rxBytes: s.rx_bytes,
        txBytes: s.tx_bytes,
        rxSec: s.rx_sec,
        txSec: s.tx_sec
      })),
      tailscale: tailscale ? {
        ip: tailscale.ip4,
        iface: tailscale.iface,
        connected: true
      } : { connected: false }
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /api/system/pm2 - PM2 프로세스 상태
 */
router.get('/pm2', async (req, res) => {
  try {
    const output = execSync('pm2 jlist 2>/dev/null || echo "[]"', { encoding: 'utf8' });
    const processes = JSON.parse(output);
    res.json({
      processes: processes.map(p => ({
        name: p.name,
        pid: p.pid,
        pm_id: p.pm_id,
        status: p.pm2_env?.status,
        cpu: p.monit?.cpu,
        memory: p.monit?.memory,
        uptime: p.pm2_env?.pm_uptime,
        restarts: p.pm2_env?.restart_time
      }))
    });
  } catch (err) {
    res.json({ processes: [], error: 'PM2 미설치 또는 실행 중 아님' });
  }
});

/**
 * POST /api/system/pm2/:action - PM2 제어
 */
router.post('/pm2/:action', (req, res) => {
  const { action } = req.params;
  const { name } = req.body;

  const allowed = ['restart', 'stop', 'start', 'reload'];
  if (!allowed.includes(action)) {
    return res.status(400).json({ error: '허용되지 않는 액션' });
  }

  try {
    const target = name || 'all';
    const output = execSync(`pm2 ${action} ${target}`, { encoding: 'utf8' });
    global.broadcast('pm2-action', { action, name: target });
    res.json({ success: true, output });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/system/exec - 명령어 실행 (보안 주의)
 */
router.post('/exec', (req, res) => {
  const { command } = req.body;
  if (!command) return res.status(400).json({ error: '명령어를 입력하세요' });

  // 위험한 명령어 차단
  const blocked = ['rm -rf /', 'mkfs', 'dd if=', ':(){', 'shutdown', 'reboot'];
  if (blocked.some(b => command.includes(b))) {
    return res.status(403).json({ error: '위험한 명령어입니다' });
  }

  exec(command, { timeout: 30000, maxBuffer: 1024 * 1024 }, (err, stdout, stderr) => {
    res.json({
      success: !err,
      stdout: stdout || '',
      stderr: stderr || '',
      error: err?.message
    });
  });
});

/**
 * GET /api/system/logs - 서버 로그 읽기
 */
router.get('/logs', (req, res) => {
  const { type = 'out', lines = 100 } = req.query;
  const logFile = path.join(__dirname, '..', '..', 'logs', `pm2-${type}.log`);

  if (!fs.existsSync(logFile)) {
    return res.json({ logs: '로그 파일 없음' });
  }

  try {
    const content = fs.readFileSync(logFile, 'utf8');
    const logLines = content.split('\n').slice(-parseInt(lines));
    res.json({ logs: logLines.join('\n') });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /api/system/tailscale - Tailscale 상태
 */
router.get('/tailscale', (req, res) => {
  try {
    const status = execSync('tailscale status --json 2>/dev/null || echo "{}"', { encoding: 'utf8' });
    const data = JSON.parse(status);
    res.json({
      connected: !!data.Self,
      self: data.Self ? {
        ip: data.Self.TailscaleIPs?.[0],
        hostname: data.Self.HostName,
        online: data.Self.Online
      } : null,
      peers: data.Peer ? Object.values(data.Peer).map(p => ({
        hostname: p.HostName,
        ip: p.TailscaleIPs?.[0],
        online: p.Online,
        lastSeen: p.LastSeen
      })) : []
    });
  } catch (err) {
    res.json({ connected: false, error: 'Tailscale 미설치' });
  }
});

module.exports = router;
