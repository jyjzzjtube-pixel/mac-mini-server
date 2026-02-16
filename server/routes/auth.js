/**
 * 인증 라우터 - Google OAuth2 + 로그인
 */
const express = require('express');
const router = express.Router();
const { google } = require('googleapis');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const TOKEN_PATH = path.join(__dirname, '..', '..', 'data', 'google-token.json');
const SESSION_PATH = path.join(__dirname, '..', '..', 'data', 'sessions.json');

function getOAuth2Client() {
  return new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    process.env.GOOGLE_REDIRECT_URI
  );
}

/**
 * POST /api/auth/login - 관리자 로그인
 */
router.post('/login', (req, res) => {
  const { password } = req.body;
  if (password !== process.env.ADMIN_PASSWORD) {
    return res.status(401).json({ error: '비밀번호가 틀렸습니다' });
  }

  const token = crypto.randomBytes(32).toString('hex');
  const sessions = loadSessions();
  sessions[token] = {
    created: new Date().toISOString(),
    expires: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString()
  };
  saveSessions(sessions);

  res.json({ success: true, token });
});

/**
 * POST /api/auth/verify - 토큰 검증
 */
router.post('/verify', (req, res) => {
  const { token } = req.body;
  const sessions = loadSessions();
  const session = sessions[token];

  if (!session || new Date(session.expires) < new Date()) {
    return res.status(401).json({ valid: false });
  }

  res.json({ valid: true });
});

/**
 * GET /api/auth/google - Google OAuth URL 생성
 */
router.get('/google', (req, res) => {
  const oauth2 = getOAuth2Client();
  const url = oauth2.generateAuthUrl({
    access_type: 'offline',
    scope: [
      'https://www.googleapis.com/auth/drive',
      'https://www.googleapis.com/auth/gmail.readonly',
      'https://www.googleapis.com/auth/gmail.send'
    ],
    prompt: 'consent'
  });
  res.json({ url });
});

/**
 * GET /api/auth/google/callback - Google OAuth 콜백
 */
router.get('/google/callback', async (req, res) => {
  try {
    const { code } = req.query;
    if (!code) return res.status(400).send('인증 코드가 없습니다');

    const oauth2 = getOAuth2Client();
    const { tokens } = await oauth2.getToken(code);

    // 토큰 저장
    const dataDir = path.dirname(TOKEN_PATH);
    if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });
    fs.writeFileSync(TOKEN_PATH, JSON.stringify(tokens, null, 2));

    global.broadcast('google-auth', { connected: true });

    res.send(`
      <html>
        <body style="background:#1a1a2e;color:#18ffff;font-family:sans-serif;display:flex;justify-content:center;align-items:center;height:100vh;margin:0">
          <div style="text-align:center">
            <h1>✅ Google 연결 완료!</h1>
            <p>이 창을 닫고 대시보드로 돌아가세요.</p>
            <script>setTimeout(()=>window.close(), 3000)</script>
          </div>
        </body>
      </html>
    `);
  } catch (err) {
    res.status(500).send(`인증 오류: ${err.message}`);
  }
});

/**
 * GET /api/auth/google/status - Google 연결 상태
 */
router.get('/google/status', (req, res) => {
  const connected = fs.existsSync(TOKEN_PATH);
  let info = null;

  if (connected) {
    try {
      const tokens = JSON.parse(fs.readFileSync(TOKEN_PATH, 'utf8'));
      info = {
        hasAccessToken: !!tokens.access_token,
        hasRefreshToken: !!tokens.refresh_token,
        expiryDate: tokens.expiry_date ? new Date(tokens.expiry_date).toISOString() : null
      };
    } catch (e) { /* ignore */ }
  }

  res.json({ connected, info });
});

/**
 * POST /api/auth/google/disconnect - Google 연결 해제
 */
router.post('/google/disconnect', (req, res) => {
  if (fs.existsSync(TOKEN_PATH)) {
    fs.unlinkSync(TOKEN_PATH);
  }
  res.json({ success: true });
});

// 세션 헬퍼
function loadSessions() {
  try {
    if (fs.existsSync(SESSION_PATH)) {
      return JSON.parse(fs.readFileSync(SESSION_PATH, 'utf8'));
    }
  } catch (e) { /* ignore */ }
  return {};
}

function saveSessions(sessions) {
  const dir = path.dirname(SESSION_PATH);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(SESSION_PATH, JSON.stringify(sessions, null, 2));
}

module.exports = router;
