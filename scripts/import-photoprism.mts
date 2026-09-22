/**
 * PhotoPrism 原图迁移：把源目录里的图片（默认只收 jpg/jpeg/heic）导入
 * vividdeck 桶并写入 soloGallery 数据库，画廊直接可见。
 *
 *   npx tsx scripts/import-photoprism.mts --dry-run          # 只扫描统计
 *   npx tsx scripts/import-photoprism.mts                    # 正式导入
 *   npx tsx scripts/import-photoprism.mts --concurrency 8    # 调并发
 *
 * 约定与去重（幂等，可安全重跑）：
 * - 对象键 objects/<sha1>（无扩展名，与壁纸软件内容寻址一致），display/<sha1>.webp
 * - 库里已有同 sha1 行 → 整条跳过；桶里已有对象但缺行 → 不重传原图，只补行+display
 * - GPS 地名反查不在本脚本（1req/s 限速），导入完跑 backfill-gps.mts 补
 * - 视频与一切边车（.json/.yml/.xmp 等）不碰；源文件只读，不移动不删除
 */
import "dotenv/config";
import { createHash } from "node:crypto";
import { readdir, readFile, stat } from "node:fs/promises";
import path from "node:path";
import { prisma } from "../src/lib/db";
import { extractExif } from "../src/lib/exif";
import { generateDisplay } from "../src/lib/image-pipeline";
import { putBuffer, exists } from "../src/lib/s3";
import { sniffImage } from "../src/lib/sniff";

const args = process.argv.slice(2);
const dryRun = args.includes("--dry-run");
const srcArg = args.find((a) => a.startsWith("--src="))?.slice(6) ?? args[args.indexOf("--src") + 1];
const concArg = Number(args.find((a) => a.startsWith("--concurrency="))?.slice(14) ?? 4);

const SRC = srcArg ?? "/www/photoprism/photos";
/** 扩展名白名单（大小写不敏感）；魔数嗅探是最终关卡，这里先粗滤掉视频/边车 */
const EXT_WHITELIST = new Set([".jpg", ".jpeg", ".heic"]);
const CONCURRENCY = Number.isInteger(concArg) && concArg >= 1 && concArg <= 16 ? concArg : 4;

function titleFromFileName(fileName: string): string {
  const stem = fileName.replace(/\.[^.]+$/, "");
  return stem || fileName;
}

async function walk(dir: string, out: string[] = []): Promise<string[]> {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) await walk(full, out);
    else if (entry.isFile() && EXT_WHITELIST.has(path.extname(entry.name).toLowerCase())) out.push(full);
  }
  return out;
}

interface Tally {
  scanned: number;
  skipDb: number; // 库里已有（连桶带行都齐）
  skipBucket: number; // 桶里已有原图但缺行 → 补行+display，不重传
  uploaded: number;
  imported: number;
  skipUnknown: number; // 魔数嗅探不认识的
  failed: number;
  bytes: number;
}

const tally: Tally = {
  scanned: 0, skipDb: 0, skipBucket: 0, uploaded: 0, imported: 0, skipUnknown: 0, failed: 0, bytes: 0,
};
const failures: string[] = [];

async function importOne(file: string): Promise<void> {
  tally.scanned++;
  const rel = path.relative(SRC, file);
  const buf = await readFile(file);
  const sniff = sniffImage(buf);
  if (sniff.format === "UNKNOWN") {
    tally.skipUnknown++;
    console.warn(`  跳过（魔数未知）: ${rel}`);
    return;
  }
  const sha1 = createHash("sha1").update(buf).digest("hex");

  const existing = await prisma.photo.findUnique({ where: { sha1 }, select: { id: true } });
  if (existing) {
    tally.skipDb++;
    return;
  }

  const originalKey = `objects/${sha1}`;
  const bucketHas = await exists(originalKey);
  if (!bucketHas) {
    if (!dryRun) await putBuffer(originalKey, buf, sniff.mimeType);
    tally.uploaded++;
    tally.bytes += buf.length;
  } else {
    tally.skipBucket++;
  }
  if (dryRun) return;

  // EXIF 与展示变体；display 失败不阻断入库（前台回退原图，重跑可补）
  const exif = await extractExif(buf);
  let width: number | undefined;
  let height: number | undefined;
  try {
    const display = await generateDisplay(buf);
    width = display.width;
    height = display.height;
    await putBuffer(`display/${sha1}.webp`, display.webp, "image/webp");
  } catch (err) {
    console.warn(`  display 生成失败 ${rel}:`, err instanceof Error ? err.message : err);
  }

  await prisma.photo.create({
    data: {
      sha1,
      title: titleFromFileName(path.basename(file)),
      fileName: path.basename(file),
      storageKey: originalKey,
      mimeType: sniff.mimeType,
      format: sniff.format,
      fileSize: BigInt(buf.length),
      width,
      height,
      shotAt: exif?.shotAt ? new Date(exif.shotAt) : null,
      exif: exif ? (exif as unknown as object) : undefined,
      source: "UPLOAD",
      published: true,
    },
  });
  tally.imported++;
  if ((tally.imported + tally.skipBucket) % 25 === 0) {
    console.log(`  进度: 已导入 ${tally.imported} · 跳过(库) ${tally.skipDb} · 失败 ${tally.failed}`);
  }
}

/** 简易并发池：固定 worker 数消费文件列表 */
async function runPool(files: string[]): Promise<void> {
  let cursor = 0;
  const workers = Array.from({ length: Math.min(CONCURRENCY, files.length) }, async () => {
    while (cursor < files.length) {
      const file = files[cursor++];
      try {
        await importOne(file);
      } catch (err) {
        tally.failed++;
        failures.push(file);
        console.warn(`  失败 ${file}:`, err instanceof Error ? err.message : err);
      }
    }
  });
  await Promise.all(workers);
}

console.log(`源目录: ${SRC} · 并发: ${CONCURRENCY} · ${dryRun ? "DRY-RUN（只统计）" : "正式导入"}`);
const files = await walk(SRC).catch((err) => {
  console.error(`无法读取源目录: ${err instanceof Error ? err.message : err}`);
  process.exit(1);
});
const totalBytes = await Promise.all(
  files.map((f) => stat(f).then((s) => s.size).catch(() => 0)),
).then((xs) => xs.reduce((a, b) => a + b, 0));
console.log(`扫描到 ${files.length} 个白名单图片，共 ${(totalBytes / 1024 ** 3).toFixed(2)} GB`);

await runPool(files);

console.log(
  [
    `完成${dryRun ? "（dry-run）" : ""}:`,
    `待导入 ${files.length}`,
    `库中已存在 ${tally.skipDb}`,
    `桶中已有补行 ${dryRun ? "-" : tally.skipBucket}`,
    `上传原图 ${tally.uploaded} (${(tally.bytes / 1024 ** 3).toFixed(2)} GB)`,
    `新入库 ${dryRun ? "-" : tally.imported}`,
    `魔数未知跳过 ${tally.skipUnknown}`,
    `失败 ${tally.failed}`,
  ].join(" · "),
);
if (failures.length) {
  console.log("失败清单（重跑可补）:");
  for (const f of failures) console.log(`  ${f}`);
}
process.exit(tally.failed > 0 ? 1 : 0);
