import "dotenv/config";
import { prisma } from "../src/lib/db";
import { SETTING_DEFAULTS } from "../src/lib/settings";
import bcrypt from "bcryptjs";

async function main() {
  const username = process.env.ADMIN_USERNAME ?? "admin";
  const password = process.env.ADMIN_PASSWORD ?? "admin123456";

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
