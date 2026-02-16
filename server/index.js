/**
 * 맥미니 M4 AI 홈서버 - 메인 엔트리포인트
 * Express + WebSocket + Cron Scheduler
 */
require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const compression = require('compression');
const rateLimit = require('express-rate-limit');
const path = require('path');
const http = require('http');
const { WebSocketServer } = require('ws');
const fs = require('fs');

// 라우터
const aiRouter = require('./routes/ai');
const driveRouter = require('./routes/drive');
const systemRouter = require('./routes/system');
const schedulerRouter = require('./routes/scheduler');
const authRouter = require('./routes/auth');
const kakaoRouter = require('./routes/kakao');

// 서비스
const { initScheduler } = require('./services/scheduler');
const { initSystemMonitor } = require('./services/systemMonitor');
const { initDB } = require('./services/database');

const app = express();
const server = http.createServer(app);

// WebSocket 서버
const wss = new WebSocketServer({ server, path: '/ws' });

// 로그 디렉토리 생성
const logsDir = path.join(__dirname, '..', 'logs');
const dataDir = path.join(__dirname, '..', 'data');
const uploadsDir = path.join(__dirname, '..', 'uploads');
[logsDir, dataDir, uploadsDir].forEach(dir => {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
});

// 미들웨어
app.use(helmet({ contentSecurityPolicy: false }));
app.use(cors());
app.use(compression());
app.use(morgan('short'));
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Rate Limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 200,
  message: { error: '너무 많은 요청입니다. 15분 후 다시 시도해주세요.' }
});
app.use('/api/', limiter);

// API 라우트
app.use('/api/ai', aiRouter);
app.use('/api/drive', driveRouter);
app.use('/api/system', systemRouter);
app.use('/api/scheduler', schedulerRouter);
app.use('/api/auth', authRouter);
app.use('/api/kakao', kakaoRouter);

// 정적 파일 (React 빌드)
const clientBuild = path.join(__dirname, '..', 'client', 'build');
if (fs.existsSync(clientBuild)) {
  app.use(express.static(clientBuild));
  app.get('*', (req, res) => {
    if (!req.path.startsWith('/api/') && !req.path.startsWith('/ws')) {
      res.sendFile(path.join(clientBuild, 'index.html'));
    }
  });
} else {
  // 개발 중일 때 기본 페이지
  app.get('/', (req, res) => {
    res.json({
      name: '맥미니 M4 AI 홈서버',
      version: '1.0.0',
      status: 'running',
      endpoints: {
        ai: '/api/ai',
        drive: '/api/drive',
        system: '/api/system',
        scheduler: '/api/scheduler',
        auth: '/api/auth',
        kakao: '/api/kakao',
        websocket: '/ws'
      }
    });
  });
}

// WebSocket 연결 관리
const wsClients = new Set();

wss.on('connection', (ws) => {
  wsClients.add(ws);
  console.log(`[WS] 클라이언트 연결 (총 ${wsClients.size}명)`);

  ws.on('close', () => {
    wsClients.delete(ws);
    console.log(`[WS] 클라이언트 해제 (총 ${wsClients.size}명)`);
  });

  ws.on('message', (data) => {
    try {
      const msg = JSON.parse(data);
      if (msg.type === 'ping') ws.send(JSON.stringify({ type: 'pong' }));
    } catch (e) { /* ignore */ }
  });

  // 연결 시 시스템 정보 전송
  ws.send(JSON.stringify({ type: 'connected', message: '맥미니 서버 연결 완료' }));
});

// 전역 broadcast 함수
global.broadcast = function(type, data) {
  const msg = JSON.stringify({ type, data, timestamp: new Date().toISOString() });
  wsClients.forEach(client => {
    if (client.readyState === 1) client.send(msg);
  });
};

// 에러 핸들러
app.use((err, req, res, next) => {
  console.error('[ERROR]', err.message);
  res.status(err.status || 500).json({
    error: err.message || '서버 내부 오류',
    stack: process.env.NODE_ENV === 'development' ? err.stack : undefined
  });
});

// 서버 시작
const PORT = process.env.PORT || 3000;

async function startServer() {
  try {
    // DB 초기화
    await initDB();
    console.log('[DB] SQLite 초기화 완료');

    // 스케줄러 시작
    initScheduler();
    console.log('[SCHEDULER] 크론 스케줄러 시작');

    // 시스템 모니터 시작
    initSystemMonitor();
    console.log('[MONITOR] 시스템 모니터 시작');

    server.listen(PORT, '0.0.0.0', () => {
      console.log('');
      console.log('╔══════════════════════════════════════════╗');
      console.log('║   🖥️  맥미니 M4 AI 홈서버 v1.0.0         ║');
      console.log(`║   🌐 http://localhost:${PORT}              ║`);
      console.log('║   📡 WebSocket: ws://localhost:' + PORT + '/ws   ║');
      console.log('║   🔒 Tailscale VPN으로 외부 접속          ║');
      console.log('╚══════════════════════════════════════════╝');
      console.log('');
    });
  } catch (err) {
    console.error('[FATAL] 서버 시작 실패:', err);
    process.exit(1);
  }
}

startServer();

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('[SERVER] SIGTERM 수신 - 종료 중...');
  server.close(() => process.exit(0));
});

process.on('SIGINT', () => {
  console.log('[SERVER] SIGINT 수신 - 종료 중...');
  server.close(() => process.exit(0));
});
