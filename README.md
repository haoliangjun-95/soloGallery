# soloGallery

个人图片画廊：前台公开浏览 + 评论互动，单管理员后台。与桌面壁纸软件**共用同一个 MinIO 桶**——壁纸软件持续把图片同步进桶，画廊作为消费者解析其 manifests 导入图片并补齐展示变体；元数据存 MySQL；详情页展示完整 EXIF。

技术栈：Next.js 16 (App Router) · Prisma 7 + MySQL · AWS SDK S3 (MinIO) · sharp · exifr · iron-session · Tailwind CSS 4

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

## 功能清单

**前台**：PhotoPrism 风格左侧栏（深色磨砂面板：顶部头像 + 站点名、全部照片/收藏/日历核心入口卡片、分类/年份/标签分组，选中态浅金指示条）· 四种视图切换（详细瀑布+信息卡 / 拼图正方形 / 瀑布纯图 / 列表）· **日历视图**（月份文件夹封面卡片 → 点击进入单月浏览，支持前后月切换与返回）· 收藏（与壁纸软件按「或」语义合并，只增不减）· 按名称搜索 · 年份筛选 · 详情页（灯箱大图、ESC/浮动按钮返回、EXIF 卡、原图下载受设置开关控制）· 评论（昵称必填/邮箱可选，默认自动通过；昵称邮箱本地缓存）

**位置信息**：照片带 GPS 时自动 Nominatim 逆向地理编码（1req/s、结果缓存于 `exif.gps.location`），卡片与详情页显示「📍 市 / 区」；无 GPS 的照片自动隐藏（注：Canon R6m2 等无内置 GPS 机型拍摄的存量图不含位置）

**评论反垃圾**（`src/lib/spam.ts`，纯本地无外部依赖，多层规则）：敏感词表（广告引流/色情/赌博/诈骗，词表在文件里按需增删）· 链接垃圾（多链接/链接占比/昵称塞联系方式）· 重复刷屏（同 IP 或同昵称 10 分钟内相同内容）· 纯表情刷屏 · 蜜罐字段 · IP 滑动窗口限流（1 条/分钟）。命中规则的评论**静默标记为垃圾**（对外仍返回成功，不给攻击者反馈），后台评论管理的「垃圾」页签可查看/恢复/删除；设置页可随时切回「先审后显」模式。

**后台**：图片管理（正方形网格满屏铺排 + 紧凑信息条，筛选支持分类/年份/标签/状态/收藏/名称搜索，页码分页可跳页，行内发布/收藏开关、批量发布/隐藏/移动分类/加标签/删除、编辑命名/描述/分类/标签）· 上传（拖拽多选、进度条、HEIC 自动转码）· 分类/标签管理 · 评论管理（新评论红点未读徽标、审核/垃圾/回复/删除）· 同步页（手动触发、运行历史、源缺失列表）· 设置（站点标题 / Logo 头像上传 / 每页数 / 评论审核 / 同步间隔 / 同步自动发布 / 允许查看原图 / 修改密码）

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
