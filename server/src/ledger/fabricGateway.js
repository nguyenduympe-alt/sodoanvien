/**
 * ============ ADAPTER HYPERLEDGER FABRIC THẬT (tùy chọn) ============
 * Khi có Docker + mạng Fabric (test-network), đặt biến môi trường:
 *     LEDGER_MODE=fabric
 * hệ thống sẽ dùng adapter này thay cho bộ mô phỏng — với CÙNG giao diện
 * submit(user, fn, args) / query(user, fn, args).
 *
 * Các bước chạy thật (xem README mục "Chạy với mạng Fabric thật"):
 *   1. cd server/chaincode && npm install && npm run deploy  (dùng fabric-deploy.sh)
 *   2. Export danh tính admin + connection profile vào server/fabric-config/
 *   3. Khởi động server với LEDGER_MODE=fabric
 *
 * Cài đặt: npm install @hyperledger/fabric-gateway (chỉ cần khi chạy chế độ thật)
 */
module.exports = {
  submit: async (user, fn, args) => {
    const gateway = requireFabric();
    const contract = gateway.getContract(user, 'sodoanvien');
    const tx = contract.newProposal(fn, { transientData: mapArgs(args) });
    await tx.endorse();
    await tx.submit();
    const result = structToJson(tx.getResult());
    return { txId: tx.getTransactionId(), result, fn, timestamp: new Date().toISOString() };
  },
  query: async (user, fn, args) => {
    const gateway = requireFabric();
    const contract = gateway.getContract(user, 'sodoanvien');
    const bytes = await contract.evaluateTransaction(fn, ...flattenArgs(args));
    return JSON.parse(Buffer.from(bytes).toString('utf8') || 'null');
  },
};

function requireFabric() {
  try {
    // eslint-disable-next-line global-require
    const fg = require('@hyperledger/fabric-gateway');
    return require('./fabric-connection')(fg); // mở gRPC tới gateway peer, dùng ví chứng thư đã cấp bởi Fabric CA
  } catch (e) {
    throw Object.assign(
      new Error(
        'Chưa cài @hyperledger/fabric-gateway hoặc chưa cấu hình mạng Fabric. ' +
          'Hãy đặt LEDGER_MODE=simulator để dùng bộ mô phỏng, hoặc làm theo README mục "Chạy với mạng Fabric thật".'
      ),
      { code: 'FABRIC_NOT_READY' }
    );
  }
}

function mapArgs(obj) {
  const out = {};
  for (const [k, v] of Object.entries(obj || {})) out[k] = Buffer.from(typeof v === 'string' ? v : JSON.stringify(v));
  return out;
}
function flattenArgs(obj) {
  return [Buffer.from(JSON.stringify(obj || {}), 'utf8')];
}
function structToJson(struct) {
  return JSON.parse(Buffer.from(struct).toString('utf8') || '{}');
}
