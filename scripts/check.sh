#!/usr/bin/env sh
# 谜盒·灵动知识舱 (mibox-xiaomi) 语法检查 + 单元测试 + 打包 + 小米大赛规范审计
set -e
export PATH="/opt/homebrew/bin:/usr/local/bin:$PATH"
cd "$(dirname "$0")/.."

echo ">>> [1/4] Node 语法检查 (extension/*.js)..."
find extension -name '*.js' -print0 | xargs -0 -n 1 node --check

echo ">>> [2/4] 运行核心引擎单元测试..."
node --test tests/unit.test.mjs

echo ">>> [3/4] 打包参赛 ZIP 产物..."
sh scripts/pack.sh

echo ">>> [4/4] 运行小米浏览器大赛 rw() 与 SKILL.md 合规审计..."
node scripts/verify-xiaomi.mjs
