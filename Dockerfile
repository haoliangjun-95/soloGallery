# 基础镜像可替换（国内网络：--build-arg NODE_IMAGE=docker.m.daocloud.io/library/node:20-alpine）
ARG NODE_IMAGE=node:20-alpine

# ---- deps：安装依赖 + prisma generate（postinstall）----
# 构建期不连任何服务：页面全部 force-dynamic，Prisma 客户端懒初始化
FROM ${NODE_IMAGE} AS deps
WORKDIR /app
COPY package.json package-lock.json ./
COPY prisma7.config.ts ./
COPY prisma ./prisma
RUN npm ci

# ---- builder：next build（standalone 输出）----
FROM ${NODE_IMAGE} AS builder
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1
# CSP 在构建期求值（headers() 序列化进产物），img-src 放行哪个 MinIO origin、
# 哪个瓦片域名取决于这两个变量；http 内网地址必须 build-arg 传入，
# 否则 CSP 只放行默认回退（https:）会拦图
ARG MINIO_PUBLIC_BASE_URL=""
ARG MAP_TILE_URL=""
ENV MINIO_PUBLIC_BASE_URL=${MINIO_PUBLIC_BASE_URL} MAP_TILE_URL=${MAP_TILE_URL}
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/src/generated ./src/generated
COPY . .
RUN npm run build

# ---- runner：仅 standalone 运行时（server.js + 追踪到的 node_modules 子集）----
FROM ${NODE_IMAGE} AS runner
WORKDIR /app
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    HOSTNAME=0.0.0.0 \
    PORT=3000
# server.js 不会自动带上这两个目录，缺了静态资源全 404
COPY --from=builder --chown=node:node /app/.next/standalone ./
COPY --from=builder --chown=node:node /app/.next/static ./.next/static
COPY --from=builder --chown=node:node /app/public ./public
USER node
EXPOSE 3000
CMD ["node", "server.js"]

# ---- watcher：NAS 目录监听导入（独立容器，无端口；复用 env 指向的 MinIO/MySQL）----
# 与画廊容器共用同一套连接配置；源目录由 compose 只读 bind 挂到 /nas-src，
# 增量缓存落在 /app/.cache（compose 挂卷持久化，容器重建后无需全量重扫）。
# tsx 解析 src/lib 里的 "@/..." 别名依赖根目录 tsconfig.json，必须带上。
FROM ${NODE_IMAGE} AS watcher
WORKDIR /app
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1
COPY --chown=node:node package.json tsconfig.json ./
COPY --chown=node:node scripts ./scripts
COPY --chown=node:node src ./src
# deps 阶段 npm ci 已按 alpine 装好 sharp 原生件，prisma generate 产出 src/generated
# （.dockerignore 排除了 src/generated，上一条 COPY 不会带进来，须单独补）
COPY --from=deps --chown=node:node /app/node_modules ./node_modules
COPY --from=deps --chown=node:node /app/src/generated ./src/generated
RUN mkdir -p /app/.cache && chown node:node /app/.cache
USER node
CMD ["node_modules/.bin/tsx", "scripts/watch-nas.mts"]
