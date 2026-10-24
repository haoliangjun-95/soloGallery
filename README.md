# soloGallery

个人图片画廊：前台公开浏览 + 评论互动，单管理员后台。与桌面壁纸软件**共用同一个 MinIO 桶**——壁纸软件持续把图片同步进桶，画廊作为消费者解析其 manifests 导入图片并补齐展示变体；元数据存 MySQL；详情页展示完整 EXIF。

技术栈：Next.js 16 (App Router) · Prisma 7 + MySQL · AWS SDK S3 (MinIO) · sharp · exifr · iron-session · Tailwind CSS 4

## 功能截图

|                首页（固定宽高网格 + 侧栏筛选菜单）                |                 照片详情（EXIF 卡 / 相邻导航 / 幻灯片）                  |
| :----------------------------------------------------------: | :---------------------------------------------------------------: |
|        ![首页](docs/images/home.jpg)        |              ![详情](docs/images/detail.jpg)              |
|                地图（聚类气泡 + 深色玻璃弹窗）                 |                     统计面板（趋势 / 器材 / 标签云）                     |
|                ![地图](docs/images/map.jpg)                 |                ![统计](docs/images/stats.jpg)                 |
|                  日历视图（月份文件夹封面）                   |                       移动端（chips 横滑 / PWA）                        |
|                ![日历](docs/images/calendar.jpg)                |                ![移动端](docs/images/mobile.jpg)                |

> 截图为线上真实界面（https://gallery.haoliangjun.com）。

## 与壁纸软件的共享桶契约

```
<bucket>/
├── manifests/<deviceUuid>-<ts>.json   # 壁纸软件写：各设备清单快照（含 tombstone，CRDT/LWW）
├── thumbs/<id>_<hash8>.webp           # 壁纸软件写：缩略图 webp（画廊只读复用作网格图；hash8=sha1 前 8 位）
├── objects/<sha1>                     # 壁纸软件写：原图二进制，内容寻址、无扩展名、永不覆盖
└── display/<sha1>.webp                # 画廊写：1920w WebP 展示图，公共读
```

manifest 真实 schema（2026-09 对生产桶体检确认，解析器按此实现并带 duck-typing 回退）：

```jsonc
{
  "version": 1, "updatedAt": 1789894608476, "updatedBy": "<deviceUuid>",
  "images": [{ "id", "fileName", "hash"(sha1), "width", "height", "sizeBytes",
               "format": "jpg", "categoryId": "cat-id | null", "tags": [],
               "favorite": false, "addedAt", "updatedAt", "updatedBy" }],
  "categories": [{ "id", "name", "createdAt", "updatedAt" }],
  "tombstones": [{ "id", "kind": "image | category", "deletedAt", "deletedBy" }]
}
```

- 画廊**只写** `display/`（及自己上传路径的 `objects/<sha1>`，内容寻址不冲突）；**不改不删** `objects/`、`thumbs/`、`manifests/`
- 桶策略（`npm run policy` 幂等设置）：`display/*`、`thumbs/*` 匿名可读；`objects/`、`manifests/` 私有，原图走校验 published 后的 presigned 302
- 删除图片 = 删画廊记录 + 自己的 display 对象，绝不动壁纸软件资产
- 壁纸软件侧 tombstone：被桌面端删除的图，画廊同步时自动标记「源已缺失」并下架，后台可见可清理
- 画廊侧上传的图片壁纸软件不可见（它只认 manifests）；未来可选让画廊伪装成一台设备写 manifest 实现互通

### 同步引擎（`src/lib/sync.ts`）

1. `manifests/` 取每设备最新快照 → 按 schema 解析（找不到 `images` 键时回退 duck-typing）
2. 按壁纸软件规则归并：**tombstone 按记录 id 命中即死亡（分 image/category 两类）**、记录级 LWW（updatedAt 大者胜、同则 deviceId 字典序）、存活记录间 favorite 取或 / tags 并集、categoryId 经顶层 categories 映射为名称
3. 新图：下载 `objects/<sha1>` → 魔数嗅探格式 → exifr 提 EXIF → sharp 生成 `display/<sha1>.webp` → 入库（默认未发布；文件名直接用 manifest 的 fileName）
4. 已有图：补齐缺失的 display、回填文件名、复活 missing
5. 幂等可重跑；触发：后台手动按钮 / 应用内定时（默认 15 分钟，设置可调）

> 自建 MinIO 若自定义了 region（如 `cn-local`），在 `.env` 配 `MINIO_REGION`。

## 快速开始（真实环境）

```bash
cp .env.example .env       # 填 DATABASE_URL / MINIO_* / SESSION_SECRET 等
npm install
npm run db:push            # 建表（或 npm run db:migrate 走迁移）
npm run db:seed            # 创建管理员 + 默认设置
npm run inspect-bucket     # Phase 0 桶体检：核对 manifest 结构 / thumbs 命名 / EXIF 完整性
npm run policy             # 给 display/ 与 thumbs/ 设公共读（幂等）
npm run build && npm start # 或 npm run dev
```

登录 `/admin/login`（默认 admin / admin123456，来自 env），登录后可在「设置」页直接修改密码。进「同步」页点「立即从桶同步」。

## 本地开发（无需真实 MinIO/数据库也有一半可玩）

```bash
npm run fake-bucket        # 起 s3rver 内存桶 + 按壁纸软件约定灌 8 张夹具图（Ctrl+C 退出）
npm run selftest           # 无 DB 的核心管线自检：EXIF/嗅探/display/manifest 归并
```

`.env` 默认指向 fake-bucket（127.0.0.1:4571）。配好 MySQL 后可跑完整 e2e：

```bash
DATABASE_URL="mysql://user:pass@host:3306/sologallery_e2e" npm run db:push
DATABASE_URL="mysql://user:pass@host:3306/sologallery_e2e" npm run e2e:sync
```

（安全闸：e2e 会清写库，数据库名必须含 `e2e`。）

## 功能总览

### 浏览体验

- **五种视图**：固定宽高（默认，统一卡片 + 拍摄信息）/ 瀑布纯图 / 详细信息卡 / 拼图正方形 / 列表，悬停提示视图效果；移动端精简为三种
- **多尺寸 srcset**：每图 400w/800w 网格变体，按视口与 DPR 自动选档（老图自动回退 src）
- **侧栏筛选菜单**：分类 / 年份 / 标签 / 器材四组，**快筛输入框跨组过滤**（大小写不敏感、无匹配组隐藏）、分组折叠（默认 8 项、**激活项永不消失**）、分组头整组收起、点选后自动回落
- **移动端**：分类 / 年份 / 标签 / 器材横滑 chips，**再点激活项即反选该维度**（其余筛选保留）；单行页头
- **筛选叠加**：分类 × 标签 × 年份 × 月份 × 收藏 × 机身 × 镜头 × 名称搜索任意组合
- 无限滚动（失败显式重试）+ 回到顶部

### 发现与回顾

- **日历视图**：月份文件夹封面卡片 → 单月浏览，前后月切换
- **年度归档**：`/archive/<年>` 每月收藏优先精选长页
- **那年今日** + **随机漫游**（水塘抽样，每次点击换一批）
- **地图**：Leaflet + 高德瓦片（免 key）、数字聚类气泡、深色玻璃弹窗缩略图网格、GCJ-02 坐标纠偏、空态不泄露隐私开关状态
- **统计面板** `/stats`：年度趋势柱 / 器材使用占比 / 题材分布 / 标签云 / 总览瓦片（总数·体积·收藏·跨度·GPS 覆盖）
- **详情页**：EXIF 卡（时区 Asia/Shanghai）、上一张/下一张（←/→ 键盘 + 当前筛选上下文）、面包屑返回、灯箱缩放、原图下载（受设置开关控制）
- **幻灯片放映**：全屏自动播放，播到末尾**后台续页**（按 sha1 去重）、键盘控制（Esc/←/→/空格）、尊重 prefers-reduced-motion

### 互动与通知

- **评论**：自动通过 + 纯本地反垃圾（敏感词 / 链接垃圾 / 重复刷屏 / 纯表情 / 蜜罐 / IP 滑窗限流 1 条/分钟），命中静默标记不打草惊蛇；字数实时计数、渐进展开
- **新评论 webhook 通知**：Server酱 / Telegram Bot（失败仅记日志不影响主流程）
- 收藏与壁纸软件**按「或」语义合并**（只增不减）

### 管理后台（`/admin`）

- **图片管理**：分类/年份/标签/状态/收藏/搜索组合筛选、**乐观更新**（失败行级回滚）、批量发布/移动分类/加标签/删除、页码分页
- **相似照片**：dHash 感知哈希按汉明距离三档（严格 4 / 标准 6 / 宽松 10）分组、推荐保留者（收藏→像素→字节）、勾选保留批量清理其余，删除同步清理桶内变体
- **上传**：拖拽多选、**3 路并发池**、字节级进度条、HEIC 自动转码、失败单项/一键全部重试、超限入队即拦
- **同步页**：手动触发 / 运行历史 / 源缺失列表
- 分类 / 标签 / 评论（未读徽标·审核·回复）/ 设置（站名·Logo·每页数·审核模式·同步间隔·自动发布·原图开关·评论通知·修改密码）

### 隐私与安全

- **GPS 隐私开关**：关闭时公开 API/DTO 整键剔除坐标与地名（管理员仍可见）
- **原图访问控制**：默认走校验 published 后的 presigned 302，可整站关闭
- CSP / X-Frame-Options / HSTS 等安全头、登录限流（15 分钟 10 次）、上传限额（30MB × 20）、公开 API 限流（120 次/分钟）
- **PWA**：可安装到主屏幕（动态 manifest + maskable 图标）、Service Worker 离线缓存（图片 cache-first LRU 400 / 静态 SWR / 导航 network-first + 离线页）

### SEO 与订阅

- 详情页 OG / Twitter 分享卡片（缩略图带尺寸防纵横比失真）
- sitemap（照片 / 分类 / 标签页）+ RSS 2.0（media 缩略图扩展，阅读器自动发现）

**位置信息**：照片带 GPS 时自动逆向地理编码（Photon，国内服务器可达；结果缓存于 `exif.gps.location`），卡片与详情页显示「📍 市 / 区」；无 GPS 的照片自动隐藏。

EXIF 卡格式（时区 Asia/Shanghai）：

```
拍摄   2026 年 2 月 12 日 周四 GMT+8 15:55
相机   Canon EOS R6m2, ISO 100, 1/160
镜头   RF24-105mm F4 L IS USM, 63mm, f/4
文件   JPEG, 4000 × 6000, 6.5 MB
文件名 1C9A9846.jpg
```

## 脚本

| 命令 | 说明 |
|---|---|
| `npm run selftest` | 无 DB 核心管线自检（EXIF/嗅探/display/归并） |
| `npm run e2e:sync` | 完整端到端：伪壁纸桶 → 同步 → MySQL 断言（需 e2e 库） |
| `npm run fake-bucket` | 起 s3rver 伪壁纸桶（开发用） |
| `npm run inspect-bucket` | 真实桶只读体检（Phase 0 假设核验） |
| `npm run dry-run` | 真实桶只读预演：解析归并 → 与 objects/thumbs 比对，不写任何数据 |
| `npm run policy` | 设置 display/thumbs 公共读桶策略（幂等） |
| `npm run sync` | 命令行手动触发一次同步 |
| `npm run db:push / db:migrate / db:seed` | 建表 / 迁移 / 管理员与默认设置 |

## 部署

`next build && next start`（pm2/systemd 守护），定时同步随应用进程启动（`src/instrumentation.ts`，`SYNC_ENABLED=false` 可关）。依赖：Node ≥ 20.9、MySQL 8、可达的 MinIO。`next.config.ts` 已开 `output: "standalone"`，对 pm2 流程无影响，仅为 Docker 产出 `.next/standalone`。

### Docker 镜像

多阶段构建（`node:20-alpine`）：deps 装依赖 + `prisma generate` → `next build` → 只带 standalone 产物的运行镜像。**构建期不连任何服务**（页面全部 force-dynamic、Prisma 客户端懒初始化），密钥全部运行时注入，不进镜像层。

```bash
# 构建（首次较慢，npm ci 全量装依赖）
docker build -t sologallery:latest .

# 国内网络拉不到官方源时，经镜像加速站拉基础镜像
docker build --build-arg NODE_IMAGE=docker.m.daocloud.io/library/node:20-alpine -t sologallery:latest .

# Apple Silicon 机器构建部署到 x86 服务器时指定平台
docker build --platform linux/amd64 -t sologallery:latest .

# 运行
docker run -d --name sologallery \
  -p 3000:3000 \
  --env-file <(sed 's/"//g' .env) \
  --restart unless-stopped \
  sologallery:latest

# 或用 compose（推荐：env_file 按 dotenv 规则解析，.env 的引号自动剥掉）
docker compose up -d
```

注意事项：

- **CSP 构建期求值**：`next.config.ts` 的 `headers()` 在 build 时生成 CSP，`img-src` 放行的 MinIO origin 来自 `MINIO_PUBLIC_BASE_URL`。若它是 **http 内网地址**（如 `http://192.168.1.10:9000`），构建时必须传 `--build-arg MINIO_PUBLIC_BASE_URL=http://192.168.1.10:9000`（compose 会自动从 `.env` 取值传入），否则 CSP 拦图；https 公网地址走默认回退可省略
- **容器内的 127.0.0.1 是容器自己**：`.env` 的 `MINIO_ENDPOINT`/`DATABASE_URL` 主机名要改成宿主机内网 IP，或 `host.docker.internal`（macOS/Windows 直通；Linux 需 `--add-host=host.docker.internal:host-gateway`，compose 文件已带）
- `docker run --env-file` **不去引号**：`.env` 里的 `"mysql://..."` 引号会被当作值的一部分导致解析失败，上面命令用 `sed` 现场剥掉；compose 则无此问题
- 首次建表/种子（`npm run db:push && npm run db:seed`）在宿主机跑一次即可，运行镜像内不含 scripts/devDependencies
- nginx 反代之后设 `TRUST_PROXY=true`，评论限流才采信 X-Forwarded-For；且反代须**覆写**而非追加 XFF（宝塔默认 `$proxy_add_x_forwarded_for` 是追加模式，客户端可伪造首跳绕过按 IP 限流，应改为 `$remote_addr`）
- 反爬/防盗链的 nginx 配置存档在 `deploy/nginx/`（线上由宝塔管理、不在仓库）：AI 爬虫 UA 拦截 + 恶意段 deny + 全站/图片限流 + `/bucket/` 外站 Referer 403，名单与 `src/app/robots.ts` 同步维护，应用/回滚步骤见该目录 README
- 日志：`docker logs -f sologallery`；定时同步随容器内 Next 进程自动启动

## 已知边界

- `objects/<sha1>` 无扩展名：一切格式判断走魔数，绝不依赖文件名
- sharp 预编译版无法解码 HEVC HEIC：由 heic-convert 解码（失败时入库但无 display，详情页回退原图）
- Prisma 7：新 `prisma-client` 生成器（输出 `src/generated/prisma`，已 gitignore，`postinstall` 自动 generate）+ `@prisma/adapter-mariadb` 驱动适配器；`prisma7.config.ts` 管理 CLI 的 DATABASE_URL（dotenv）
- manifests 的确切 schema 以真实桶为准，解析器做了防御性 duck-typing；接真实桶前先跑 `npm run inspect-bucket`
