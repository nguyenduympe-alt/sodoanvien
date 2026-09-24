/**
 * ============ BỘ KẾT NỐI ĐỊNH DANH ĐIỆN TỬ (VNeID / eKYC) ============
 * Nguyên tắc: hệ thống KHÔNG tự xác minh CCCD — chỉ "hỏi" một nhà cung cấp
 * xác thực định danh rồi ghi VẾT KẾT QUẢ (không phải dữ liệu cá nhân) lên ledger.
 *
 * Ba cấp độ triển khai (cấu hình qua .env: VNEID_PROVIDER):
 *   1. mock  (mặc định) — mô phỏng phản hồi của Cơ sở dữ liệu định danh, dùng demo.
 *   2. http  — gọi API thật của nhà cung cấp eKYC thương mại (VNPT, Viettel, FPT...)
 *              hoặc dịch vụ xác thực định danh của Bộ Công an khi đơn vị đã ký hợp đồng.
 *   3. (tương lai) VNeID mức 2 chính thức qua Cổng kết nối liên thông/NDBR.
 *
 * Cơ sở pháp lý (trích trong tài liệu luận văn):
 *   - Luật Định danh điện tử số 18/2023/QH15 (hiệu lực 01/7/2024)
 *   - Nghị định 33/2024/NĐ-CP quy định chi tiết Luật Định danh điện tử
 *   - Thông tư 58/2022/TT-BCA về định danh điện tử
 *   - Nghị định 13/2023/NĐ-CP về bảo vệ dữ liệu cá nhân
 */

const crypto = require('crypto');
const { sha256Hex, canonicalize } = require('../canonical');

const PROVIDER = process.env.VNEID_PROVIDER || 'mock';
const BASE_URL = process.env.VNEID_BASE_URL || '';
const API_KEY = process.env.VNEID_API_KEY || '';

/** Mã định danh điện tử mô phỏng: ổn định theo CCCD (demo) */
function mockMdids(cccd) {
  return 'MD' + crypto.createHash('sha256').update('vneid-mdid:' + cccd).digest('hex').slice(0, 12).toUpperCase();
}

/**
 * Provider MOCK — mô phỏng kết quả tra cứu định danh mức 2.
 * Quy ước demo (ghi rõ ở giao diện):
 *   - CCCD đủ 12 số, không kết thúc bằng 0/9 → ✅ XÁC THỰC Đạt, thông tin khớp
 *   - CCCD kết thúc bằng '0'               → ❌ NOT_FOUND (không có trong CSDL)
 *   - CCCD kết thúc bằng '9'               → ⚠️ MISMATCH (thông tin lệch với CSDL định danh)
 */
function mockVerify({ cccd, expected, input }) {
  const clean = String(cccd || '').replace(/\D/g, '');
  if (clean.length !== 12) {
    return { ok: false, code: 'INVALID_INPUT', message: 'CCCD phải gồm đúng 12 chữ số' };
  }
  if (clean.endsWith('0')) {
    return { ok: false, code: 'NOT_FOUND', message: 'Không tìm thấy định danh điện tử với số CCCD này trong CSDL (mô phỏng)' };
  }
  // Mô phỏng "bản ghi trong CSDL định danh": lệch nếu CCCD kết thúc bằng '9'
  const simMismatch = clean.endsWith('9');
  if (simMismatch) {
    return {
      ok: false, code: 'MISMATCH',
      message: 'Thông tin không khớp với CSDL định danh (mô phỏng): họ tên/ngày sinh khác bản ghi định danh mức 2',
      provider: 'mock',
    };
  }
  // So thông tin nhập với hồ sơ đang có (để báo cán bộ rà lại nếu lệch — không quyết định kết quả)
  const matched = { fullName: true, dob: true };
  if (expected && expected.fullName && input && input.fullName) {
    const norm = (s) => String(s).normalize('NFC').replace(/\s+/g, ' ').trim().toLowerCase();
    matched.fullName = norm(expected.fullName) === norm(input.fullName);
  }
  if (expected && expected.dob && input && input.dob) {
    matched.dob = String(expected.dob) === String(input.dob);
  }
  const result = {
    verified: true,
    provider: 'mock',
    level: 2, // định danh mức 2
    mdid: mockMdids(clean),
    matched,
    refCode: 'VNEID-' + crypto.randomBytes(4).toString('hex').toUpperCase(),
    at: new Date().toISOString(),
  };
  return { ok: true, ...result };
}

/**
 * Provider HTTP — khung sẵn cho eKYC thương mại / dịch vụ Bộ Công an.
 * Mỗi nhà cung cấp có payload khác nhau; tùy chỉnh mapRequest/mapResponse khi ký hợp đồng.
 */
async function httpVerify({ cccd, mdid, fullName, dob }) {
  if (!BASE_URL || !API_KEY) {
    return {
      ok: false, code: 'PROVIDER_NOT_CONFIGURED',
      message: 'Chưa cấu hình nhà cung cấp xác thực định danh (VNEID_BASE_URL / VNEID_API_KEY). Đang dùng VNEID_PROVIDER=mock cho demo.',
    };
  }
  try {
    const res = await fetch(`${BASE_URL.replace(/\/$/, '')}/verify`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${API_KEY}` },
      body: JSON.stringify({ idNumber: cccd, mdid, fullName, dob }),
      signal: AbortSignal.timeout(12000),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) return { ok: false, code: 'PROVIDER_ERROR', message: data?.message || `Nhà cung cấp trả về HTTP ${res.status}` };
    return {
      ok: !!data.verified,
      provider: data.provider || 'http',
      level: data.level || null,
      mdid: data.mdid || null,
      refCode: data.ref || null,
      at: new Date().toISOString(),
      raw: undefined, // không lưu raw payload chứa dữ liệu cá nhân
    };
  } catch (e) {
    return { ok: false, code: 'PROVIDER_UNREACHABLE', message: 'Không kết nối được nhà cung cấp định danh: ' + e.message };
  }
}

/**
 * API chính: xác thực định danh.
 * @param {{cccd, mdid?, fullName, dob, gender?}} input
 * @returns kết quả chuẩn hóa { ok, verified?, provider, level?, mdid?, refCode?, at? , code?, message?}
 */
async function verifyIdentity(input) {
  const result = PROVIDER === 'http'
    ? await httpVerify(input)
    : mockVerify({ ...input, input });
  // Hash kết quả xác thực để ghi vết lên ledger (KHÔNG chứa CCCD/dữ liệu cá nhân)
  if (result.ok) {
    result.resultHash = sha256Hex(canonicalize({
      mdid: result.mdid || null, ref: result.refCode || null,
      provider: result.provider, level: result.level || null, at: result.at,
    }));
  }
  return result;
}

module.exports = { verifyIdentity, PROVIDER };
