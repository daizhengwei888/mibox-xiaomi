#!/usr/bin/env sh
# 打包符合小米浏览器 Vibe Coding 大赛规范的扩展 ZIP 包（manifest.json 位于 ZIP 根目录）
set -e
cd "$(dirname "$0")/.."
VERSION=$(sed -n 's/.*"version": *"\([^"]*\)".*/\1/p' extension/manifest.json | head -n 1)
mkdir -p dist
OUT="dist/mibox-xiaomi-$VERSION.zip"
rm -f "$OUT"
(cd extension && zip -qr -X "../$OUT" . -x '.*' '__MACOSX/*' '*.DS_Store' 'tests/*' 'outputs/*')
echo "$OUT"
