/**
 * Cron 스케줄러 서비스
 * node-cron 기반 자동화 작업 실행
 */
const cron = require('node-cron');
const axios = require('axios');
const fs = require('fs');
const path = require('path');

const activeJobs = new Map();

/**
 * 스케줄러 초기화 - DB에서 활성 작업 로드
 */
function initScheduler() {
  try {
    const { getDB } = require('./database');
    const db = getDB();
    const jobs = db.prepare('SELECT * FROM cron_jobs WHERE enabled = 1').all();

    jobs.forEach(job => {
      addJob({ ...job, config: JSON.parse(job.config || '{}') });
    });

    console.log(`[SCHEDULER] ${jobs.length}개 작업 로드됨`);
  } catch (err) {
    console.error('[SCHEDULER] 초기화 오류:', err.message);
  }
}

/**
 * 작업 추가
 */
function addJob(job) {
  if (!cron.validate(job.cron_expression)) {
    console.error(`[SCHEDULER] 유효하지 않은 크론 표현식: ${job.cron_expression}`);
    return;
  }

  // 기존 작업 제거
  if (activeJobs.has(job.id)) {
    activeJobs.get(job.id).stop();
  }

  const task = cron.schedule(job.cron_expression, async () => {
    console.log(`[SCHEDULER] 실행: ${job.name} (${job.type})`);
    try {
      await executeJob(job);
    } catch (err) {
      console.error(`[SCHEDULER] 실행 오류 (${job.name}):`, err.message);
    }
  });

  activeJobs.set(job.id, task);
  console.log(`[SCHEDULER] 등록: ${job.name} (${job.cron_expression})`);
}

/**
 * 작업 제거
 */
function removeJob(jobId) {
  if (activeJobs.has(jobId)) {
    activeJobs.get(jobId).stop();
    activeJobs.delete(jobId);
  }
}

/**
 * 활성 작업 목록
 */
function getJobs() {
  return activeJobs;
}

/**
 * 작업 실행
 */
async function executeJob(job) {
  const start = Date.now();
  let status = 'success';
  let message = '';

  try {
    switch (job.type) {
      case 'health-check':
        message = await healthCheck();
        break;

      case 'drive-sync':
        message = await driveSync(job.config);
        break;

      case 'backup':
        message = await backupData();
        break;

      case 'ai-report':
        message = await generateAIReport(job.config);
        break;

      case 'cleanup':
        message = await cleanupTemp();
        break;

      case 'email-check':
        message = await checkEmail(job.config);
        break;

      case 'custom-command':
        message = await runCommand(job.config);
        break;

      default:
        message = `알 수 없는 작업 유형: ${job.type}`;
        status = 'error';
    }
  } catch (err) {
    status = 'error';
    message = err.message;
  }

  const duration = Date.now() - start;

  // 로그 기록
  try {
    const { getDB } = require('./database');
    const db = getDB();
    db.prepare(
      'INSERT INTO cron_logs (job_id, status, message, duration_ms) VALUES (?, ?, ?, ?)'
    ).run(job.id, status, message, duration);

    db.prepare(
      'UPDATE cron_jobs SET last_run = datetime("now", "localtime") WHERE id = ?'
    ).run(job.id);
  } catch (e) { /* ignore */ }

  // WebSocket 알림
  global.broadcast('scheduler-run', {
    jobName: job.name,
    type: job.type,
    status,
    duration,
    message: message.substring(0, 200)
  });

  return { status, message, duration };
}

// ─── 작업 실행 함수들 ────────────────────────────

async function healthCheck() {
  const si = require('systeminformation');
  const [load, mem, temp] = await Promise.all([
    si.currentLoad(),
    si.mem(),
    si.cpuTemperature().catch(() => ({ main: null }))
  ]);

  const cpuLoad = load.currentLoad?.toFixed(1) || 0;
  const memPercent = ((mem.used / mem.total) * 100).toFixed(1);

  // 메트릭 기록
  try {
    const { getDB } = require('./database');
    const db = getDB();
    db.prepare(
      'INSERT INTO system_metrics (cpu_load, mem_used_percent, temperature) VALUES (?, ?, ?)'
    ).run(parseFloat(cpuLoad), parseFloat(memPercent), temp?.main || null);
  } catch (e) { /* ignore */ }

  // 경고 체크
  const warnings = [];
  if (parseFloat(cpuLoad) > 80) warnings.push(`CPU 과부하: ${cpuLoad}%`);
  if (parseFloat(memPercent) > 90) warnings.push(`메모리 부족: ${memPercent}%`);
  if (temp?.main && temp.main > 80) warnings.push(`온도 높음: ${temp.main}°C`);

  if (warnings.length > 0) {
    global.broadcast('alert', { type: 'warning', messages: warnings });
  }

  return `CPU: ${cpuLoad}%, RAM: ${memPercent}%` + (warnings.length ? ` ⚠️ ${warnings.join(', ')}` : ' ✅');
}

async function driveSync(config) {
  if (!config.localPath || !config.driveFolderId) {
    return '동기화 설정이 필요합니다 (localPath, driveFolderId)';
  }

  const port = process.env.PORT || 3000;
  const resp = await axios.post(`http://localhost:${port}/api/drive/sync`, config, { timeout: 120000 });
  const r = resp.data.results;
  return `업로드: ${r.uploaded.length}개, 다운로드: ${r.downloaded.length}개, 오류: ${r.errors.length}개`;
}

async function backupData() {
  const dataDir = path.join(__dirname, '..', '..', 'data');
  const backupDir = path.join(__dirname, '..', '..', 'backups');
  if (!fs.existsSync(backupDir)) fs.mkdirSync(backupDir, { recursive: true });

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const backupFile = path.join(backupDir, `backup-${timestamp}.json`);

  // DB 데이터 백업
  const { getDB } = require('./database');
  const db = getDB();

  const data = {
    timestamp: new Date().toISOString(),
    cron_jobs: db.prepare('SELECT * FROM cron_jobs').all(),
    ai_history: db.prepare('SELECT * FROM ai_history ORDER BY id DESC LIMIT 1000').all(),
    drive_sync_log: db.prepare('SELECT * FROM drive_sync_log ORDER BY id DESC LIMIT 500').all(),
    kakao_messages: db.prepare('SELECT * FROM kakao_messages ORDER BY id DESC LIMIT 500').all(),
    notifications: db.prepare('SELECT * FROM notifications ORDER BY id DESC LIMIT 200').all()
  };

  fs.writeFileSync(backupFile, JSON.stringify(data, null, 2));

  // 30일 이상 된 백업 삭제
  const files = fs.readdirSync(backupDir);
  const cutoff = Date.now() - 30 * 24 * 60 * 60 * 1000;
  files.forEach(f => {
    const fp = path.join(backupDir, f);
    if (fs.statSync(fp).mtime.getTime() < cutoff) fs.unlinkSync(fp);
  });

  return `백업 완료: ${backupFile}`;
}

async function generateAIReport(config) {
  const port = process.env.PORT || 3000;
  const { getDB } = require('./database');
  const db = getDB();

  // 최근 24시간 메트릭
  const metrics = db.prepare(
    "SELECT * FROM system_metrics WHERE recorded_at > datetime('now', '-1 day', 'localtime') ORDER BY recorded_at"
  ).all();

  const avgCPU = metrics.reduce((s, m) => s + m.cpu_load, 0) / (metrics.length || 1);
  const avgMem = metrics.reduce((s, m) => s + m.mem_used_percent, 0) / (metrics.length || 1);

  // AI로 리포트 생성
  const prompt = `맥미니 M4 AI 홈서버 일일 리포트를 작성해주세요:
- 평균 CPU: ${avgCPU.toFixed(1)}%
- 평균 메모리: ${avgMem.toFixed(1)}%
- 메트릭 포인트: ${metrics.length}개
- 최고 CPU: ${Math.max(...metrics.map(m => m.cpu_load), 0).toFixed(1)}%
한국어로 간결하게 요약해주세요.`;

  try {
    const resp = await axios.post(`http://localhost:${port}/api/ai/chat`, {
      message: prompt, model: 'gemini'
    }, { timeout: 30000 });

    const report = resp.data.response;

    // 알림 저장
    db.prepare(
      'INSERT INTO notifications (type, title, message) VALUES (?, ?, ?)'
    ).run('report', '📊 일일 리포트', report.substring(0, 500));

    return `리포트 생성 완료 (${report.length}자)`;
  } catch (e) {
    return `리포트 생성 실패: ${e.message}`;
  }
}

async function cleanupTemp() {
  const dirs = [
    path.join(__dirname, '..', '..', 'uploads'),
    path.join(__dirname, '..', '..', 'logs')
  ];

  let cleaned = 0;
  const cutoff = Date.now() - 7 * 24 * 60 * 60 * 1000; // 7일

  dirs.forEach(dir => {
    if (!fs.existsSync(dir)) return;
    fs.readdirSync(dir).forEach(f => {
      const fp = path.join(dir, f);
      try {
        if (fs.statSync(fp).mtime.getTime() < cutoff) {
          fs.unlinkSync(fp);
          cleaned++;
        }
      } catch (e) { /* ignore */ }
    });
  });

  return `${cleaned}개 파일 정리됨`;
}

async function checkEmail(config) {
  // 이메일 자동화 서비스 호출 (요약 + 분류 + Drive 업로드)
  try {
    const { checkAndProcessEmails } = require('./emailService');
    const result = await checkAndProcessEmails();

    if (result.error) return `이메일 확인 실패: ${result.error}`;
    if (result.processed === 0) return '새 이메일 없음 ✅';

    const details = result.results?.map(r =>
      `📧 ${r.subject} (첨부: ${r.attachments}개, Drive: ${r.driveUploads}개)`
    ).join(', ') || '';

    return `${result.processed}개 이메일 처리 완료. ${details}`;
  } catch (e) {
    return `이메일 확인 실패: ${e.message}`;
  }
}

async function runCommand(config) {
  if (!config.command) return '명령어가 설정되지 않았습니다';

  const { exec } = require('child_process');
  return new Promise((resolve) => {
    exec(config.command, { timeout: 30000 }, (err, stdout, stderr) => {
      if (err) resolve(`오류: ${err.message}`);
      else resolve(stdout || stderr || '완료');
    });
  });
}

module.exports = { initScheduler, addJob, removeJob, getJobs, executeJob };
