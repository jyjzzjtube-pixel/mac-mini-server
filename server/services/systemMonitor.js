/**
 * 시스템 모니터링 서비스
 * 실시간 CPU/RAM/온도 WebSocket 브로드캐스트
 */
const si = require('systeminformation');

let monitorInterval = null;

function initSystemMonitor() {
  // 10초마다 시스템 상태 브로드캐스트
  monitorInterval = setInterval(async () => {
    try {
      const [load, mem, temp, net] = await Promise.all([
        si.currentLoad(),
        si.mem(),
        si.cpuTemperature().catch(() => ({ main: null })),
        si.networkStats().catch(() => [])
      ]);

      const data = {
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
        network: net.length > 0 ? {
          rxSec: net[0].rx_sec || 0,
          txSec: net[0].tx_sec || 0
        } : null,
        timestamp: new Date().toISOString()
      };

      global.broadcast('system-stats', data);
    } catch (err) {
      // 무시 (클라이언트 없으면 그냥 skip)
    }
  }, 10000);

  console.log('[MONITOR] 10초 간격 시스템 모니터링 시작');
}

function stopSystemMonitor() {
  if (monitorInterval) {
    clearInterval(monitorInterval);
    monitorInterval = null;
  }
}

module.exports = { initSystemMonitor, stopSystemMonitor };
