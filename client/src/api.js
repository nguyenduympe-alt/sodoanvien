// Lớp gọi API — mọi request dùng đường dẫn tương đối (chạy được cả trên preview lẫn localhost)
let token = localStorage.getItem('sdv_token') || '';
let currentUser = JSON.parse(localStorage.getItem('sdv_user') || 'null');

export function setSession(t, u) {
  token = t || '';
  currentUser = u || null;
  if (t) localStorage.setItem('sdv_token', t);
  else localStorage.removeItem('sdv_token');
  if (u) localStorage.setItem('sdv_user', JSON.stringify(u));
  else localStorage.removeItem('sdv_user');
}
export function getToken() { return token; }
export function getUser() { return currentUser; }

export class ApiError extends Error {
  constructor(data, status) { super(data?.error || `Lỗi HTTP ${status}`); this.data = data; this.status = status; this.code = data?.code; }
}

async function request(method, path, body) {
  const res = await fetch(`/api${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  let data = null;
  try { data = await res.json(); } catch { /* không phải JSON */ }
  if (!res.ok) throw new ApiError(data, res.status);
  return data;
}

export const api = {
  get: (p) => request('GET', p),
  post: (p, b) => request('POST', p, b ?? {}),
  patch: (p, b) => request('PATCH', p, b ?? {}),
};

export const ROLE_LABEL = {
  DOAN_VIEN: 'Đoàn viên',
  CHI_DOAN: 'Cán bộ Chi đoàn',
  LIEN_CHI: 'Liên chi đoàn/Đoàn khoa',
  DOAN_TRUONG: 'Cán bộ Đoàn trường',
  QUAN_TRI: 'Quản trị hệ thống',
};

export const STATUS_LABEL = {
  ACTIVE: ['Đang hoạt động', 'ok'],
  TRANSFER_PENDING: ['Chờ chuyển sinh hoạt', 'warn'],
  LOCKED_ANOMALY: ['Bị khóa (bất thường)', 'bad'],
  PENDING: ['Chờ phê duyệt', 'warn'],
  ACCEPTED: ['Đã tiếp nhận', 'ok'],
  REJECTED: ['Đã từ chối', 'bad'],
  OPEN: ['Đang mở', 'bad'],
  RESOLVED: ['Đã xử lí', 'ok'],
  RECORDED: ['Đã ghi ledger', 'ok'],
  USED: ['Đã dùng phục hồi', 'info'],
};

export const ACTIVITY_TYPES = [
  ['HOAT_DONG', 'Hoạt động Đoàn'],
  ['DANH_GIA', 'Đánh giá / xếp loại'],
  ['KHEN_THUONG', 'Khen thưởng'],
  ['KY_LUAT', 'Kỉ luật'],
];

export const short = (s, n = 10) => (s ? `${String(s).slice(0, n)}…${String(s).slice(-4)}` : '');
export const fmtTime = (iso) => {
  if (!iso) return '—';
  const d = new Date(iso.includes('T') ? iso : iso.replace(' ', 'T') + 'Z');
  return d.toLocaleString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
};
