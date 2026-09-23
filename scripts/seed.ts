import "dotenv/config";
import { prisma } from "../src/lib/db";
import { SETTING_DEFAULTS } from "../src/lib/settings";
import bcrypt from "bcryptjs";

/** ADMIN_PASSWORD 最小长度（与 src/lib/auth.ts 的 ensureAdminUser 保持一致） */
const MIN_ADMIN_PASSWORD_LENGTH = 8;

/** 已知弱密码黑名单（与 src/lib/auth.ts 同步维护；auth.ts 是 server-only 无法在此 import） */
const KNOWN_WEAK_PASSWORDS = new Set(["admin123456", "password", "12345678", "changeme123"]);

async function main() {
  const username = process.env.ADMIN_USERNAME ?? "admin";
  // 与 auth.ts 的 ensureAdminUser 同策略：不回落到硬编码弱密码。
  // 忘配 env 静默创建 admin123456 等于公网送出门。
  const password = process.env.ADMIN_PASSWORD;
  if (!password || password.length < MIN_ADMIN_PASSWORD_LENGTH) {
    throw new Error(
      `未设置 ADMIN_PASSWORD（至少 ${MIN_ADMIN_PASSWORD_LENGTH} 位）——拒绝以弱默认密码创建管理员。请在 .env 配置后重跑 npm run db:seed`,
    );
  }
  if (KNOWN_WEAK_PASSWORDS.has(password.toLowerCase())) {
    throw new Error("ADMIN_PASSWORD 是众所周知的弱密码（如 .env.example 示例值）；请换一个强密码后重跑");
  }

  const count = await prisma.adminUser.count();
  if (count === 0) {
    await prisma.adminUser.create({
      data: { username, passwordHash: await bcrypt.hash(password, 10) },
    });
    console.log(`已创建管理员: ${username}`);
  } else {
    console.log(`管理员已存在（${count} 个），跳过`);
  }

  for (const [key, value] of Object.entries(SETTING_DEFAULTS)) {
    await prisma.setting.upsert({ where: { key }, update: {}, create: { key, value } });
  }
  console.log("默认设置已就绪");
}

main()
  .catch((err) => {
    console.error("seed 失败:", err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
