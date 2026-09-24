// Sinh mã QR (SVG) offline — dùng thư viện qrcode-generator (MIT) đã nhúng tại vendor/
import qrcode from '../vendor/qrcode-generator.js';

/**
 * Trả về { d, size } để render <svg viewBox="0 0 size size"><path d=.../></svg>
 * margin = số module viền trắng quanh mã
 */
export function qrSvg(text, { ecl = 'M', margin = 2 } = {}) {
  const qr = qrcode(0, ecl); // typeNumber 0 = tự chọn phiên bản nhỏ nhất chứa được dữ liệu
  qr.addData(text);
  qr.make();
  const n = qr.getModuleCount();
  let d = '';
  for (let r = 0; r < n; r += 1) {
    for (let c = 0; c < n; c += 1) {
      if (qr.isDark(r, c)) d += `M${c + margin} ${r + margin}h1v1h-1z`;
    }
  }
  return { d, size: n + margin * 2 };
}

/** URL xác minh công khai cho thẻ đoàn viên (dùng cho QR) */
export function verifyUrl(memberCode, profileHash) {
  const base = `${window.location.origin}${window.location.pathname}`;
  return `${base}#/verify?code=${encodeURIComponent(memberCode)}&hash=${encodeURIComponent(profileHash)}`;
}
