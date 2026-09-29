/**
 * PhotoPrism 迁移照片分类/标签整理：源目录的一级目录名 → 分类，二级及以下目录名 → 标签。
 * 路径→sha1 映射取 PhotoPrism sqlite files 表（file_name 相对路径 + file_hash），
 * 依赖服务器上的 sqlite3 CLI（-json 输出）。
 *
 *   npx tsx scripts/categorize-photoprism.mts --dry-run
 *   npx tsx scripts/categorize-photoprism.mts
 *
 * 幂等：只给「尚无分类」的照片补分类（不覆盖既有分类，含壁纸软件同步来源的）；
 * 标签逐个 connectOrCreate 天然幂等，重复执行零副作用。
 */
import "dotenv/config";
import { execFileSync } from "node:child_process";
import path from "node:path";
import { prisma } from "../src/lib/db";

const dryRun = process.argv.includes("--dry-run");
const DB = "/www/photoprism/storage/index.db";

/** 与 admin categories 路由同款 slugify（中文 \p{L} 保留） */
function slugify(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/[\s_/]+/g, "-")
    .replace(/[^\p{L}\p{N}-]+/gu, "")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

interface PrFile {
  file_name: string;
  file_hash: string;
}

const raw = execFileSync(
  "sqlite3",
  ["-json", DB, "SELECT file_name, file_hash FROM files WHERE file_missing = 0 AND deleted_at IS NULL"],
  { encoding: "utf8", maxBuffer: 16 * 1024 * 1024 },
);
const files: PrFile[] = raw.trim() ? (JSON.parse(raw) as PrFile[]) : [];
console.log(`PhotoPrism files 表：${files.length} 行`);

// path → { category, tags }；同 hash 多路径时标签取并集（去重）
interface Plan {
  category: string;
  tags: Set<string>;
}
const byHash = new Map<string, Plan>();
for (const f of files) {
  const segs = f.file_name.split("/").filter(Boolean);
  if (segs.length < 2) continue; // 根目录散文件：无语义，跳过
  const [top, ...mids] = segs;
  const ext = path.extname(top);
  if (ext) continue; // 首段就是文件 = 根目录文件
  const tags = new Set(mids.slice(0, -1)); // 去掉末段文件名，中间目录为标签
  const prev = byHash.get(f.file_hash);
  if (prev) {
    for (const t of tags) prev.tags.add(t);
  } else {
    byHash.set(f.file_hash, { category: top, tags });
  }
}
console.log(`可整理映射：${byHash.size} 个 hash`);

// 库内照片现状
const photos = await prisma.photo.findMany({
  select: { id: true, sha1: true, categoryId: true, photoTags: { select: { tag: { select: { name: true } } } } },
});
const dbByHash = new Map(photos.map((p) => [p.sha1, p]));

// 分类 upsert（dry-run 也先算 sortOrder 占位）
const categoryNames = [...new Set([...byHash.values()].map((p) => p.category))];
const catIds = new Map<string, number>();
const maxSort = await prisma.category.aggregate({ _max: { sortOrder: true } });
let nextSort = (maxSort._max.sortOrder ?? 0) + 1;

let skippedNoRow = 0;
let skippedHasCategory = 0;
let taggedPhotos = 0;
const tagUse = new Map<string, number>();

for (const name of categoryNames) {
  if (dryRun) continue;
  const cat = await prisma.category.upsert({
    where: { name },
    create: { name, slug: slugify(name), sortOrder: nextSort++ },
    update: {},
  });
  catIds.set(name, cat.id);
}

for (const [hash, plan] of byHash) {
  const row = dbByHash.get(hash);
  if (!row) {
    skippedNoRow++;
    continue;
  }
  if (row.categoryId) {
    skippedHasCategory++;
  } else if (!dryRun) {
    await prisma.photo.update({
      where: { sha1: hash },
      data: { categoryId: catIds.get(plan.category) ?? null },
    });
  }
  const existing = new Set(row.photoTags.map((pt) => pt.tag.name));
  let added = false;
  for (const tag of plan.tags) {
    if (existing.has(tag)) continue;
    if (!dryRun) {
      const t = await prisma.tag.upsert({ where: { name: tag }, create: { name: tag }, update: {} });
      await prisma.photoTag.upsert({
        where: { photoId_tagId: { photoId: row.id, tagId: t.id } },
        create: { photoId: row.id, tagId: t.id },
        update: {},
      });
    }
    tagUse.set(tag, (tagUse.get(tag) ?? 0) + 1);
    added = true;
  }
  if (added) taggedPhotos++;
}

console.log(
  [
    `完成${dryRun ? "（dry-run）" : ""}:`,
    `分类 ${categoryNames.length} 个（${categoryNames.join("、")}）`,
    `已分类跳过 ${skippedHasCategory}`,
    `库中无行跳过 ${skippedNoRow}`,
    `涉及标签 ${tagUse.size} 个`,
  ].join(" · "),
);
for (const [t, n] of [...tagUse.entries()].sort((a, b) => b[1] - a[1]).slice(0, 15)) {
  console.log(`  #${t} ×${n}`);
}
process.exit(0);
