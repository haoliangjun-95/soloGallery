/**
 * 存量照片感知哈希回填（功能 15）：对 dhash 为空的照片，从桶里现成的
 * display WebP 计算 dHash（同入库路径管线）写回。幂等：已有哈希的跳过；
 * 缺 display 的告警跳过（重跑可补）。只读 display、只写 DB 一列，不动桶对象。
 *   npx tsx scripts/backfill-dhash.mts [--dry-run] [--concurrency 4]
 */
import "dotenv/config";
import { prisma } from "../src/lib/db";
import { computeDhash } from "../src/lib/image-pipeline";
import { getBuffer } from "../src/lib/s3";

const args = process.argv.slice(2);
const dryRun = args.includes("--dry-run");
const concArg = Number(args.find((a) => a.startsWith("--concurrency="))?.slice(14) ?? 4);
const CONCURRENCY = Number.isInteger(concArg) && concArg >= 1 && concArg <= 8 ? concArg : 4;

const photos = await prisma.photo.findMany({
  where: { dhash: null, missing: false },
  select: { sha1: true },
  orderBy: { id: "asc" },
});
console.log(`待回填 ${photos.length} 张 · 并发 ${CONCURRENCY}${dryRun ? " · dry-run" : ""}`);

let done = 0;
let noDisplay = 0;
let failed = 0;
const failures: string[] = [];

async function backfillOne(sha1: string): Promise<void> {
  const display = await getBuffer(`display/${sha1}.webp`).catch(() => null);
  if (!display) {
    noDisplay++;
    return;
  }
  const dhash = await computeDhash(display);
  await prisma.photo.update({ where: { sha1 }, data: { dhash } });
  done++;
  if (done % 100 === 0) console.log(`  进度: ${done}/${photos.length} · 缺display ${noDisplay} · 失败 ${failed}`);
}

let cursor = 0;
const workers = Array.from({ length: Math.min(CONCURRENCY, photos.length) }, async () => {
  while (cursor < photos.length) {
    const p = photos[cursor++];
    try {
      if (!dryRun) await backfillOne(p.sha1);
      else done++;
    } catch (err) {
      failed++;
      failures.push(p.sha1);
      console.warn(`  失败 ${p.sha1.slice(0, 10)}:`, err instanceof Error ? err.message : err);
    }
  }
});
await Promise.all(workers);

console.log(`完成${dryRun ? "（dry-run）" : ""}: 回填 ${done} · 缺display跳过 ${noDisplay} · 失败 ${failed}`);
if (failures.length) console.log(`失败清单（重跑可补）: ${failures.slice(0, 10).join(" ")}${failures.length > 10 ? " …" : ""}`);
process.exit(failed > 0 ? 1 : 0);
