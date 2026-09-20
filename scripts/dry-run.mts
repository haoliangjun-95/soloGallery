/**
 * 真实桶只读预演：跑同步引擎的「解析 manifests → 归并 → 与 objects/thumbs 比对」
 * 全链路，但不写数据库、不写桶。用于接入前确认将要导入的规模与元数据质量。
 *   npx tsx scripts/dry-run.mts
 */
import "dotenv/config";
import { listKeys } from "../src/lib/s3";
import { mergeManifests } from "../src/lib/manifest";
import { loadLatestManifests, buildThumbIndex } from "../src/lib/sync";

const { snapshots, keys } = await loadLatestManifests();
console.log(`manifests/ 共 ${keys} 个快照，取每设备最新后剩 ${snapshots.length} 份:`);
for (const s of snapshots) {
  console.log(`  设备 ${s.deviceId} @${new Date(s.ts).toISOString()}  images=${s.images.length} categories=${s.categories.length} tombstones=${s.tombstones.length}`);
}

const merged = mergeManifests(snapshots);
const alive = [...merged.values()];
console.log(`\n归并后存活图片: ${alive.length} 张（唯一 sha1）`);

const objectKeys = await listKeys("objects/");
const objectHashes = new Set(objectKeys.map((k) => k.slice("objects/".length)));
let orphanObjects = 0;
let missingObjects = 0;
for (const hash of objectHashes) if (!merged.has(hash)) orphanObjects++;
for (const item of alive) if (!objectHashes.has(item.hash)) missingObjects++;
console.log(`objects/ 共 ${objectHashes.size} 个；孤儿对象（不在存活清单）: ${orphanObjects}；清单有但对象缺失: ${missingObjects}`);

const thumbs = await buildThumbIndex();
let thumbHit = 0;
let thumbMiss = 0;
for (const item of alive) {
  if (item.wallpaperId && thumbs.byId.has(item.wallpaperId)) thumbHit++;
  else thumbMiss++;
}
console.log(`thumbs/ 共 ${thumbs.all.size} 个；存活图复用壁纸缩略图: ${thumbHit}，无缩略图（画廊将退化用 display）: ${thumbMiss}`);

const byCategory = new Map<string, number>();
for (const item of alive) {
  const name = item.categoryName ?? "（未分类）";
  byCategory.set(name, (byCategory.get(name) ?? 0) + 1);
}
console.log("\n分类分布:");
for (const [name, n] of [...byCategory.entries()].sort((a, b) => b[1] - a[1])) console.log(`  ${name}: ${n}`);

const tagCount = new Map<string, number>();
for (const item of alive) for (const t of item.tags) tagCount.set(t, (tagCount.get(t) ?? 0) + 1);
console.log("\n标签分布:");
for (const [name, n] of [...tagCount.entries()].sort((a, b) => b[1] - a[1]).slice(0, 15)) console.log(`  #${name}: ${n}`);

const withFileName = alive.filter((i) => i.fileName).length;
const withDims = alive.filter((i) => i.width && i.height).length;
console.log(`\n元数据质量: fileName ${withFileName}/${alive.length}，尺寸 ${withDims}/${alive.length}`);
const sample = alive[0];
if (sample) console.log(`样例: hash=${sample.hash.slice(0, 12)}… fileName=${sample.fileName} 分类=${sample.categoryName ?? "-"} 标签=[${sample.tags.join(",")}]`);
process.exit(0);
