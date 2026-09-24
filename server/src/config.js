// Cấu hình trung tâm của hệ thống
module.exports = {
  PORT: process.env.PORT || 3000,
  JWT_SECRET: process.env.JWT_SECRET || 'do-an-luan-van-secret-demo-only',
  JWT_EXPIRES: process.env.JWT_EXPIRES || '12h',

  // LEDGER_MODE = 'simulator' (mặc định, chạy mọi nơi) | 'fabric' (chạy với mạng Fabric thật qua Fabric Gateway)
  LEDGER_MODE: process.env.LEDGER_MODE || 'simulator',

  DATA_DIR: process.env.DATA_DIR || `${__dirname}/../data`,
  SNAPSHOT_DIR: `${process.env.DATA_DIR || `${__dirname}/../data`}/snapshots`,

  // Lớp AI (tùy chọn) - tương thích mọi API chuẩn OpenAI (OpenAI, Azure OpenAI, Ollama, vLLM, Groq...)
  AI_BASE_URL: process.env.AI_BASE_URL || 'https://api.openai.com/v1',
  AI_API_KEY: process.env.AI_API_KEY || '',
  AI_MODEL: process.env.AI_MODEL || 'gpt-4o-mini',

  // P2 — Cổng tự động nhập liệu từ ảnh: tin cậy ≥ ngưỡng + 0 cảnh báo + không trùng → tự tạo hồ sơ
  AI_AUTO_THRESHOLD: (() => { const v = parseFloat(process.env.AI_AUTO_THRESHOLD); return Number.isFinite(v) ? Math.min(1, Math.max(0, v)) : 0.92; })(),
  // CHỈ DÙNG DEMO: AI_MOCK_EXTRACT=1 → extract trả kết quả mẫu không cần AI_API_KEY (để diễn dịch luồng tự động)
  AI_MOCK_EXTRACT: process.env.AI_MOCK_EXTRACT === '1',
  // P2b — Engine OFFLINE: 'auto' (mặc định: có key → cloud, không key → offline/Tesseract) | 'cloud' | 'offline'
  AI_PROVIDER: process.env.AI_PROVIDER || 'auto',

  // Tên mạng / channel / chaincode khi chạy với Fabric thật
  FABRIC: {
    CHANNEL: process.env.FABRIC_CHANNEL || 'sochannel',
    CHAINCODE: process.env.FABRIC_CHAINCODE || 'sodoanvien',
    MSP_ID: process.env.FABRIC_MSP || 'OrgQuanTriMSP',
    KEYSTORE: process.env.FABRIC_KEYSTORE || `${__dirname}/../fabric-identity`,
    CONNECTION_PROFILE: process.env.FABRIC_CP || `${__dirname}/../fabric-config/connection.json`,
  },
};
