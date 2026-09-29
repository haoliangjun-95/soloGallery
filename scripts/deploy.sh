#!/bin/bash
# soloGallery 服务器部署脚本 —— 在服务器仓库根目录执行。
# 顺序固定：schema 先行（db:push 必须在 build/restart 之前，否则新代码查询
# 缺列直接整站错误页 —— 2026-09-29 gridReady 事故的教训）。
# 用法：./scripts/deploy.sh [分支名，默认 main]
set -euo pipefail
cd "$(dirname "$0")/.."

BRANCH="${1:-main}"
echo "=== [1/6] 拉取代码（${BRANCH}）==="
# GitHub 直连不稳定是国内服务器的常态：fetch 失败时回退到本地分支状态
# （代码常经 ssh 中继先到达服务器），不阻断部署
if git fetch origin "${BRANCH}" 2>/dev/null; then
  git merge --ff-only "origin/${BRANCH}" || { echo "✗ 无法快进到 origin/${BRANCH}"; exit 1; }
else
  echo "⚠ fetch origin 失败（GitHub 不可达），沿用本地 ${BRANCH}"
  git merge --ff-only "${BRANCH}" || { echo "✗ 本地 ${BRANCH} 无法快进"; exit 1; }
fi
git log --oneline -1 | head -c 60; echo

echo "=== [2/6] 安装依赖 ==="
npm install --no-audit --no-fund

echo "=== [3/6] 同步数据库 schema（先于构建）==="
npx prisma db push

echo "=== [4/6] 构建（清缓存防 dev/build 产物串味）==="
rm -rf .next
npm run build

echo "=== [5/6] 重启进程 ==="
pm2 restart sologallery || pm2 start npm --name sologallery -- start
pm2 save

echo "=== [6/6] 健康检查 ==="
sleep 4
for i in 1 2 3; do
  code=$(curl -s -o /dev/null -w '%{http_code}' -m 10 http://127.0.0.1:3000/ || true)
  [ "$code" = "200" ] && { echo "web: 200 ✓"; exit 0; }
  echo "第 ${i} 次未就绪（${code}），等待重试…"; sleep 5
done
echo "✗ 部署后健康检查失败，请查 pm2 logs sologallery"
exit 1
