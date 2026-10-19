# 华为家庭存储 → soloGallery 自动导入（NAS 监听容器）

把华为家庭存储（SMB「网络邻居」共享）里的照片作为数据源：宿主 Mac 挂载 SMB，
`nas-watcher` 独立容器每 120s 增量扫描,新照片自动进 MinIO + MySQL,已运行的画廊
直接可见。**只增不删**（下架走画廊后台），sha1 内容寻址天然幂等。

```
华为家庭存储 --SMB--> 宿主挂载点 --bind ro--> nas-watcher 容器(无端口)
      --S3 SDK/Prisma--> MinIO(objects/<sha1> + display/) + MySQL --> 画廊
```

> 为什么是轮询不是文件事件：macOS FSEvents 收不到 SMB 卷上由**其他设备**（手机/
> NAS 端）产生的变更，fswatch 对主场景无效。轮询 + stat 增量缓存（未变文件不读
> 字节）在使用上等同监听；新照片从落盘到入画廊约 2–4 分钟（含防半写保护期）。

## 一、开启共享并挂载（一次性）

1. 手机「智慧生活」App → 华为家庭存储 → **开启"网络邻居"**（只有「家庭共享」
   与「个人共享」文件夹可被共享；相册照片需先位于其中）。
2. Mac 挂载：Finder ⌘K → `smb://<NAS 内网 IP>` → 选共享文件夹，挂载在
   `/Volumes/<共享名>`。要开机自动重挂，把它加入
   系统设置 → 通用 → 登录项与扩展 → 登录项。
   官方文档：[电脑通过网络邻居（samba）访问华为家庭存储](https://consumer.huawei.com/cn/support/content/zh-cn15927787)
3. Docker Desktop → Settings → Resources → **File Sharing** 确认包含该挂载路径
   （默认含 `/Volumes`）。

## 二、配置

`.env` 追加（确认 MinIO/MySQL 连接串与画廊容器用的是同一份）：

```ini
NAS_SRC_HOST=/Volumes/你的共享名        # 宿主挂载点绝对路径
WATCH_INTERVAL_SECONDS=120             # 轮询间隔秒（下限 30）
```

**容器怎么连 MinIO/MySQL（二选一）**：

- **走宿主端口**（默认，零配置）：MinIO/MySQL 的端口已映射到宿主，`.env` 里
  主机名写 `host.docker.internal`（compose 已配 host-gateway 映射）。
  例：`MINIO_ENDPOINT="host.docker.internal"`、
  `DATABASE_URL="mysql://user:pass@host.docker.internal:3306/sologallery"`。
- **走 docker 网络**：MinIO/MySQL 与画廊在同一网络时，取消
  `docker-compose.watcher.yml` 底部 `networks:` 注释并填网络名，`.env` 主机名
  改用服务名（如 `minio`、`mysql`）。

## 三、启动

```bash
# 预演（只扫描统计，不写任何东西；先确认扫描数量与体积）
docker compose -f docker-compose.watcher.yml run --rm nas-watcher \
  npx tsx scripts/import-photoprism.mts --src /nas-src --dry-run

# 常驻启动（首轮即全量导入，之后每轮增量）
docker compose -f docker-compose.watcher.yml up -d --build

# 日志 / 暂停 / 恢复
docker compose -f docker-compose.watcher.yml logs -f
docker compose -f docker-compose.watcher.yml down
docker compose -f docker-compose.watcher.yml up -d
```

增量缓存放容器卷 `nas-watch-cache`（容器内 `/app/.cache`），重建容器无需全量重扫。
容器内源路径固定 `/nas-src`，换宿主挂载点不影响缓存。

## 四、行为细节

- **防半写**：mtime 距今不足 120s 的文件本轮跳过（手机备份可能写一半），可用
  `--min-age` / `WATCH_INTERVAL_SECONDS` 调。
- **挂载掉线**：容器内 `/nas-src` 消失 → 每轮打一行跳过日志，不崩溃不报错，
  重挂后下一轮自动恢复（SMB 断连后目录可能变空而非消失——首轮导入后若某轮
  突然扫描到 0 个文件，先在宿主确认挂载是否还在，别让缓存被清空重扫）。
- **垃圾文件**：自动跳过 `._*`（AppleDouble）、`.*` 隐藏文件、`#*` 回收站。
- **格式**：默认收 jpg/jpeg/heic/png，预演命令里加 `--ext=...` 可覆盖；RAW/
  视频不导入。`NAS_SRC_HOST` 可以指向挂载点下的子目录（如
  `/Volumes/<共享>/images`），只监听照片目录、不扫共享里的视频/杂物。
- **手动跑一轮/全量重扫**：
  `docker compose -f docker-compose.watcher.yml run --rm nas-watcher npx tsx scripts/import-photoprism.mts --src /nas-src`
  （加 `--no-cache` 忽略并重建缓存）。
- **GPS 地名反查**：导入完成后可跑 `backfill-gps.mts` 补。

## 五、排查

| 现象 | 处理 |
| --- | --- |
| 容器内 `ls /nas-src` 为空 | Docker Desktop File Sharing 未放行该路径；或宿主挂载已掉线 |
| 一直"源目录不存在" | `NAS_SRC_HOST` 拼写/挂载点变了，`docker compose -f docker-compose.watcher.yml config` 核对 bind 源 |
| 连不上 MinIO/MySQL | 按上文"二选一"核对 `.env` 主机名与网络方式；容器内 `getent hosts host.docker.internal` 验证 |
| 照片没进画廊 | `logs -f` 看本轮统计（失败数/魔数未知数）；确认连的库和画廊是同一个 |
| 想强制重扫 | 停容器 → `docker volume rm <项目>_nas-watch-cache` → 再 up |
