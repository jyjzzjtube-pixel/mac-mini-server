/**
 * 자동화 스케줄러 라우터 (Cron 기반)
 */
const express = require('express');
const router = express.Router();
const { getDB } = require('../services/database');
const { addJob, removeJob, getJobs } = require('../services/scheduler');

/**
 * GET /api/scheduler/jobs - 등록된 작업 목록
 */
router.get('/jobs', (req, res) => {
  try {
    const db = getDB();
    const jobs = db.prepare('SELECT * FROM cron_jobs ORDER BY created_at DESC').all();
    const activeJobs = getJobs();

    const result = jobs.map(j => ({
      ...j,
      config: JSON.parse(j.config || '{}'),
      isRunning: activeJobs.has(j.id)
    }));

    res.json({ jobs: result });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/scheduler/jobs - 작업 추가
 */
router.post('/jobs', (req, res) => {
  try {
    const { name, cron, type, config = {} } = req.body;

    if (!name || !cron || !type) {
      return res.status(400).json({ error: 'name, cron, type 필수' });
    }

    // 지원하는 작업 유형
    const validTypes = [
      'drive-sync',      // Google Drive 동기화
      'backup',          // 데이터 백업
      'ai-report',       // AI 일일 리포트 생성
      'health-check',    // 서비스 헬스체크
      'cleanup',         // 임시파일 정리
      'email-check',     // 이메일 확인
      'custom-command'   // 커스텀 명령어
    ];

    if (!validTypes.includes(type)) {
      return res.status(400).json({ error: `유효한 타입: ${validTypes.join(', ')}` });
    }

    const db = getDB();
    const stmt = db.prepare(
      'INSERT INTO cron_jobs (name, cron_expression, type, config, enabled) VALUES (?, ?, ?, ?, 1)'
    );
    const result = stmt.run(name, cron, type, JSON.stringify(config));

    const job = {
      id: result.lastInsertRowid,
      name, cron_expression: cron, type,
      config, enabled: 1
    };

    // 크론 작업 등록
    addJob(job);

    global.broadcast('scheduler-add', { name, cron, type });
    res.json({ success: true, job });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * PUT /api/scheduler/jobs/:id - 작업 수정
 */
router.put('/jobs/:id', (req, res) => {
  try {
    const { name, cron, config, enabled } = req.body;
    const db = getDB();

    const existing = db.prepare('SELECT * FROM cron_jobs WHERE id = ?').get(req.params.id);
    if (!existing) return res.status(404).json({ error: '작업을 찾을 수 없습니다' });

    const updates = [];
    const values = [];

    if (name !== undefined) { updates.push('name = ?'); values.push(name); }
    if (cron !== undefined) { updates.push('cron_expression = ?'); values.push(cron); }
    if (config !== undefined) { updates.push('config = ?'); values.push(JSON.stringify(config)); }
    if (enabled !== undefined) { updates.push('enabled = ?'); values.push(enabled ? 1 : 0); }

    if (updates.length === 0) return res.status(400).json({ error: '수정할 내용 없음' });

    values.push(req.params.id);
    db.prepare(`UPDATE cron_jobs SET ${updates.join(', ')} WHERE id = ?`).run(...values);

    // 크론 재등록
    removeJob(parseInt(req.params.id));
    const updated = db.prepare('SELECT * FROM cron_jobs WHERE id = ?').get(req.params.id);
    if (updated.enabled) {
      addJob({ ...updated, config: JSON.parse(updated.config || '{}') });
    }

    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * DELETE /api/scheduler/jobs/:id - 작업 삭제
 */
router.delete('/jobs/:id', (req, res) => {
  try {
    const db = getDB();
    removeJob(parseInt(req.params.id));
    db.prepare('DELETE FROM cron_jobs WHERE id = ?').run(req.params.id);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/scheduler/jobs/:id/run - 즉시 실행
 */
router.post('/jobs/:id/run', async (req, res) => {
  try {
    const db = getDB();
    const job = db.prepare('SELECT * FROM cron_jobs WHERE id = ?').get(req.params.id);
    if (!job) return res.status(404).json({ error: '작업을 찾을 수 없습니다' });

    const { executeJob } = require('../services/scheduler');
    const result = await executeJob({ ...job, config: JSON.parse(job.config || '{}') });

    res.json({ success: true, result });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /api/scheduler/logs - 실행 이력
 */
router.get('/logs', (req, res) => {
  try {
    const { jobId, limit = 50 } = req.query;
    const db = getDB();

    let query = 'SELECT * FROM cron_logs ORDER BY executed_at DESC LIMIT ?';
    let params = [parseInt(limit)];

    if (jobId) {
      query = 'SELECT * FROM cron_logs WHERE job_id = ? ORDER BY executed_at DESC LIMIT ?';
      params = [jobId, parseInt(limit)];
    }

    const logs = db.prepare(query).all(...params);
    res.json({ logs });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /api/scheduler/presets - 프리셋 목록
 */
router.get('/presets', (req, res) => {
  res.json({
    presets: [
      { name: '매일 백업', cron: '0 2 * * *', type: 'backup', desc: '매일 새벽 2시' },
      { name: 'Drive 동기화 (30분)', cron: '*/30 * * * *', type: 'drive-sync', desc: '30분마다' },
      { name: '일일 AI 리포트', cron: '0 9 * * *', type: 'ai-report', desc: '매일 오전 9시' },
      { name: '헬스체크 (5분)', cron: '*/5 * * * *', type: 'health-check', desc: '5분마다' },
      { name: '임시파일 정리', cron: '0 3 * * 0', type: 'cleanup', desc: '매주 일요일 새벽 3시' },
      { name: '이메일 확인 (10분)', cron: '*/10 * * * *', type: 'email-check', desc: '10분마다' }
    ]
  });
});

module.exports = router;
