#!/bin/bash
# 华为家庭存储 SMB 自动挂载（幂等，供 launchd 每分钟调用，见 launchd/com.sologallery.nas-mount.plist）
#
# 作用：
# 1. 开机/登录后自动挂载（等网络就绪，重试 ~60s）
# 2. 睡眠唤醒/网络抖动导致 smbfs 掉线后自动重挂
# 3. 挂载(或重挂)成功后重启 nas-watcher 容器 —— docker 的 bind 挂载在容器启动时
#    解析，挂载晚于容器启动时容器内是空目录，必须重启容器重新绑定
#
# 手动执行：bash scripts/mount-nas.sh
set -u

# GUEST 免密访问 smb://192.168.31.10/家庭共享（共享名中文须 URL 编码；
# 监听的目录是其中的「皓亮君作品集」，由 .env 的 NAS_SRC_HOST 指定）
SMB_URL='//GUEST@192.168.31.10/%E5%AE%B6%E5%BA%AD%E5%85%B1%E4%BA%AB'
MOUNT_POINT="/Users/haoliang/huawei-nas"
WATCHER_CONTAINER="sologallery-nas-watcher"
# launchd 环境 PATH 受限，docker 用绝对路径（OrbStack/常规安装各留一路）
DOCKER="/usr/local/bin/docker"
[ -x "$DOCKER" ] || DOCKER="$HOME/.orbstack/bin/docker"
ATTEMPTS=12   # 每次 sleep 5s，共等 ~60s 网络就绪

now() { date '+%F %T'; }

# 挂载健康检查：不只看挂载表，还要发真实 IO（带 8s 看门狗）——
# ① 每分钟轻触一次目录，保活 SMB 会话，防 NAS 端踢空闲连接；
# ② 能发现"挂在表里但连接已僵死"的挂载（那种状态读写会卡死进程）
probe_ok() {
  ( ls "${MOUNT_POINT}" >/dev/null 2>&1 ) &
  local p=$!
  ( sleep 8; kill "$p" 2>/dev/null ) &
  local w=$!
  wait "$p" 2>/dev/null
  local rc=$?
  kill "$w" 2>/dev/null; wait "$w" 2>/dev/null
  return $rc
}

if mount | grep -q "on ${MOUNT_POINT} (smbfs"; then
  if probe_ok; then
    exit 0   # 健康，静默（保活已由 ls 完成，不刷日志）
  fi
  # 挂载表在但 IO 僵死：强制卸载后走下面的重挂流程
  echo "$(now) 挂载僵死，强制卸载重挂"
  umount -f "${MOUNT_POINT}" 2>/dev/null
  diskutil unmount force "${MOUNT_POINT}" >/dev/null 2>&1
fi

mkdir -p "$MOUNT_POINT"
for i in $(seq 1 $ATTEMPTS); do
  if mount_smbfs "$SMB_URL" "$MOUNT_POINT" 2>/dev/null; then
    echo "$(now) 挂载成功: ${MOUNT_POINT}"
    if [ -x "$DOCKER" ] && "$DOCKER" ps --format '{{.Names}}' 2>/dev/null | grep -q "^${WATCHER_CONTAINER}$"; then
      "$DOCKER" restart "$WATCHER_CONTAINER" >/dev/null 2>&1 \
        && echo "$(now) 已重启 ${WATCHER_CONTAINER}（重新绑定挂载点）"
    fi
    exit 0
  fi
  sleep 5
done

echo "$(now) 挂载失败（NAS 不在线或网络未就绪），等待下次检查重试" >&2
exit 1
