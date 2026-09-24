/**
 * ============ XÁC THỰC & PHÂN QUYỀN ============
 * - Người dùng đăng nhập bằng tài khoản ứng dụng (JWT) — đề cương mục 8.6:
 *   Đoàn viên KHÔNG cần chứng thư Fabric, chỉ dùng tài khoản ứng dụng.
 * - Các chủ thể ghi giao dịch (Chi đoàn/Đoàn trường/Quản trị) khi submit lên
 *   ledger được ánh xạ sang danh tính MSP tương ứng (ledger.identityOf).
 */
const jwt = require('jsonwebtoken');
const { JWT_SECRET, JWT_EXPIRES } = require('./config');
const { db } = require('./db');

function signToken(user) {
  return jwt.sign(
    { id: user.id, username: user.username, role: user.role, unitId: user.unitId, memberId: user.memberId, displayName: user.displayName },
    JWT_SECRET,
    { expiresIn: JWT_EXPIRES }
  );
}

/** Middleware: yêu cầu đăng nhập; truyền mảng vai trò để giới hạn quyền */
function requireAuth(...roles) {
  return (req, res, next) => {
    const header = req.headers.authorization || '';
    const token = header.startsWith('Bearer ') ? header.slice(7) : null;
    if (!token) return res.status(401).json({ error: 'Chưa đăng nhập' });
    try {
      const payload = jwt.verify(token, JWT_SECRET);
      const user = db.prepare('SELECT * FROM users WHERE id=? AND active=1').get(payload.id);
      if (!user) return res.status(401).json({ error: 'Tài khoản đã bị vô hiệu hóa' });
      req.user = { id: user.id, username: user.username, displayName: user.displayName, role: user.role, unitId: user.unitId, memberId: user.memberId };
      if (roles.length && !roles.includes(user.role)) {
        return res.status(403).json({ error: `Vai trò ${user.role} không có quyền thực hiện thao tác này` });
      }
      next();
    } catch {
      return res.status(401).json({ error: 'Phiên đăng nhập hết hạn, vui lòng đăng nhập lại' });
    }
  };
}

/** Phạm vi dữ liệu đoàn viên mà một vai trò được nhìn thấy (row-level security) */
function scopeOf(user) {
  switch (user.role) {
    case 'DOAN_VIEN':
      return { mode: 'SELF', memberId: user.memberId };
    case 'CHI_DOAN':
      return { mode: 'UNITS', unitIds: [user.unitId] };
    case 'LIEN_CHI': {
      const units = db.prepare('SELECT id FROM units WHERE parentId=? OR id=?').all(user.unitId, user.unitId).map((u) => u.id);
      return { mode: 'UNITS', unitIds: units };
    }
    default:
      return { mode: 'ALL' };
  }
}

function scopeWhere(scope, alias = 'm') {
  if (scope.mode === 'SELF') return { sql: `${alias}.id = ?`, params: [scope.memberId] };
  if (scope.mode === 'UNITS') return { sql: `${alias}.unitId IN (${scope.unitIds.map(() => '?').join(',')})`, params: scope.unitIds };
  return { sql: '1=1', params: [] };
}

function audit(req, action, detail = '') {
  try {
    db.prepare('INSERT INTO audit(username,role,action,detail,ip) VALUES (?,?,?,?,?)')
      .run(req.user?.username || '-', req.user?.role || '-', action, String(detail).slice(0, 500), req.ip || '-');
  } catch { /* không chặn nghiệp vụ nếu lỗi log */ }
}

module.exports = { signToken, requireAuth, scopeOf, scopeWhere, audit };
