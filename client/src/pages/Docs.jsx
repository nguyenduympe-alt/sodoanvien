import React, { useEffect, useState } from 'react';
import { api } from '../api.js';
import { Loading, Empty, useToast } from '../components.jsx';

const DOCS = [
  ['phan-tich-de-cuong.md', 'Phân tích đề cương & ánh xạ yêu cầu → module'],
  ['thiet-ke-he-thong.md', 'Thiết kế hệ thống: kiến trúc, dữ liệu, API'],
  ['tich-hop-ai.md', 'Lộ trình tích hợp mô hình AI'],
  ['dinh-danh-dien-tu-vneid.md', 'Tích hợp định danh điện tử VNeID'],
  ['api-endpoints.txt', 'Tài liệu API (cho Swagger/Postman)'],
];

// Bộ render markdown tối giản (tiêu đề, list, bảng, in đậm, mã) — không cần thư viện ngoài
function md2html(src) {
  const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const lines = src.split('\n');
  const out = [];
  let inTable = false, inList = false, inCode = false;
  const closeList = () => { if (inList) { out.push('</ul>'); inList = false; } };
  const closeTable = () => { if (inTable) { out.push('</tbody></table></div>'); inTable = false; } };
  for (const raw of lines) {
    const line = raw.replace(/\r$/, '');
    if (line.startsWith('```')) { inCode = !inCode; out.push(inCode ? '<pre class="codeblock">' : '</pre>'); continue; }
    if (inCode) { out.push(esc(line)); continue; }
    if (/^\|/.test(line)) {
      const cells = line.split('|').slice(1, -1).map((c) => c.trim());
      if (/^\|[\s:-]+\|/.test(line) || cells.every((c) => /^:?-+:?$/.test(c))) continue;
      if (!inTable) { out.push('<div class="table-wrap" style="margin:10px 0"><table class="tbl"><tbody>'); inTable = true; }
      out.push(`<tr>${cells.map((c, i) => `<td${i === 0 ? ' style="font-weight:600"' : ''}>${inline(c)}</td>`).join('')}</tr>`);
      continue;
    }
    closeTable();
    const h = line.match(/^(#{1,4})\s+(.*)/);
    if (h) {
      closeList();
      const level = Math.min(h[1].length + 1, 5);
      out.push(`<h${level} style="margin:18px 0 6px">${inline(h[2])}</h${level}>`);
      continue;
    }
    if (/^[-*]\s+/.test(line)) {
      if (!inList) { out.push('<ul style="margin:6px 0 6px 20px">'); inList = true; }
      out.push(`<li>${inline(line.replace(/^[-*]\s+/, ''))}</li>`);
      continue;
    }
    closeList();
    if (line.trim() === '') continue;
    out.push(`<p style="margin:8px 0">${inline(line)}</p>`);
  }
  closeList(); closeTable();
  function inline(s) {
    return esc(s)
      .replace(/`([^`]+)`/g, '<code style="background:#f3f4f6;padding:1px 6px;border-radius:6px;font-size:12.5px">$1</code>')
      .replace(/\*\*([^*]+)\*\*/g, '<b>$1</b>')
      .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a style="color:var(--info)" href="$2">$1</a>');
  }
  return out.join('\n');
}

export default function Docs({ me }) {
  const [active, setActive] = useState(DOCS[0][0]);
  const [src, setSrc] = useState(null);
  const toast = useToast();

  useEffect(() => {
    setSrc(null);
    api.get(`/docs/${active}`).then((d) => setSrc(d)).catch((e) => toast(e.message, 'err'));
  }, [active]);

  return (
    <>
      <div className="page-head">
        <div><h2>Tài liệu dự án</h2><p>Phân tích đề cương, thiết kế hệ thống và API — phục vụ luận văn và kiểm thử</p></div>
      </div>
      <div className="tabs" style={{ marginBottom: 14 }}>
        {DOCS.map(([k, v]) => <button key={k} className={active === k ? 'active' : ''} onClick={() => setActive(k)}>{v}</button>)}
      </div>
      <div className="card">
        <div className="card-b" style={{ fontSize: 13.5, lineHeight: 1.65 }}>
          {!src ? <Loading /> : src.error ? <Empty text={src.error} /> : (
            <div dangerouslySetInnerHTML={{ __html: md2html(src) }} />
          )}
        </div>
      </div>
    </>
  );
}
