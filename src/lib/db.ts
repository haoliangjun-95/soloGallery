import { PrismaMariaDb } from "@prisma/adapter-mariadb";
import { PrismaClient } from "@/generated/prisma/client";

function createAdapter() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("缺少环境变量 DATABASE_URL（参考 .env.example）");
  const u = new URL(url);
  return new PrismaMariaDb({
    host: u.hostname,
    port: u.port ? Number(u.port) : 3306,
    user: decodeURIComponent(u.username),
    password: decodeURIComponent(u.password),
    database: u.pathname.replace(/^\//, ""),
    connectionLimit: 10,
    // 池取连接超时：连远端库时，NAS 导入的上传会占满家庭上行，新连接
    // TCP 握手可能超过 mariadb 默认 10s（表象为 pool timeout active=0）
    acquireTimeout: 30_000,
    // ?ssl=true 启用 TLS（自签证书放行）：MySQL 8 caching_sha2_password 完整认证
    // 在明文连接上会被拒发 RSA 公钥（ER_CANNOT_RETRIEVE_RSA_KEY），重启后首连必触发
    ...(u.searchParams.get("ssl") === "true"
      ? { ssl: { rejectUnauthorized: false } }
      : {}),
  });
}

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

/** 懒初始化：模块被 import 时（如 next build 收集页面数据）不强求 DB 配置存在。 */
function getClient(): PrismaClient {
  if (globalForPrisma.prisma) return globalForPrisma.prisma;
  const client = new PrismaClient({
    adapter: createAdapter(),
    log: process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"],
  });
  globalForPrisma.prisma = client;
  return client;
}

export const prisma: PrismaClient = new Proxy({} as PrismaClient, {
  get(_target, prop, receiver) {
    const client = getClient();
    const value = Reflect.get(client, prop, receiver);
    return typeof value === "function" ? value.bind(client) : value;
  },
});
