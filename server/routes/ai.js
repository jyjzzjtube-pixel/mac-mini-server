/**
 * AI Hub 라우터 - Claude / Gemini / Perplexity 전환 + 프롬프트 템플릿
 */
const express = require('express');
const router = express.Router();
const axios = require('axios');

// 프롬프트 템플릿 저장소
const templates = {
  'blog-seo': {
    name: '블로그 SEO 최적화',
    prompt: '네이버 블로그 상위노출을 위한 SEO 최적화 글을 작성해주세요. 키워드: {{keyword}}, 톤: 경험형, 글자수: 1500~2200자, H2 소제목 4~5개(질문형), 한문장 40자 이내.',
    model: 'gemini'
  },
  'franchise-consult': {
    name: '프랜차이즈 상담',
    prompt: '프랜차이즈 창업 상담 응대를 해주세요. 브랜드: {{brand}}, 질문: {{question}}. 전문적이면서도 친근한 톤으로 답변해주세요.',
    model: 'claude'
  },
  'data-analysis': {
    name: '데이터 분석',
    prompt: '다음 데이터를 분석해주세요: {{data}}. 핵심 인사이트와 개선점을 3가지씩 제시해주세요.',
    model: 'claude'
  },
  'email-summary': {
    name: '이메일 요약',
    prompt: '다음 이메일 내용을 요약하고 핵심 액션 아이템을 정리해주세요: {{content}}',
    model: 'gemini'
  },
  'document-classify': {
    name: '문서 분류',
    prompt: '다음 문서를 분류해주세요. 카테고리: [세무, 계약, 상담, 마케팅, 인사, 기타]. 문서 내용: {{content}}. JSON 형태로 {category, summary, keywords} 반환해주세요.',
    model: 'claude'
  }
};

/**
 * POST /api/ai/chat - AI 채팅 (Claude / Gemini 자동 전환)
 */
router.post('/chat', async (req, res) => {
  try {
    const { message, model = 'gemini', history = [], systemPrompt = '' } = req.body;

    if (!message) return res.status(400).json({ error: '메시지를 입력하세요' });

    let result;
    if (model === 'claude') {
      result = await callClaude(message, history, systemPrompt);
    } else if (model === 'perplexity') {
      result = await callPerplexity(message, history, systemPrompt);
    } else {
      result = await callGemini(message, history, systemPrompt);
    }

    // 로그 broadcast
    global.broadcast('ai-response', { model, messageLength: result.length });

    res.json({ success: true, model, response: result });
  } catch (err) {
    console.error('[AI] 오류:', err.message);
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/ai/template - 템플릿 기반 AI 호출
 */
router.post('/template', async (req, res) => {
  try {
    const { templateId, variables = {} } = req.body;
    const tpl = templates[templateId];
    if (!tpl) return res.status(404).json({ error: '템플릿을 찾을 수 없습니다' });

    // 변수 치환
    let prompt = tpl.prompt;
    Object.entries(variables).forEach(([key, val]) => {
      prompt = prompt.replace(new RegExp(`{{${key}}}`, 'g'), val);
    });

    let result;
    if (tpl.model === 'claude') {
      result = await callClaude(prompt, [], '');
    } else {
      result = await callGemini(prompt, [], '');
    }

    res.json({ success: true, model: tpl.model, templateName: tpl.name, response: result });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /api/ai/templates - 템플릿 목록
 */
router.get('/templates', (req, res) => {
  const list = Object.entries(templates).map(([id, t]) => ({
    id, name: t.name, model: t.model, prompt: t.prompt
  }));
  res.json({ templates: list });
});

/**
 * POST /api/ai/analyze-file - 파일 내용 AI 분석
 */
router.post('/analyze-file', async (req, res) => {
  try {
    const { content, filename, task = 'summarize' } = req.body;
    const prompt = task === 'classify'
      ? `파일명: ${filename}\n내용:\n${content}\n\n이 문서를 분류하고 요약해주세요. JSON: {category, summary, keywords[], actionItems[]}`
      : `파일명: ${filename}\n내용:\n${content}\n\n이 문서의 핵심 내용을 요약해주세요.`;

    const result = await callGemini(prompt, [], '문서 분석 전문가입니다.');
    res.json({ success: true, analysis: result });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/ai/perplexity - Perplexity AI 검색 (실시간 웹 검색 기반 답변)
 */
router.post('/perplexity', async (req, res) => {
  try {
    const { message, history = [], systemPrompt = '한국어로 답변해주세요. 정확한 출처와 함께 최신 정보를 제공해주세요.' } = req.body;

    if (!message) return res.status(400).json({ error: '메시지를 입력하세요' });

    const result = await callPerplexity(message, history, systemPrompt);

    global.broadcast('ai-response', { model: 'perplexity', messageLength: result.length });

    res.json({ success: true, model: 'perplexity', response: result });
  } catch (err) {
    console.error('[Perplexity] 오류:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ─── AI 호출 함수 ────────────────────────────────

async function callGemini(message, history, systemPrompt) {
  const key = process.env.GEMINI_API_KEY;
  if (!key) throw new Error('GEMINI_API_KEY 미설정');

  const contents = [];

  // 히스토리 변환
  history.forEach(h => {
    contents.push({
      role: h.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: h.content }]
    });
  });

  contents.push({ role: 'user', parts: [{ text: message }] });

  const body = {
    contents,
    generationConfig: {
      temperature: 0.8,
      maxOutputTokens: 4096,
      topP: 0.95
    }
  };

  if (systemPrompt) {
    body.systemInstruction = { parts: [{ text: systemPrompt }] };
  }

  const resp = await axios.post(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${key}`,
    body,
    { headers: { 'Content-Type': 'application/json' }, timeout: 60000 }
  );

  const candidate = resp.data?.candidates?.[0];
  if (!candidate) throw new Error('Gemini 응답 없음');
  return candidate.content?.parts?.[0]?.text || '';
}

async function callClaude(message, history, systemPrompt) {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) throw new Error('ANTHROPIC_API_KEY 미설정');

  const messages = [];
  history.forEach(h => {
    messages.push({ role: h.role, content: h.content });
  });
  messages.push({ role: 'user', content: message });

  const body = {
    model: 'claude-sonnet-4-20250514',
    max_tokens: 4096,
    messages
  };
  if (systemPrompt) body.system = systemPrompt;

  const resp = await axios.post('https://api.anthropic.com/v1/messages', body, {
    headers: {
      'x-api-key': key,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json'
    },
    timeout: 60000
  });

  return resp.data?.content?.[0]?.text || '';
}

async function callPerplexity(message, history, systemPrompt) {
  const key = process.env.PERPLEXITY_API_KEY;
  if (!key) throw new Error('PERPLEXITY_API_KEY 미설정');

  const messages = [];

  // 시스템 프롬프트
  if (systemPrompt) {
    messages.push({ role: 'system', content: systemPrompt });
  }

  // 히스토리 변환
  history.forEach(h => {
    messages.push({ role: h.role, content: h.content });
  });

  messages.push({ role: 'user', content: message });

  const body = {
    model: 'sonar',
    messages,
    max_tokens: 4096,
    temperature: 0.2
  };

  const resp = await axios.post('https://api.perplexity.ai/chat/completions', body, {
    headers: {
      'Authorization': `Bearer ${key}`,
      'Content-Type': 'application/json'
    },
    timeout: 60000
  });

  const choice = resp.data?.choices?.[0];
  if (!choice) throw new Error('Perplexity 응답 없음');
  return choice.message?.content || '';
}

module.exports = router;
