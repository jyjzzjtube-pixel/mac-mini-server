/**
 * SQLite 데이터베이스 서비스
 * better-sqlite3 사용 (동기식, 빠름)
 */
const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

let db = null;

function initDB() {
  const dbPath = path.join(__dirname, '..', '..', 'data', 'server.db');
  const dir = path.dirname(dbPath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

  db = new Database(dbPath);

  // WAL 모드 (성능 향상)
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');

  // 테이블 생성
  db.exec(`
    -- 크론 작업
    CREATE TABLE IF NOT EXISTS cron_jobs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      cron_expression TEXT NOT NULL,
      type TEXT NOT NULL,
      config TEXT DEFAULT '{}',
      enabled INTEGER DEFAULT 1,
      last_run TEXT,
      next_run TEXT,
      created_at TEXT DEFAULT (datetime('now', 'localtime')),
      updated_at TEXT DEFAULT (datetime('now', 'localtime'))
    );

    -- 크론 실행 이력
    CREATE TABLE IF NOT EXISTS cron_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      job_id INTEGER,
      status TEXT CHECK(status IN ('success', 'error', 'running')),
      message TEXT,
      duration_ms INTEGER,
      executed_at TEXT DEFAULT (datetime('now', 'localtime')),
      FOREIGN KEY (job_id) REFERENCES cron_jobs(id) ON DELETE CASCADE
    );

    -- AI 채팅 이력
    CREATE TABLE IF NOT EXISTS ai_history (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      session_id TEXT,
      model TEXT,
      role TEXT CHECK(role IN ('user', 'assistant')),
      content TEXT,
      tokens_used INTEGER DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now', 'localtime'))
    );

    -- Google Drive 동기화 이력
    CREATE TABLE IF NOT EXISTS drive_sync_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      action TEXT CHECK(action IN ('upload', 'download', 'sync', 'classify')),
      filename TEXT,
      drive_id TEXT,
      folder_path TEXT,
      category TEXT,
      status TEXT,
      synced_at TEXT DEFAULT (datetime('now', 'localtime'))
    );

    -- 카카오톡 메시지 이력
    CREATE TABLE IF NOT EXISTS kakao_messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      sender TEXT,
      chat_room TEXT,
      message TEXT,
      file_name TEXT,
      file_type TEXT,
      analysis TEXT,
      drive_file_id TEXT,
      received_at TEXT DEFAULT (datetime('now', 'localtime'))
    );

    -- 시스템 성능 이력 (차트용)
    CREATE TABLE IF NOT EXISTS system_metrics (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      cpu_load REAL,
      mem_used_percent REAL,
      disk_used_percent REAL,
      temperature REAL,
      network_rx REAL,
      network_tx REAL,
      recorded_at TEXT DEFAULT (datetime('now', 'localtime'))
    );

    -- 알림 이력
    CREATE TABLE IF NOT EXISTS notifications (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      type TEXT,
      title TEXT,
      message TEXT,
      read INTEGER DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now', 'localtime'))
    );
  `);

  // 기본 크론 작업 등록 (빈 테이블일 때만)
  const count = db.prepare('SELECT COUNT(*) as cnt FROM cron_jobs').get();
  if (count.cnt === 0) {
    const stmt = db.prepare(
      'INSERT INTO cron_jobs (name, cron_expression, type, config, enabled) VALUES (?, ?, ?, ?, ?)'
    );
    stmt.run('시스템 메트릭 수집', '*/5 * * * *', 'health-check', '{}', 1);
    stmt.run('임시파일 정리', '0 3 * * 0', 'cleanup', '{}', 1);
  }

  return db;
}

function getDB() {
  if (!db) throw new Error('DB가 초기화되지 않았습니다');
  return db;
}

module.exports = { initDB, getDB };
