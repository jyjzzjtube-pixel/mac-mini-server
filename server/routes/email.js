/**
 * 이메일 자동화 라우터
 * naver → gmail 전달 → Gemini 요약 → Claude 분류 → Drive 업로드
 */
const express = require('express');
const router = express.Router();
const { checkAndProcessEmails, getEmailStats } = require('../services/emailService');

/**
 * GET /api/email/status - 이메일 연동 상태
 */
router.get('/status', async (req, res) => {
  try {
    const stats = await getEmailStats();
    res.json(stats);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/email/check - 수동 이메일 확인 + AI 처리
 */
router.post('/check', async (req, res) => {
  try {
    const result = await checkAndProcessEmails();
    res.json({ success: true, ...result });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /api/email/history - 처리 이력
 */
router.get('/history', (req, res) => {
  try {
    const { getDB } = require('../services/database');
    const db = getDB();
    const { limit = 30 } = req.query;

    const history = db.prepare(`
      SELECT * FROM notifications
      WHERE type = 'email'
      ORDER BY created_at DESC
      LIMIT ?
    `).all(parseInt(limit));

    res.json({ history });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /api/email/drive-uploads - Drive 업로드 이력
 */
router.get('/drive-uploads', (req, res) => {
  try {
    const { getDB } = require('../services/database');
    const db = getDB();
    const { limit = 30 } = req.query;

    const uploads = db.prepare(`
      SELECT * FROM drive_sync_log
      WHERE action = 'classify'
      ORDER BY synced_at DESC
      LIMIT ?
    `).all(parseInt(limit));

    res.json({ uploads });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /api/email/setup-guide - 네이버 자동 전달 설정 가이드
 */
router.get('/setup-guide', (req, res) => {
  res.json({
    steps: [
      {
        step: 1,
        title: '네이버 메일 자동 전달 설정',
        description: 'jyjzzj1@naver.com 접속 → 설정 → 메일 자동 전달',
        detail: [
          '네이버 메일 (mail.naver.com) 로그인',
          '우측 상단 ⚙️ 설정 클릭',
          '좌측 메뉴에서 "메일 자동전달" 선택',
          '전달 주소: jyjzzjtube@gmail.com 입력',
          '"받은 메일 자동 전달" 활성화',
          '인증 메일 확인 후 완료'
        ]
      },
      {
        step: 2,
        title: 'Google OAuth 연결',
        description: '대시보드에서 Google 계정 연결',
        detail: [
          '맥미니 서버 대시보드 접속',
          '설정 → Google 계정 연결',
          'Gmail + Drive 권한 승인',
          '자동 토큰 갱신 활성화됨'
        ]
      },
      {
        step: 3,
        title: '스케줄러 등록',
        description: '10분마다 자동 이메일 확인',
        detail: [
          '스케줄러 탭 → "이메일 확인" 프리셋 사용',
          '또는 직접 등록: */10 * * * * (10분마다)',
          'AI가 자동으로 요약 + 분류 + Drive 업로드'
        ]
      }
    ],
    automation_flow: {
      '1_receive': 'naver → gmail 자동 전달',
      '2_detect': 'Gmail API polling (10분 간격)',
      '3_summarize': 'Gemini가 이메일 읽고 요약',
      '4_notify': 'WebSocket 알림 → 모바일 브라우저',
      '5_classify': 'AI가 첨부파일 카테고리 분류',
      '6_upload': 'Google Drive 폴더별 자동 업로드'
    }
  });
});

module.exports = router;
