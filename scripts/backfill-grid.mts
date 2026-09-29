/**
 * 存量照片 srcset 网格变体回填：对 gridReady=false 的照片，用桶里现成的
 * display WebP 派生 400w/800w 两档网格变体（同 upload 路径管线），写回
 * gridReady=true。幂等：已就绪的照片跳过；缺 display 的告警跳过（重跑可补）。
 *   npx tsx scripts/backfill-grid.mts [--dry-run] [--concurrency 4]
 */
import "dotenv/config";
import { gridKey, GRID_WIDTHS } from "../src/lib/bucket-layout";
import { prisma } from "../src/lib/db";
import { generateGridVariants } from "../src/lib/image-pipeline";
import { exists, getBuffer, putBuffer } from "../src/lib/s3";

const args = process.argv.slice(2);
const dryRun = args.includes("--dry-run");
const concArg = Number(args.find((a) => a.startsWith("--concurrency="))?.slice(14) ?? 4);
const CONCURRENCY = Number.isInteger(concArg) && concArg >= 1 && concArg <= 8 ? concArg : 4;

const photos = await prisma.photo.findMany({
  where: { gridReady: false, missing: false },
  select: { sha1: true },
  orderBy: { id: "asc" },
});
console.log(`待回填 ${photos.length} 张 · 并发 ${CONCURRENCY}${dryRun ? " · dry-run" : ""}`);

let done = 0;
let noDisplay = 0;
let failed = 0;
const failures: string[] = [];

async function backfillOne(sha1: string): Promise<void> {
  // 已有两档变体的（历史部分成功）直接补标志，不重复生成
  const missing: string[] = [];
  const widths = [...GRID_WIDTHS];
  for (const w of widths) {
    const key = gridKey(sha1, w);
    if (!(await exists(key))) missing.push(key);
  }
  if (missing.length) {
    const display = await getBuffer(`display/${sha1}.webp`).catch(() => null);
    if (!display) {
      noDisplay++;
      return;
    }
    const variants = await generateGridVariants(display);
    for (const v of variants) {
      await putBuffer(gridKey(sha1, v.width), v.webp, "image/webp");
    }
  }
  await prisma.photo.update({ where: { sha1 }, data: { gridReady: true } });
  done++;
  if (done % 50 === 0) console.log(`  进度: ${done}/${photos.length} · 缺display ${noDisplay} · 失败 ${failed}`);
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
