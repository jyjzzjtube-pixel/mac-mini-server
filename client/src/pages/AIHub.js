import React, { useState, useEffect, useRef } from 'react';

export default function AIHub() {
  const [model, setModel] = useState('gemini');
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [templates, setTemplates] = useState([]);
  const [showTemplates, setShowTemplates] = useState(false);
  const chatEnd = useRef(null);

  useEffect(() => {
    fetch('/api/ai/templates').then(r => r.json()).then(d => setTemplates(d.templates || []));
  }, []);

  useEffect(() => {
    chatEnd.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const sendMessage = async () => {
    if (!input.trim() || loading) return;
    const userMsg = input.trim();
    setInput('');
    setMessages(prev => [...prev, { role: 'user', content: userMsg }]);
    setLoading(true);

    try {
      const resp = await fetch('/api/ai/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: userMsg,
          model,
          history: messages.slice(-10)
        })
      });
      const data = await resp.json();

      if (data.success) {
        setMessages(prev => [...prev, { role: 'assistant', content: data.response, model: data.model }]);
      } else {
        setMessages(prev => [...prev, { role: 'assistant', content: `❌ 오류: ${data.error}` }]);
      }
    } catch (err) {
      setMessages(prev => [...prev, { role: 'assistant', content: `❌ 연결 오류: ${err.message}` }]);
    }
    setLoading(false);
  };

  const useTemplate = async (tpl) => {
    setShowTemplates(false);
    setMessages(prev => [...prev, { role: 'user', content: `📋 [${tpl.name}] 템플릿 실행` }]);
    setLoading(true);

    try {
      const resp = await fetch('/api/ai/template', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ templateId: tpl.id, variables: {} })
      });
      const data = await resp.json();

      if (data.success) {
        setMessages(prev => [...prev, { role: 'assistant', content: data.response, model: data.model }]);
      } else {
        setMessages(prev => [...prev, { role: 'assistant', content: `❌ ${data.error}` }]);
      }
    } catch (err) {
      setMessages(prev => [...prev, { role: 'assistant', content: `❌ ${err.message}` }]);
    }
    setLoading(false);
  };

  return (
    <div className="chat-container">
      <div className="page-header" style={{ marginBottom: 12 }}>
        <h1 className="page-title">🤖 AI Hub</h1>
        <button className="btn btn-sm btn-secondary"
          onClick={() => setShowTemplates(!showTemplates)}>
          📋 템플릿
        </button>
      </div>

      {/* 모델 선택 */}
      <div className="toggle-wrap">
        <button className={`toggle-btn ${model === 'gemini' ? 'active' : ''}`}
          onClick={() => setModel('gemini')}>
          ✨ Gemini
        </button>
        <button className={`toggle-btn ${model === 'claude' ? 'active' : ''}`}
          onClick={() => setModel('claude')}>
          🧠 Claude
        </button>
      </div>

      {/* 템플릿 패널 */}
      {showTemplates && (
        <div className="card" style={{ marginBottom: 12 }}>
          <div className="card-title">📋 프롬프트 템플릿</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {templates.map(tpl => (
              <button key={tpl.id} className="btn btn-sm btn-secondary"
                onClick={() => useTemplate(tpl)}>
                {tpl.name} ({tpl.model === 'claude' ? '🧠' : '✨'})
              </button>
            ))}
          </div>
        </div>
      )}

      {/* 채팅 메시지 */}
      <div className="chat-messages">
        {messages.length === 0 && (
          <div style={{ textAlign: 'center', padding: '60px 20px', color: 'var(--text-muted)' }}>
            <div style={{ fontSize: 48, marginBottom: 12 }}>
              {model === 'gemini' ? '✨' : '🧠'}
            </div>
            <p>{model === 'gemini' ? 'Gemini' : 'Claude'}에게 질문해보세요</p>
            <p style={{ fontSize: 12, marginTop: 4 }}>프랜차이즈 상담, 블로그 SEO, 데이터 분석 등</p>
          </div>
        )}

        {messages.map((msg, i) => (
          <div key={i} className={`chat-bubble ${msg.role}`}>
            {msg.role === 'assistant' && msg.model && (
              <div style={{ fontSize: 10, color: 'var(--text-muted)', marginBottom: 4 }}>
                {msg.model === 'claude' ? '🧠 Claude' : '✨ Gemini'}
              </div>
            )}
            {msg.content}
          </div>
        ))}

        {loading && (
          <div className="chat-bubble assistant loading">
            {model === 'gemini' ? '✨' : '🧠'} 생각하는 중...
          </div>
        )}
        <div ref={chatEnd} />
      </div>

      {/* 입력 */}
      <div className="chat-input-wrap">
        <input
          className="input"
          placeholder={`${model === 'gemini' ? 'Gemini' : 'Claude'}에게 메시지...`}
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); } }}
          disabled={loading}
        />
        <button className="btn btn-primary" onClick={sendMessage} disabled={loading || !input.trim()}>
          전송
        </button>
      </div>
    </div>
  );
}
