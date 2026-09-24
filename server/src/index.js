/**
 * ============ BACKEND/API SERVER ============
 * Lớp 2 trong kiến trúc 5 lớp (đề cương mục 8.3):
 *   giao diện (client/) → API này → off-chain DB (SQLite) → ledger Fabric (mô phỏng/thật) → kho snapshot
 */
const express = require('express');
const path = require('path');
const fs = require('fs');
const config = require('./config');
const { init } = require('./db');
const ledger = require('./ledger/simulator');

const authRoutes = require('./auth');
const { router: membersRouter } = require('./routes/members');
const { router: transferRouter } = require('./routes/transfers');
const { router: adminRouter } = require('./routes/admin');
const { router: intakeRouter } = require('./routes/intake');
const { router: miscRouter } = require('./routes/misc');

init();
ledger.flushBlock();

const app = express();
app.use(express.json({ limit: '2mb' }));

// Log mọi thao tác ghi (vết truy vấn ở tầng ứng dụng)
app.use((req, res, next) => {
  if (req.method !== 'GET') console.log(`[api] ${req.method} ${req.path} by ${req.user?.username || '-'}`);
  next();
});

app.get('/api/health', (req, res) => res.json({ ok: true, mode: config.LEDGER_MODE, time: new Date().toISOString() }));
app.use('/api', (require('./routes/auth')).router);
app.use('/api', membersRouter);
app.use('/api', transferRouter);
app.use('/api', adminRouter);
app.use('/api', intakeRouter);
app.use('/api', miscRouter);

// Phục vụ giao diện đã build (client/dist)
const CLIENT_DIST = path.join(__dirname, '../../client/dist');
if (fs.existsSync(CLIENT_DIST)) {
  app.use(express.static(CLIENT_DIST));
  app.get(/^(?!\/api\/).*/, (req, res) => res.sendFile(path.join(CLIENT_DIST, 'index.html')));
}

// Xử lí lỗi tập trung: ánh xạ mã lỗi ledger → mã HTTP
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  console.error('[error]', err.stack || err.message);
  if (err.type === 'entity.parse.failed') return res.status(400).json({ error: 'JSON không hợp lệ' });
  res.status(err.status || 500).json({ error: err.message || 'Lỗi hệ thống' });
});

app.listen(config.PORT, '0.0.0.0', () => {
  console.log(`✅ Server đang chạy tại http://0.0.0.0:${config.PORT} (LEDGER_MODE=${config.LEDGER_MODE})`);
});
