/**
 * 카카오톡 → Google Drive 자동 업로드 라우터
 * 카카오톡에서 받은 파일/이미지를 자동 분류 후 Drive 업로드
 */
const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const axios = require('axios');

const upload = multer({ dest: path.join(__dirname, '..', '..', 'uploads') });

/**
 * POST /api/kakao/webhook - 카카오톡 웹훅 (파일 수신)
 * 카카오 비즈메시지 or 커스텀 봇에서 호출
 */
router.post('/webhook', upload.single('file'), async (req, res) => {
  try {
    const { message, senderName, chatRoom, fileUrl } = req.body;
    let fileData = req.file;

    console.log(`[KAKAO] 메시지 수신: ${senderName} (${chatRoom}): ${message || '파일'}`);

    // URL로 받은 파일 다운로드
    if (fileUrl && !fileData) {
      const resp = await axios.get(fileUrl, { responseType: 'arraybuffer' });
      const tmpPath = path.join(__dirname, '..', '..', 'uploads', `kakao_${Date.now()}`);
      fs.writeFileSync(tmpPath, resp.data);
      fileData = {
        path: tmpPath,
        originalname: path.basename(fileUrl),
        mimetype: resp.headers['content-type'] || 'application/octet-stream'
      };
    }

    // AI 분석
    let analysis = null;
    if (fileData) {
      const isImage = fileData.mimetype?.startsWith('image/');
      if (isImage) {
        // 이미지 → Gemini Vision 분석
        const imgBase64 = fs.readFileSync(fileData.path, 'base64');
        analysis = await analyzeImage(imgBase64, fileData.mimetype);
      } else {
        // 텍스트/문서 → 내용 분석
        try {
          const content = fs.readFileSync(fileData.path, 'utf8');
          analysis = await analyzeText(content, fileData.originalname);
        } catch (e) {
          analysis = { category: '기타', summary: '바이너리 파일' };
        }
      }
    } else if (message) {
      // 텍스트 메시지 분석
      analysis = await analyzeText(message, 'kakao-message');
    }

    // Drive 업로드 (파일이 있는 경우)
    let driveResult = null;
    if (fileData && process.env.GOOGLE_CLIENT_ID) {
      try {
        const driveResp = await axios.post('http://localhost:' + (process.env.PORT || 3000) + '/api/drive/classify-upload', {
          ...fileData,
          baseFolderId: process.env.KAKAO_DRIVE_FOLDER_ID
        });
        driveResult = driveResp.data;
      } catch (e) {
        console.error('[KAKAO] Drive 업로드 실패:', e.message);
      }
    }

    // WebSocket 알림
    global.broadcast('kakao-message', {
      sender: senderName,
      chatRoom,
      message: message?.substring(0, 100),
      hasFile: !!fileData,
      analysis,
      driveUploaded: !!driveResult
    });

    // 임시파일 정리
    if (fileData?.path && fs.existsSync(fileData.path)) {
      fs.unlinkSync(fileData.path);
    }

    res.json({
      success: true,
      analysis,
      driveResult: driveResult?.success ? driveResult : null
    });
  } catch (err) {
    console.error('[KAKAO] 오류:', err.message);
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/kakao/manual-upload - 수동 파일 업로드 (카톡 대화 내보내기)
 */
router.post('/manual-upload', upload.array('files', 50), async (req, res) => {
  try {
    const results = [];

    for (const file of req.files) {
      let analysis;
      if (file.mimetype.startsWith('image/')) {
        const imgBase64 = fs.readFileSync(file.path, 'base64');
        analysis = await analyzeImage(imgBase64, file.mimetype);
      } else {
        const content = fs.readFileSync(file.path, 'utf8').substring(0, 5000);
        analysis = await analyzeText(content, file.originalname);
      }

      results.push({
        filename: file.originalname,
        analysis
      });

      if (fs.existsSync(file.path)) fs.unlinkSync(file.path);
    }

    res.json({ success: true, results });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /api/kakao/history - 수신 이력
 */
router.get('/history', (req, res) => {
  try {
    const { getDB } = require('../services/database');
    const db = getDB();
    const { limit = 50 } = req.query;
    const history = db.prepare(
      'SELECT * FROM kakao_messages ORDER BY received_at DESC LIMIT ?'
    ).all(parseInt(limit));
    res.json({ history });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── AI 분석 헬퍼 ────────────────────────────

async function analyzeImage(base64Data, mimeType) {
  const key = process.env.GEMINI_API_KEY;
  if (!key) return { category: '기타', summary: 'API 키 없음' };

  try {
    const resp = await axios.post(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${key}`,
      {
        contents: [{
          parts: [
            { inlineData: { mimeType, data: base64Data } },
            { text: '이 이미지를 분석해주세요. JSON만 반환: {"category":"세무|계약|영수증|명함|기타","summary":"한줄요약","keywords":["키워드"]}' }
          ]
        }]
      },
      { timeout: 30000 }
    );

    const text = resp.data.candidates?.[0]?.content?.parts?.[0]?.text || '';
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    return jsonMatch ? JSON.parse(jsonMatch[0]) : { category: '기타', summary: text.substring(0, 100) };
  } catch (e) {
    return { category: '기타', summary: e.message };
  }
}

async function analyzeText(content, filename) {
  const key = process.env.GEMINI_API_KEY;
  if (!key) return { category: '기타', summary: 'API 키 없음' };

  try {
    const resp = await axios.post(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${key}`,
      {
        contents: [{
          parts: [{
            text: `파일명: ${filename}\n내용:\n${content.substring(0, 3000)}\n\nJSON만 반환: {"category":"세무|계약|상담|마케팅|인사|기타","summary":"한줄요약","keywords":["키워드"]}`
          }]
        }]
      },
      { timeout: 30000 }
    );

    const text = resp.data.candidates?.[0]?.content?.parts?.[0]?.text || '';
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    return jsonMatch ? JSON.parse(jsonMatch[0]) : { category: '기타', summary: text.substring(0, 100) };
  } catch (e) {
    return { category: '기타', summary: e.message };
  }
}

module.exports = router;
