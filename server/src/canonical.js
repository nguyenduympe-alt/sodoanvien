// Chuẩn hóa dữ liệu trước khi băm (JSON canonical) - đúng nguyên tắc trong đề cương mục 8.9:
// - Sắp xếp khóa theo thứ tự cố định (đệ quy)
// - Chuẩn hóa kiểu dữ liệu & định dạng thời gian (ISO-8601 UTC)
// - Loại bỏ các trường biến động không thuộc nội dung nghiệp vụ
const VOLATILE_KEYS = new Set(['_rev', 'lastQueriedAt', 'sessionToken', 'searchText']);

function canonicalize(value) {
  if (value === null || value === undefined) return null;
  if (typeof value === 'number') return Number.isFinite(value) ? value : String(value);
  if (typeof value !== 'object') return value;
  if (Array.isArray(value)) return value.map(canonicalize);
  const out = {};
  for (const k of Object.keys(value).sort()) {
    if (VOLATILE_KEYS.has(k)) continue;
    out[k] = canonicalize(value[k]);
  }
  return out;
}

// Tính SHA-256 trên chuỗi JSON đã chuẩn hóa
function sha256Hex(input) {
  const { createHash } = require('crypto');
  const data = typeof input === 'string' ? input : JSON.stringify(canonicalize(input));
  return createHash('sha256').update(data, 'utf8').digest('hex');
}

/**
 * Nội dung hồ sơ được đưa vào hash — PHẢI dùng duy nhất hàm này ở MỌI nơi tính
 * hash (seed, tạo hồ sơ, cập nhật, đối soát) để đảm bảo tính nhất quán.
 * Không gồm: status (trạng thái workflow theo dõi qua giao dịch ledger), unitName
 * (dẫn xuất từ unitId), notes, cccd*Hash… và các trường kỹ thuật.
 */
function profileCore(m) {
  const s = (v) => (v === null || v === undefined ? '' : String(v));
  return {
    id: s(m.id), memberCode: s(m.memberCode), fullName: s(m.fullName),
    dob: s(m.dob), gender: s(m.gender), className: s(m.className),
    unitId: s(m.unitId), joinDate: s(m.joinDate), joinPlace: s(m.joinPlace),
    phone: s(m.phone), email: s(m.email), homeAddress: s(m.homeAddress),
  };
}

// Hash hồ sơ = SHA-256(JSON canonical của profileCore)
function profileHash(profileRow) {
  return sha256Hex(canonicalize(profileCore(profileRow)));
}

function txId(seed) {
  const { randomUUID } = require('crypto');
  return seed ? sha256Hex(seed + Date.now() + Math.random()).slice(0, 24) : randomUUID().replaceAll('-', '').slice(0, 24);
}

module.exports = { canonicalize, sha256Hex, profileCore, profileHash, txId, VOLATILE_KEYS };
