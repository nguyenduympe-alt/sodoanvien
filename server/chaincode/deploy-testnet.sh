#!/usr/bin/env bash
# Triển khai chaincode lên test-network của Hyperledger Fabric (cần Docker)
# Yêu cầu: đã clone fabric-samples và bật test-network
#   cd fabric-samples/test-network && ./network.sh up createChannel -c sochannel -ca
set -euo pipefail
CHANNEL=${CHANNEL:-sochannel}
CC_NAME=${CC_NAME:-sodoanvien}
CC_VERSION=${CC_VERSION:-1.0}
CC_PATH="$(cd "$(dirname "$0")" && pwd)"

peer lifecycle chaincode package ${CC_NAME}.tar.gz --path "$CC_PATH" --lang node --label ${CC_NAME}_${CC_VERSION}
export ORDERER_CA=... ORG1_CA=... ORG2_CA=...   # chỉnh theo env của test-network
for ORG in peer0.org1.example.com:7051 peer0.org2.example.com:9051; do
  peer lifecycle chaincode install ${CC_NAME}.tar.gz --peerAddresses $ORG
done
echo "Tiếp theo: approveformyorg + commit (xem tài liệu test-network). Sau đó chạy server với LEDGER_MODE=fabric"
