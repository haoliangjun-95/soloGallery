/**
 * 端到端联调：内存 S3（伪壁纸桶）→ 同步引擎 → MySQL 断言。
 *   DATABASE_URL="mysql://user:pass@host:3306/sologallery_e2e" npm run e2e:sync
 * 安全闸：数据库名必须包含 "e2e"（会清写该库），或显式 E2E_ALLOW_ANY_DB=1。
 */
import "dotenv/config";
import { ListObjectsV2Command } from "@aws-sdk/client-s3";

const dbUrl = process.env.DATABASE_URL ?? "";
if (!dbUrl) {
  console.error("需要 DATABASE_URL 指向一个可用的 MySQL 库（建议专用 e2e 库）");
  process.exit(1);
}
const dbName = dbUrl.split("/").pop()?.split("?")[0] ?? "";
if (!dbName.includes("e2e") && process.env.E2E_ALLOW_ANY_DB !== "1") {
  console.error(
    `安全闸：e2e 会清写数据库，当前库名 "${dbName}" 不含 "e2e"。请使用专用测试库或设置 E2E_ALLOW_ANY_DB=1`,
  );
  process.exit(1);
}

// —— 先设置环境再动态 import（s3 客户端在模块加载时读 env）——
const PORT = 4572;
process.env.MINIO_ENDPOINT = "127.0.0.1";
process.env.MINIO_PORT = String(PORT);
process.env.MINIO_USE_SSL = "false";
process.env.MINIO_ACCESS_KEY = "e2e";
process.env.MINIO_SECRET_KEY = "e2e";
process.env.MINIO_PUBLIC_BASE_URL = `http://127.0.0.1:${PORT}`;

const fixtures = await import("./fixtures.mjs");
const { runSync } = await import("../src/lib/sync");
const { prisma } = await import("../src/lib/db");

let failures = 0;
function assert(cond: unknown, label: string) {
  const ok = Boolean(cond);
  console.log(`${ok ? "  ✅" : "  ❌"} ${label}`);
  if (!ok) failures++;
}

let displayCount = async (): Promise<number> => 0;

try {
  const ctx = await fixtures.startFakeBucket(PORT);
  displayCount = async () => {
    const res = await ctx.client.send(
      new ListObjectsV2Command({ Bucket: fixtures.BUCKET, Prefix: "display/" }),
    );
    return res.Contents?.length ?? 0;
  };

  // 清库（幂等重跑）
  await prisma.comment.deleteMany();
  await prisma.photoTag.deleteMany();
  await prisma.photo.deleteMany();
  await prisma.category.deleteMany();
  await prisma.tag.deleteMany();
  await prisma.syncRun.deleteMany();

  console.log("\n== Phase 1：两设备清单，8 张存活 ==");
  const items = await fixtures.buildItems();
  await fixtures.seedObjects(ctx, items);
  await fixtures.seedManifests(ctx, fixtures.phase1Manifests(items));

  const s1 = await runSync("manual");
  assert(s1.imported === 8, `导入 8 张（实际 ${s1.imported}）`);
  assert(s1.missing === 0, `无下架（实际 ${s1.missing}）`);
  assert(s1.errors.length === 0, `无错误 ${s1.errors.join("; ")}`);

  const count = await prisma.photo.count();
  assert(count === 8, `库里 8 条（实际 ${count}）`);
  const unpublished = await prisma.photo.count({ where: { published: false } });
  assert(unpublished === 8, "默认全部未发布");
  const withThumb = await prisma.photo.count({ where: { NOT: { thumbKey: null } } });
  assert(withThumb === 8, `8 张复用壁纸缩略图（实际 ${withThumb}）`);
  assert((await displayCount()) === 8, "display/ 下 8 个 WebP");

  const w1 = await prisma.photo.findUnique({ where: { sha1: items[0].hash } });
  assert(w1?.fileName === "DSC_1001.jpg", `文件名取自 localFile（实际 ${w1?.fileName}）`);
  assert(w1?.format === "JPEG", `格式嗅探 JPEG（实际 ${w1?.format}）`);
  assert(
    w1?.shotAt?.toISOString().startsWith("2026-02-12"),
    `EXIF 拍摄时间（实际 ${w1?.shotAt?.toISOString() ?? "无"}）`,
  );
  const w1exif = w1?.exif as { model?: string; lensModel?: string; iso?: number } | null;
  assert(String(w1exif?.model ?? "").includes("EOS R6m2"), `EXIF 机身（实际 ${w1exif?.model}）`);
  assert(String(w1exif?.lensModel ?? "").includes("RF24-105"), `EXIF 镜头（实际 ${w1exif?.lensModel}）`);
  assert(w1exif?.iso === 100, `EXIF ISO（实际 ${w1exif?.iso}）`);

  const cats = await prisma.category.findMany();
  assert(
    cats.some((c) => c.name === "风景") && cats.some((c) => c.name === "城市"),
    `分类自动预建（实际 ${cats.map((c) => c.name).join("/")}）`,
  );
  const tags = await prisma.tag.findMany();
  assert(tags.some((t) => t.name === "城市"), `标签灌入（实际 ${tags.map((t) => t.name).join("/")}）`);

  console.log("\n== Phase 2：tombstone w2 + 新增 w9 ==");
  const phase2 = await fixtures.phase2Manifest(items, () => fixtures.makeExtraItem("w9"));
  await fixtures.seedObjects(ctx, [phase2.newItem]);
  await fixtures.seedManifests(ctx, [phase2]);

  const s2 = await runSync("manual");
  assert(s2.imported === 1, `新导入 1 张（实际 ${s2.imported}）`);
  assert(s2.missing === 1, `下架 1 张（实际 ${s2.missing}）`);

  const w2 = await prisma.photo.findUnique({ where: { sha1: items[1].hash } });
  assert(w2?.missing === true && w2?.published === false, "w2 已标记源缺失并下架");
  assert((await prisma.photo.count()) === 9, "库里 9 条");
  assert((await displayCount()) === 9, "display/ 下 9 个 WebP");

  console.log("\n== Phase 3：幂等重跑 ==");
  const s3 = await runSync("manual");
  assert(s3.imported === 0 && s3.missing === 0, `无变化（实际 新增${s3.imported}/下架${s3.missing}）`);

  await ctx.stop();
  console.log(`\n${failures === 0 ? "🎉 全部通过" : `⚠️ ${failures} 项失败`}`);
  process.exit(failures === 0 ? 0 : 1);
} catch (err) {
  console.error("e2e 异常:", err);
  process.exit(1);
} finally {
  await prisma.$disconnect().catch(() => undefined);
}
