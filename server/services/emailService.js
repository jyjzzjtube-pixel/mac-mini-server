/**
 * 이메일 자동화 서비스
 *
 * 흐름:
 * 1. jyjzzj1@naver.com → jyjzzjtube@gmail.com (네이버 자체 설정)
 * 2. Gmail 수신 감지 (Gmail API polling)
 * 3. Gemini가 이메일 내용 읽고 → 요약/알림 전송
 * 4. Claude가 첨부파일 분류 → Google Drive 폴더별 업로드
 */
const { google } = require('googleapis');
const fs = require('fs');
const path = require('path');
const axios = require('axios');

const TOKEN_PATH = path.join(__dirname, '..', '..', 'data', 'google-token.json');
const PROCESSED_PATH = path.join(__dirname, '..', '..', 'data', 'processed-emails.json');

/**
 * Gmail 인증 클라이언트
 */
function getGmailAuth() {
  if (!fs.existsSync(TOKEN_PATH)) return null;

  const oauth2 = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    process.env.GOOGLE_REDIRECT_URI
  );
  const tokens = JSON.parse(fs.readFileSync(TOKEN_PATH, 'utf8'));
  oauth2.setCredentials(tokens);

  oauth2.on('tokens', (newTokens) => {
    const existing = JSON.parse(fs.readFileSync(TOKEN_PATH, 'utf8'));
    fs.writeFileSync(TOKEN_PATH, JSON.stringify({ ...existing, ...newTokens }, null, 2));
  });

  return oauth2;
}

/**
 * 처리 완료된 이메일 ID 관리
 */
function getProcessedIds() {
  try {
    if (fs.existsSync(PROCESSED_PATH)) {
      return JSON.parse(fs.readFileSync(PROCESSED_PATH, 'utf8'));
    }
  } catch (e) { /* ignore */ }
  return [];
}

function saveProcessedId(msgId) {
  const ids = getProcessedIds();
  ids.push(msgId);
  // 최근 500개만 유지
  const trimmed = ids.slice(-500);
  fs.writeFileSync(PROCESSED_PATH, JSON.stringify(trimmed));
}

/**
 * 새 이메일 확인 + AI 처리
 */
async function checkAndProcessEmails() {
  const auth = getGmailAuth();
  if (!auth) return { error: 'Google 인증 필요' };

  const gmail = google.gmail({ version: 'v1', auth });
  const processed = getProcessedIds();

  try {
    // 미읽은 이메일 조회 (from:naver or 최근 전달된 것)
    const listResp = await gmail.users.messages.list({
      userId: 'me',
      q: 'is:unread',
      maxResults: 10
    });

    const messages = listResp.data.messages || [];
    if (messages.length === 0) return { processed: 0, message: '새 이메일 없음' };

    let processedCount = 0;
    const results = [];

    for (const msg of messages) {
      if (processed.includes(msg.id)) continue;

      try {
        // 이메일 전체 내용 가져오기
        const emailData = await gmail.users.messages.get({
          userId: 'me',
          id: msg.id,
          format: 'full'
        });

        const headers = emailData.data.payload?.headers || [];
        const subject = headers.find(h => h.name === 'Subject')?.value || '(제목 없음)';
        const from = headers.find(h => h.name === 'From')?.value || '알 수 없음';
        const date = headers.find(h => h.name === 'Date')?.value || '';

        // 본문 추출
        const body = extractBody(emailData.data.payload);

        // 1단계: Gemini로 이메일 요약 + 알림
        const summary = await geminiSummarize(subject, from, body);

        // WebSocket 알림
        global.broadcast('email-notification', {
          subject,
          from,
          summary,
          date,
          messageId: msg.id
        });

        // 2단계: 첨부파일이 있으면 Claude로 분류 → Drive 업로드
        const attachments = await extractAttachments(gmail, msg.id, emailData.data.payload);
        let driveResults = [];

        if (attachments.length > 0) {
          driveResults = await classifyAndUpload(auth, attachments, subject);
        }

        // 이메일 내용 자체도 Drive에 기록
        await saveEmailToDrive(auth, subject, from, date, body, summary);

        // DB에 기록
        try {
          const { getDB } = require('./database');
          const db = getDB();
          db.prepare(`
            INSERT INTO notifications (type, title, message)
            VALUES (?, ?, ?)
          `).run('email', `📧 ${subject}`, `보낸이: ${from}\n요약: ${summary}`);
        } catch (e) { /* ignore */ }

        // 처리 완료 표시
        saveProcessedId(msg.id);
        processedCount++;

        results.push({
          messageId: msg.id,
          subject,
          from,
          summary,
          attachments: attachments.length,
          driveUploads: driveResults.length
        });

      } catch (emailErr) {
        console.error(`[EMAIL] 처리 오류 (${msg.id}):`, emailErr.message);
      }
    }

    return { processed: processedCount, results };

  } catch (err) {
    console.error('[EMAIL] Gmail API 오류:', err.message);
    return { error: err.message };
  }
}

/**
 * 이메일 본문 추출
 */
function extractBody(payload) {
  if (!payload) return '';

  // 단순 텍스트
  if (payload.body?.data) {
    return Buffer.from(payload.body.data, 'base64').toString('utf8');
  }

  // multipart
  if (payload.parts) {
    for (const part of payload.parts) {
      // text/plain 우선
      if (part.mimeType === 'text/plain' && part.body?.data) {
        return Buffer.from(part.body.data, 'base64').toString('utf8');
      }
      // text/html
      if (part.mimeType === 'text/html' && part.body?.data) {
        const html = Buffer.from(part.body.data, 'base64').toString('utf8');
        return html.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
      }
      // nested multipart
      if (part.parts) {
        const nested = extractBody(part);
        if (nested) return nested;
      }
    }
  }

  return '';
}

/**
 * 첨부파일 추출
 */
async function extractAttachments(gmail, messageId, payload) {
  const attachments = [];

  function findAttachments(parts) {
    if (!parts) return;
    for (const part of parts) {
      if (part.filename && part.body?.attachmentId) {
        attachments.push({
          filename: part.filename,
          mimeType: part.mimeType,
          attachmentId: part.body.attachmentId,
          size: part.body.size
        });
      }
      if (part.parts) findAttachments(part.parts);
    }
  }

  findAttachments(payload?.parts);

  // 첨부파일 데이터 다운로드
  for (const att of attachments) {
    try {
      const resp = await gmail.users.messages.attachments.get({
        userId: 'me',
        messageId,
        id: att.attachmentId
      });
      att.data = resp.data.data; // base64 encoded
    } catch (e) {
      console.error(`[EMAIL] 첨부파일 다운로드 실패: ${att.filename}`, e.message);
    }
  }

  return attachments.filter(a => a.data);
}

/**
 * Gemini로 이메일 요약
 */
async function geminiSummarize(subject, from, body) {
  const key = process.env.GEMINI_API_KEY;
  if (!key) return '(Gemini 키 없음)';

  try {
    const prompt = `다음 이메일을 한국어로 3줄 이내로 요약해주세요. 핵심 내용과 필요한 액션이 있으면 포함해주세요.

제목: ${subject}
보낸이: ${from}
내용:
${body.substring(0, 3000)}

요약:`;

    const resp = await axios.post(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${key}`,
      {
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0.3, maxOutputTokens: 500 }
      },
      { timeout: 30000 }
    );

    return resp.data.candidates?.[0]?.content?.parts?.[0]?.text || '요약 실패';
  } catch (e) {
    return `요약 오류: ${e.message}`;
  }
}

/**
 * Claude로 첨부파일 분류 → Drive 업로드
 */
async function classifyAndUpload(auth, attachments, emailSubject) {
  const drive = google.drive({ version: 'v3', auth });
  const results = [];

  for (const att of attachments) {
    try {
      // AI로 파일 분류
      let category = '기타';
      let folderName = '이메일_첨부';

      // 파일 확장자 기반 기본 분류
      const ext = path.extname(att.filename).toLowerCase();
      if (['.xlsx', '.xls', '.csv'].includes(ext)) {
        folderName = '세무_회계';
        category = '세무';
      } else if (['.pdf', '.doc', '.docx'].includes(ext)) {
        // Claude로 문서 분류 시도
        try {
          const decoded = Buffer.from(att.data, 'base64').toString('utf8').substring(0, 2000);
          const classResp = await axios.post(
            `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${process.env.GEMINI_API_KEY}`,
            {
              contents: [{
                parts: [{
                  text: `파일명: ${att.filename}\n이메일 제목: ${emailSubject}\n내용 일부: ${decoded}\n\nJSON만: {"category":"세무|계약|상담|마케팅|인사|기타","folderName":"Drive폴더명"}`
                }]
              }]
            },
            { timeout: 15000 }
          );
          const text = classResp.data.candidates?.[0]?.content?.parts?.[0]?.text || '';
          const json = text.match(/\{[\s\S]*\}/);
          if (json) {
            const parsed = JSON.parse(json[0]);
            category = parsed.category || category;
            folderName = parsed.folderName || folderName;
          }
        } catch (e) { /* 기본 분류 유지 */ }
      } else if (['.jpg', '.jpeg', '.png', '.gif', '.webp'].includes(ext)) {
        folderName = '이미지';
        category = '이미지';
      }

      // Drive 폴더 찾기/생성
      const folderResp = await drive.files.list({
        q: `name = '${folderName}' and mimeType = 'application/vnd.google-apps.folder' and trashed = false`,
        fields: 'files(id)'
      });

      let folderId;
      if (folderResp.data.files.length > 0) {
        folderId = folderResp.data.files[0].id;
      } else {
        const newFolder = await drive.files.create({
          resource: {
            name: folderName,
            mimeType: 'application/vnd.google-apps.folder'
          },
          fields: 'id'
        });
        folderId = newFolder.data.id;
      }

      // 파일 업로드
      const { Readable } = require('stream');
      const fileBuffer = Buffer.from(att.data, 'base64');
      const stream = new Readable();
      stream.push(fileBuffer);
      stream.push(null);

      const uploaded = await drive.files.create({
        resource: {
          name: att.filename,
          parents: [folderId]
        },
        media: {
          mimeType: att.mimeType,
          body: stream
        },
        fields: 'id, name, webViewLink'
      });

      results.push({
        filename: att.filename,
        category,
        folder: folderName,
        driveId: uploaded.data.id,
        link: uploaded.data.webViewLink
      });

      // DB 기록
      try {
        const { getDB } = require('./database');
        const db = getDB();
        db.prepare(`
          INSERT INTO drive_sync_log (action, filename, drive_id, folder_path, category, status)
          VALUES (?, ?, ?, ?, ?, ?)
        `).run('classify', att.filename, uploaded.data.id, folderName, category, 'success');
      } catch (e) { /* ignore */ }

      global.broadcast('email-drive-upload', {
        filename: att.filename,
        category,
        folder: folderName
      });

    } catch (uploadErr) {
      console.error(`[EMAIL] Drive 업로드 실패 (${att.filename}):`, uploadErr.message);
    }
  }

  return results;
}

/**
 * 이메일 내용을 Drive에 텍스트로 저장
 */
async function saveEmailToDrive(auth, subject, from, date, body, summary) {
  try {
    const drive = google.drive({ version: 'v3', auth });

    // '이메일_기록' 폴더 찾기/생성
    const folderResp = await drive.files.list({
      q: "name = '이메일_기록' and mimeType = 'application/vnd.google-apps.folder' and trashed = false",
      fields: 'files(id)'
    });

    let folderId;
    if (folderResp.data.files.length > 0) {
      folderId = folderResp.data.files[0].id;
    } else {
      const newFolder = await drive.files.create({
        resource: {
          name: '이메일_기록',
          mimeType: 'application/vnd.google-apps.folder'
        },
        fields: 'id'
      });
      folderId = newFolder.data.id;
    }

    // 이메일 내용 저장
    const timestamp = new Date().toISOString().split('T')[0];
    const content = `제목: ${subject}
보낸이: ${from}
날짜: ${date}

[AI 요약]
${summary}

[원문]
${body.substring(0, 5000)}`;

    const { Readable } = require('stream');
    const stream = new Readable();
    stream.push(content);
    stream.push(null);

    await drive.files.create({
      resource: {
        name: `${timestamp}_${subject.replace(/[^\w가-힣]/g, '_').substring(0, 50)}.txt`,
        parents: [folderId]
      },
      media: {
        mimeType: 'text/plain',
        body: stream
      }
    });

  } catch (e) {
    console.error('[EMAIL] Drive 이메일 기록 실패:', e.message);
  }
}

/**
 * 이메일 통계
 */
async function getEmailStats() {
  const auth = getGmailAuth();
  if (!auth) return { connected: false };

  try {
    const gmail = google.gmail({ version: 'v1', auth });

    const [unread, total, profile] = await Promise.all([
      gmail.users.messages.list({ userId: 'me', q: 'is:unread', maxResults: 1 }),
      gmail.users.messages.list({ userId: 'me', maxResults: 1 }),
      gmail.users.getProfile({ userId: 'me' })
    ]);

    return {
      connected: true,
      email: profile.data.emailAddress,
      unread: unread.data.resultSizeEstimate || 0,
      total: total.data.resultSizeEstimate || 0,
      processed: getProcessedIds().length
    };
  } catch (e) {
    return { connected: false, error: e.message };
  }
}

module.exports = { checkAndProcessEmails, getEmailStats };
