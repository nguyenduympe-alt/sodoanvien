import React, { useEffect, useRef, useState } from 'react';
import { api } from '../api.js';
import { useToast } from '../components.jsx';

// Trợ lí AI — endpoint POST /api/ai/chat chuẩn OpenAI-compatible.
// Chưa cấu hình AI_API_KEY → hiển thị hướng dẫn bật và lộ trình tích hợp (docs/03).
export default function Assistant({ me }) {
  const [msgs, setMsgs] = useState([]);
  const [q, setQ] = useState('');
  const [busy, setBusy] = useState(false);
  const [disabled, setDisabled] = useState(false);
  const [setup, setSetup] = useState(null);
  const boxRef = useRef(null);
  const toast = useToast();

  useEffect(() => { boxRef.current?.scrollTo(0, 1e6); }, [msgs]);

  const send = async (text) => {
    const question = (text ?? q).trim();
    if (!question || busy) return;
    setQ(''); setBusy(true);
    setMsgs((m) => [...m, { role: 'me', content: question }]);
    try {
      const r = await api.post('/ai/chat', { question });
      setMsgs((m) => [...m, { role: 'ai', content: r.reply }]);
    } catch (e) {
      if (e.status === 503) { setDisabled(true); setSetup(e.data); }
      else toast(e.message, 'err');
      setMsgs((m) => [...m, { role: 'ai', content: `⚠️ ${e.message}` }]);
    } finally { setBusy(false); }
  };

  return (
    <>
      <div className="page-head">
        <div><h2>🤖 Trợ lí AI nghiệp vụ</h2>
          <p>Lớp AI tách riêng qua REST — cắm mô hình tùy ý (OpenAI, Azure, Ollama, vLLM…) chỉ bằng biến môi trường</p></div>
      </div>

      <div className="grid" style={{ gridTemplateColumns: 'minmax(0,1.6fr) minmax(260px,1fr)' }}>
        <div className="card" style={{ display: 'flex', flexDirection: 'column', height: 'calc(100vh - 210px)', minHeight: 420 }}>
          <div className="card-h"><b>Trò chuyện theo ngữ cảnh dữ liệu của bạn</b>
            {disabled && <span className="pill warn">Chưa bật</span>}</div>
          <div className="card-b chat" style={{ flex: 1, overflowY: 'auto', background: 'var(--bg)' }} ref={boxRef}>
            {msgs.length === 0 && (
              <div className="empty">
                <span className="big">💬</span>
                Hỏi ví dụ: <i>“Có bao nhiêu đoàn viên đang chờ chuyển sinh hoạt?”</i><br />
                <i>“Quy trình chuyển sinh hoạt hoạt động thế nào?”</i>
              </div>
            )}
            {msgs.map((m, i) => <div key={i} className={`msg ${m.role === 'me' ? 'me' : 'ai'}`}>{m.content}</div>)}
            {busy && <div className="msg ai"><span className="spin" style={{ borderColor: '#9f1d1d33', borderTopColor: 'var(--red)' }} /> Đang suy nghĩ…</div>}
          </div>
          <div style={{ borderTop: '1px solid var(--line)', padding: 12, display: 'flex', gap: 8 }}>
            <input style={{ flex: 1, border: '1px solid #d1d5db', borderRadius: 10, padding: '9px 12px' }}
                   placeholder={disabled ? 'Bật lớp AI để trò chuyện…' : 'Nhập câu hỏi…'}
                   value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && send()} disabled={disabled} />
            <button className="btn primary" onClick={() => send()} disabled={busy || disabled || !q.trim()}>Gửi ➤</button>
          </div>
        </div>

        <div className="grid" style={{ gap: 12, alignContent: 'start' }}>
          {setup && (
            <div className="card">
              <div className="card-h"><b>⚡ Cách bật lớp AI</b></div>
              <div className="card-b" style={{ fontSize: 12.5 }}>
                <code style={{ display: 'block', background: '#f8f9fb', padding: 10, borderRadius: 8, marginBottom: 8, whiteSpace: 'pre-wrap' }}>
{`# Linux/macOS
export AI_API_KEY="sk-..."
export AI_BASE_URL="https://api.openai.com/v1"  # hoặc Ollama/vLLM
export AI_MODEL="gpt-4o-mini"

# Windows (PowerShell)
$env:AI_API_KEY="sk-..."

npm start`}
                </code>
                {setup.howTo}
              </div>
            </div>
          )}
          <div className="card">
            <div className="card-h"><b>🧭 Lộ trình tích hợp AI (mục 9 đề cương)</b></div>
            <div className="card-b" style={{ fontSize: 12.5 }}>
              {[
                ['🧠', 'Chatbot tra cứu nghiệp vụ', 'Hỏi đáp trên ngữ cảnh dữ liệu theo phân quyền (đã dựng khung).'],
                ['📊', 'Phát hiện bất thường', 'Mô hình phân loại trên lịch sử giao dịch → cảnh báo sớm trước khi đối soát hash.'],
                ['📝', 'Tóm tắt hồ sơ', 'Sinh tóm tắt quá trình sinh hoạt/đánh giá của đoàn viên cho cán bộ.'],
                ['📷', 'OCR giấy tờ', 'Trích xuất thông tin từ đơn kết nạp giấy → tự điền form tạo hồ sơ.'],
                ['🖼️', 'Xác minh định danh', 'QR code + đối chiếu khuôn mặt khi xác minh nhanh ngoài hội trường.'],
              ].map(([ic, t, d]) => (
                <div key={t} className="alert-item">
                  <span style={{ fontSize: 16 }}>{ic}</span>
                  <div><b style={{ fontSize: 12.5 }}>{t}</b><div style={{ color: 'var(--muted)', fontSize: 11.5 }}>{d}</div></div>
                </div>
              ))}
              <a className="btn sm" style={{ marginTop: 6 }} href="#/docs">Xem chi tiết kiến trúc tích hợp →</a>
            </div>
          </div>
          <div className="note blue" style={{ fontSize: 12 }}>
            🔐 Lớp AI không bao giờ nhận dữ liệu nhạy cảm (CCCD…): chỉ nhận số liệu thống kê theo phạm vi quyền của người hỏi.
          </div>
        </div>
      </div>
    </>
  );
}
