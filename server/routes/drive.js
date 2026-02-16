/**
 * Google Drive 양방향 동기화 라우터
 */
const express = require('express');
const router = express.Router();
const { google } = require('googleapis');
const multer = require('multer');
const fs = require('fs');
const path = require('path');
const { Readable } = require('stream');

const upload = multer({ dest: path.join(__dirname, '..', '..', 'uploads') });

// OAuth2 클라이언트
function getOAuth2Client() {
  return new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    process.env.GOOGLE_REDIRECT_URI
  );
}

// 토큰 파일 경로
const TOKEN_PATH = path.join(__dirname, '..', '..', 'data', 'google-token.json');

function getAuthClient() {
  const oauth2 = getOAuth2Client();
  if (fs.existsSync(TOKEN_PATH)) {
    const tokens = JSON.parse(fs.readFileSync(TOKEN_PATH, 'utf8'));
    oauth2.setCredentials(tokens);

    // 토큰 자동 갱신
    oauth2.on('tokens', (newTokens) => {
      const existing = JSON.parse(fs.readFileSync(TOKEN_PATH, 'utf8'));
      const merged = { ...existing, ...newTokens };
      fs.writeFileSync(TOKEN_PATH, JSON.stringify(merged, null, 2));
    });
  }
  return oauth2;
}

/**
 * GET /api/drive/status - 연결 상태
 */
router.get('/status', (req, res) => {
  const connected = fs.existsSync(TOKEN_PATH);
  res.json({ connected, tokenPath: TOKEN_PATH });
});

/**
 * GET /api/drive/files - 파일 목록
 */
router.get('/files', async (req, res) => {
  try {
    const auth = getAuthClient();
    const drive = google.drive({ version: 'v3', auth });
    const { folderId, pageSize = 20, pageToken } = req.query;

    const query = folderId
      ? `'${folderId}' in parents and trashed = false`
      : `'root' in parents and trashed = false`;

    const resp = await drive.files.list({
      q: query,
      pageSize: parseInt(pageSize),
      pageToken: pageToken || undefined,
      fields: 'nextPageToken, files(id, name, mimeType, size, modifiedTime, parents, webViewLink)',
      orderBy: 'modifiedTime desc'
    });

    res.json({
      files: resp.data.files,
      nextPageToken: resp.data.nextPageToken
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /api/drive/folders - 폴더 목록 (트리 구조용)
 */
router.get('/folders', async (req, res) => {
  try {
    const auth = getAuthClient();
    const drive = google.drive({ version: 'v3', auth });

    const resp = await drive.files.list({
      q: "mimeType = 'application/vnd.google-apps.folder' and trashed = false",
      pageSize: 100,
      fields: 'files(id, name, parents)',
      orderBy: 'name'
    });

    res.json({ folders: resp.data.files });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/drive/upload - 파일 업로드
 */
router.post('/upload', upload.single('file'), async (req, res) => {
  try {
    const auth = getAuthClient();
    const drive = google.drive({ version: 'v3', auth });
    const { folderId, filename } = req.body;

    const fileMetadata = {
      name: filename || req.file.originalname,
      parents: folderId ? [folderId] : undefined
    };

    const media = {
      mimeType: req.file.mimetype,
      body: fs.createReadStream(req.file.path)
    };

    const resp = await drive.files.create({
      resource: fileMetadata,
      media,
      fields: 'id, name, webViewLink'
    });

    // 임시파일 삭제
    fs.unlinkSync(req.file.path);

    global.broadcast('drive-upload', { file: resp.data.name });

    res.json({ success: true, file: resp.data });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/drive/upload-content - 텍스트/JSON 직접 업로드
 */
router.post('/upload-content', async (req, res) => {
  try {
    const auth = getAuthClient();
    const drive = google.drive({ version: 'v3', auth });
    const { content, filename, folderId, mimeType = 'text/plain' } = req.body;

    const fileMetadata = {
      name: filename,
      parents: folderId ? [folderId] : undefined
    };

    const stream = new Readable();
    stream.push(typeof content === 'string' ? content : JSON.stringify(content, null, 2));
    stream.push(null);

    const resp = await drive.files.create({
      resource: fileMetadata,
      media: { mimeType, body: stream },
      fields: 'id, name, webViewLink'
    });

    res.json({ success: true, file: resp.data });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /api/drive/download/:fileId - 파일 다운로드
 */
router.get('/download/:fileId', async (req, res) => {
  try {
    const auth = getAuthClient();
    const drive = google.drive({ version: 'v3', auth });

    // 메타데이터
    const meta = await drive.files.get({
      fileId: req.params.fileId,
      fields: 'name, mimeType'
    });

    // 다운로드
    const resp = await drive.files.get(
      { fileId: req.params.fileId, alt: 'media' },
      { responseType: 'stream' }
    );

    res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(meta.data.name)}"`);
    res.setHeader('Content-Type', meta.data.mimeType);
    resp.data.pipe(res);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/drive/create-folder - 폴더 생성
 */
router.post('/create-folder', async (req, res) => {
  try {
    const auth = getAuthClient();
    const drive = google.drive({ version: 'v3', auth });
    const { name, parentId } = req.body;

    const fileMetadata = {
      name,
      mimeType: 'application/vnd.google-apps.folder',
      parents: parentId ? [parentId] : undefined
    };

    const resp = await drive.files.create({
      resource: fileMetadata,
      fields: 'id, name'
    });

    res.json({ success: true, folder: resp.data });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/drive/sync - 양방향 동기화 (로컬 <-> Drive)
 */
router.post('/sync', async (req, res) => {
  try {
    const auth = getAuthClient();
    const drive = google.drive({ version: 'v3', auth });
    const { localPath, driveFolderId, direction = 'both' } = req.body;

    if (!localPath || !driveFolderId) {
      return res.status(400).json({ error: 'localPath와 driveFolderId 필요' });
    }

    const results = { uploaded: [], downloaded: [], errors: [] };

    // Drive → Local
    if (direction === 'both' || direction === 'download') {
      const driveFiles = await drive.files.list({
        q: `'${driveFolderId}' in parents and trashed = false`,
        fields: 'files(id, name, modifiedTime, mimeType, size)'
      });

      for (const file of driveFiles.data.files) {
        if (file.mimeType === 'application/vnd.google-apps.folder') continue;
        const localFile = path.join(localPath, file.name);
        const needDownload = !fs.existsSync(localFile) ||
          new Date(file.modifiedTime) > fs.statSync(localFile).mtime;

        if (needDownload) {
          try {
            const resp = await drive.files.get(
              { fileId: file.id, alt: 'media' },
              { responseType: 'stream' }
            );
            const dest = fs.createWriteStream(localFile);
            await new Promise((resolve, reject) => {
              resp.data.pipe(dest);
              dest.on('finish', resolve);
              dest.on('error', reject);
            });
            results.downloaded.push(file.name);
          } catch (e) {
            results.errors.push({ file: file.name, error: e.message });
          }
        }
      }
    }

    // Local → Drive
    if (direction === 'both' || direction === 'upload') {
      if (fs.existsSync(localPath)) {
        const localFiles = fs.readdirSync(localPath);
        for (const fname of localFiles) {
          const fullPath = path.join(localPath, fname);
          if (fs.statSync(fullPath).isDirectory()) continue;

          try {
            const resp = await drive.files.create({
              resource: { name: fname, parents: [driveFolderId] },
              media: { body: fs.createReadStream(fullPath) },
              fields: 'id, name'
            });
            results.uploaded.push(resp.data.name);
          } catch (e) {
            results.errors.push({ file: fname, error: e.message });
          }
        }
      }
    }

    global.broadcast('drive-sync', results);
    res.json({ success: true, results });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/drive/classify-upload - AI 분류 후 Drive 업로드
 */
router.post('/classify-upload', upload.single('file'), async (req, res) => {
  try {
    const auth = getAuthClient();
    const drive = google.drive({ version: 'v3', auth });
    const axios2 = require('axios');

    // 파일 내용 읽기
    const content = fs.readFileSync(req.file.path, 'utf8');

    // AI 분류
    const classifyPrompt = `파일명: ${req.file.originalname}\n내용:\n${content.substring(0, 3000)}\n\nJSON만 반환: {"category":"세무|계약|상담|마케팅|인사|기타","folderName":"폴더명","summary":"요약"}`;

    const aiResp = await axios2.post(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${process.env.GEMINI_API_KEY}`,
      { contents: [{ parts: [{ text: classifyPrompt }] }] }
    );

    let classification;
    try {
      const text = aiResp.data.candidates[0].content.parts[0].text;
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      classification = JSON.parse(jsonMatch[0]);
    } catch (e) {
      classification = { category: '기타', folderName: '미분류', summary: '' };
    }

    // 분류별 폴더 찾기/생성
    const { baseFolderId } = req.body;
    let targetFolderId = baseFolderId || undefined;

    if (classification.folderName) {
      const existing = await drive.files.list({
        q: `name = '${classification.folderName}' and mimeType = 'application/vnd.google-apps.folder' and trashed = false${targetFolderId ? ` and '${targetFolderId}' in parents` : ''}`,
        fields: 'files(id)'
      });

      if (existing.data.files.length > 0) {
        targetFolderId = existing.data.files[0].id;
      } else {
        const newFolder = await drive.files.create({
          resource: {
            name: classification.folderName,
            mimeType: 'application/vnd.google-apps.folder',
            parents: targetFolderId ? [targetFolderId] : undefined
          },
          fields: 'id'
        });
        targetFolderId = newFolder.data.id;
      }
    }

    // 파일 업로드
    const uploaded = await drive.files.create({
      resource: {
        name: req.file.originalname,
        parents: targetFolderId ? [targetFolderId] : undefined
      },
      media: {
        mimeType: req.file.mimetype,
        body: fs.createReadStream(req.file.path)
      },
      fields: 'id, name, webViewLink'
    });

    fs.unlinkSync(req.file.path);

    global.broadcast('drive-classify', { file: uploaded.data.name, category: classification.category });

    res.json({
      success: true,
      classification,
      file: uploaded.data
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
