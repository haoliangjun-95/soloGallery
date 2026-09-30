/**
 * 画廊→桶的分类/标签回写（A 端）：把 soloGallery DB 里的分类与标签按 CRDT
 * 增量发布到 manifests/sologallery-import-<ts>.json，壁纸软件"立即同步"即可
 * 消费。与 publish-manifest.mts（孤儿图片首次发布）分工：本脚本只更新已进入
 * 清单的记录，新图不管（由 publish-manifest 负责）。
 *
 * CRDT 要点（防重复 / 防复活 / 幂等）：
 * - 复用归并结果里该 hash 的现有 image id —— 壁纸端按 id 归并，换新 id = 桌面端重复图片
 * - 画廊分类名与清单已有分类同名时复用其 id（否则桌面端同名双分类）；
 *   新分类才用独立命名空间 cg-<分类表id>
 * - 只发布有差异的记录：categoryId 变化、或有新增标签。标签是并集归并
 *   （与收藏 OR 同族）：画廊侧删标签收不回，加标签才触发发布
 * - 不发任何 tombstone——删除是单向的（壁纸端删→画廊跟进；画廊永不反向复活）
 * - 无差异不发布（幂等：二次运行为 no-op）
 *   npx tsx scripts/publish-taxonomy.mts [--dry-run]
 */
import "dotenv/config";
import { prisma } from "../src/lib/db";
import { mergeManifests, type RawImage } from "../src/lib/manifest";
import { putBuffer } from "../src/lib/s3";
import { loadLatestManifests } from "../src/lib/sync";

const dryRun = process.argv.includes("--dry-run");
/** 与孤儿发布同一设备标识：桌面端按设备快照归并，画廊侧发布收敛到一个设备 */
const DEVICE = "sologallery-import";

// 1. 归并现有清单：存活记录（tombstone 已排除——画廊侧永不触碰已判死的 id/hash）
const { snapshots } = await loadLatestManifests();
const merged = mergeManifests(snapshots);
console.log(`清单归并：${snapshots.length} 个设备快照 · 存活 ${merged.size} 张`);

// 2. 清单已有分类（名→id 复用表）+ 记录 id→原始 addedAt（发布时保真，不改"首次添加"时间）
const manifestCategoryIds = new Map<string, string>(); // name(trim) → id，同快照内后写覆盖（近似 LWW）
const rawById = new Map<string, RawImage & { addedAt?: number }>();
for (const snap of [...snapshots].sort((a, b) => b.ts - a.ts)) {
  for (const cat of snap.categories) manifestCategoryIds.set(cat.name.trim(), cat.id);
  for (const img of snap.images) if (img.id && !rawById.has(img.id)) rawById.set(img.id, img);
}

// 3. 画廊侧数据：有分类或有标签的照片 + 全部分类
const galleryCategories = await prisma.category.findMany({ select: { id: true, name: true } });
/** 画廊分类表 id → 清单分类 id：同名复用，新名用 cg-<表id>（稳定，改名走同 id LWW） */
const categoryIdMap = new Map<number, { manifestId: string; name: string; reused: boolean }>();
for (const c of galleryCategories) {
  const reused = manifestCategoryIds.get(c.name.trim());
  categoryIdMap.set(c.id, { manifestId: reused ?? `cg-${c.id}`, name: c.name, reused: Boolean(reused) });
}

const photos = await prisma.photo.findMany({
  where: { missing: false, OR: [{ categoryId: { not: null } }, { photoTags: { some: {} } }] },
  select: {
    sha1: true,
    fileName: true,
    categoryId: true,
    photoTags: { select: { tag: { select: { name: true } } } },
  },
  orderBy: { id: "asc" },
});

// 4. 差异计算：categoryId 变化 或 有新增标签（并集归并下删除不触发）
const now = Date.now();
interface TaxonomyUpdate {
  id: string;
  hash: string;
  fileName: string;
  width: number;
  height: number;
  sizeBytes: number;
  format: string;
  categoryId: string | null;
  tags: string[];
  favorite: boolean;
  updatedAt: number;
  updatedBy: string;
}
const toPublish: TaxonomyUpdate[] = [];
const usedNewCategories = new Map<string, string>(); // manifestId → name（cg- 新分类才需要随清单下发）
let notInManifest = 0;
let noId = 0;
let unchanged = 0;

for (const p of photos) {
  const item = merged.get(p.sha1);
  if (!item) {
    notInManifest++; // 清单外新图归 publish-manifest 管
    continue;
  }
  const desiredCategory = p.categoryId ? categoryIdMap.get(p.categoryId) ?? null : null;
  const desiredTags = [...new Set(p.photoTags.map((pt) => pt.tag.name))].sort();

  const categoryChanged = (item.categoryId ?? null) !== (desiredCategory?.manifestId ?? null);
  const hasNewTags = desiredTags.some((t) => !item.tags.includes(t));
  if (!categoryChanged && !hasNewTags) {
    unchanged++;
    continue;
  }
  if (!item.wallpaperId) {
    noId++; // 无 id 的存活记录无法安全更新（换 id = 重复），只能跳过
    continue;
  }
  if (desiredCategory && !desiredCategory.reused) usedNewCategories.set(desiredCategory.manifestId, desiredCategory.name);

  toPublish.push({
    id: item.wallpaperId,
    hash: item.hash,
    fileName: item.fileName ?? p.fileName,
    width: item.width ?? 0,
    height: item.height ?? 0,
    sizeBytes: item.sizeBytes ?? 0,
    format: item.format ?? "jpg",
    categoryId: desiredCategory?.manifestId ?? null,
    tags: desiredTags,
    favorite: item.favorite,
    updatedAt: now,
    updatedBy: DEVICE,
  });
}

console.log(`差异：待发布 ${toPublish.length} 张 · 无变化 ${unchanged} · 清单外 ${notInManifest} · 无id跳过 ${noId}${dryRun ? "（dry-run）" : ""}`);
if (usedNewCategories.size) {
  console.log("新分类（cg- 命名空间）:", [...usedNewCategories.entries()].map(([id, name]) => `${name}→${id}`).join("、"));
}
const reusedNames = galleryCategories.filter((c) => manifestCategoryIds.has(c.name.trim())).map((c) => c.name);
if (reusedNames.length) console.log("同名复用清单 id 的分类:", reusedNames.join("、"));

if (!toPublish.length) {
  console.log("无差异，不发布");
  process.exit(0);
}

if (!dryRun) {
  const manifest = {
    version: 1,
    updatedAt: now,
    updatedBy: DEVICE,
    images: toPublish.map((img) => ({
      ...img,
      addedAt: rawById.get(img.id)?.addedAt ?? now,
    })),
    categories: [...usedNewCategories.entries()].map(([id, name]) => ({ id, name, updatedAt: now })),
    tombstones: [],
  };
  const key = `manifests/${DEVICE}-${now}.json`;
  await putBuffer(key, Buffer.from(JSON.stringify(manifest), "utf8"), "application/json");
  console.log(`已发布 ${key}（${toPublish.length} 张 · 新分类 ${usedNewCategories.size} 个）`);
} else {
  console.log(`dry-run：将发布 ${toPublish.length} 张 · 新分类 ${usedNewCategories.size} 个`);
  console.log("样例前 3 条:", JSON.stringify(toPublish.slice(0, 3).map((i) => ({ id: i.id, hash: i.hash.slice(0, 10), categoryId: i.categoryId, tags: i.tags })), null, 1));
}
process.exit(0);
