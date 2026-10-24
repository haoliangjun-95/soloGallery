#!/bin/bash
# 服务器 MySQL(3306) 动态白名单 —— Mac 心跳端（launchd 每 5 分钟调用）
# 只做一件事：ssh 触发服务器端 /usr/local/sbin/mysql-whitelist.sh。IP 判断与
# 更新全在服务器侧完成（ssh 来源 IP 与 MySQL 连接同目的地同线路，是唯一可靠
# 依据；本地绝不用第三方 IP 查询站——多出口环境下那会查到另一条线的地址）。
# 服务器端无变化时静默；日志仅在更新时有一行。
set -u
SERVER="root@110.42.234.144"

OUT=$(ssh -o BatchMode=yes -o ConnectTimeout=12 "$SERVER" /usr/local/sbin/mysql-whitelist.sh 2>/dev/null)
if [ $? -ne 0 ]; then
  # ssh 不通（网络抖动等）：下轮再试，不算失败（避免 launchd 反复重启）
  echo "$(date '+%F %T') [mysql-whitelist] ssh 触发失败，下轮重试" >&2
  exit 0
fi
[ -n "$OUT" ] && echo "$(date '+%F %T') $OUT"
exit 0
