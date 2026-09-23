/**
 * 把库里「未进入任何 manifest 的图片」（如 PhotoPrism 迁移导入的）发布成一份
 * 新设备清单 manifests/sologallery-import-<ts>.json，并按壁纸软件约定补
 * thumbs/<id>_<hash8>.webp 缩略图 —— vividDeck 只消费 manifest，孤儿对象它看不见。
 * 幂等：重复执行只处理仍缺失的图片。已删库/缺 display 的图片跳过并告警。
 *   npx tsx scripts/publish-manifest.mts [--dry-run]
 */
import "dotenv/config";
import { randomBytes } from "node:crypto";
import sharp from "sharp";
import { prisma } from "../src/lib/db";
import { mergeManifests } from "../src/lib/manifest";
import { exists, getBuffer, putBuffer } from "../src/lib/s3";
import { loadLatestManifests } from "../src/lib/sync";

const dryRun = process.argv.includes("--dry-run");
/** 设备标识：manifest 键与 updatedBy 共用，稳定且不同于任何桌面设备 */
const DEVICE = "sologallery-import";
const THUMB_WIDTH = 512;

/** 与 vividDeck genId() 同形：base36 时间戳 + 12 位 hex，符合 [0-9A-Za-z-]{1,64} */
function genId(): string {
  return Date.now().toString(36) + randomBytes(6).toString("hex");
}

/** manifest 的 format 口径与真实清单一致（"jpg" 而非 "jpeg"） */
const FORMAT_MAP: Record<string, string> = {
  JPEG: "jpg",
  HEIC: "heic",
  PNG: "png",
  WEBP: "webp",
  GIF: "gif",
  AVIF: "avif",
  BMP: "bmp",
};

// 1. 合并现有清单 → 存活 hash 集合
const { snapshots } = await loadLatestManifests();
const aliveHashes = new Set(
  [...mergeManifests(snapshots).values()].filter((i) => !i.deleted).map((i) => i.hash),
);
console.log(`现有清单覆盖存活图片 ${aliveHashes.size} 张（${snapshots.length} 个设备快照）`);

// 2. 库里不在清单中的图片
const photos = await prisma.photo.findMany({
  where: { missing: false },
  select: {
    sha1: true, fileName: true, width: true, height: true,
    fileSize: true, format: true, favorite: true,
  },
  orderBy: { id: "asc" },
});
const pending = photos.filter((p) => !aliveHashes.has(p.sha1));
console.log(`库中共 ${photos.length} 张，待发布 ${pending.length} 张${dryRun ? "（dry-run）" : ""}`);

interface ManifestImage {
  id: string;
  fileName: string;
  hash: string;
  width: number;
  height: number;
  sizeBytes: number;
  format: string;
  categoryId: string | null;
  tags: string[];
  favorite: boolean;
  addedAt: number;
  updatedAt: number;
  updatedBy: string;
}

const images: ManifestImage[] = [];
const skipped: { sha1: string; reason: string }[] = [];
let thumbsUploaded = 0;

/** 缩略图源用桶里现成的 display WebP（~300KB，可被 sharp 直接读），无需下载原图 */
async function makeThumb(sha1: string, thumbKey: string): Promise<boolean> {
  if (await exists(thumbKey)) return true;
  const display = await getBuffer(`display/${sha1}.webp`).catch(() => null);
  if (!display) return false;
  const webp = await sharp(display).resize({ width: THUMB_WIDTH, withoutEnlargement: true }).webp({ quality: 75 }).toBuffer();
  await putBuffer(thumbKey, webp, "image/webp");
  thumbsUploaded++;
  return true;
}

for (const p of pending) {
  const id = genId();
  const thumbKey = `thumbs/${id}_${p.sha1.slice(0, 8)}.webp`;
  if (!dryRun) {
    const ok = await makeThumb(p.sha1, thumbKey).catch((err) => {
      skipped.push({ sha1: p.sha1, reason: err instanceof Error ? err.message : String(err) });
      return false;
    });
    if (!ok) {
      skipped.push({ sha1: p.sha1, reason: "无 display 缩略图可作 thumb 源" });
      continue;
    }
  }
  const now = Date.now();
  images.push({
    id,
    fileName: p.fileName,
    hash: p.sha1,
    width: p.width ?? 0,
    height: p.height ?? 0,
    sizeBytes: Number(p.fileSize),
    format: FORMAT_MAP[p.format] ?? "jpg",
    categoryId: null,
    tags: [],
    favorite: p.favorite,
    addedAt: now,
    updatedAt: now,
    updatedBy: DEVICE,
  });
}

if (!dryRun && images.length) {
  const manifest = {
    version: 1,
    updatedAt: Date.now(),
    updatedBy: DEVICE,
    images,
    categories: [],
    tombstones: [],
  };
  const key = `manifests/${DEVICE}-${Date.now()}.json`;
  await putBuffer(key, Buffer.from(JSON.stringify(manifest), "utf8"), "application/json");
  console.log(`已发布 ${key}（${images.length} 张）`);
} else if (dryRun && images.length) {
  console.log(`dry-run：将发布 ${images.length} 张的清单`);
}

console.log(`完成: 发布 ${images.length} · 新传缩略图 ${thumbsUploaded} · 跳过 ${skipped.length}`);
for (const s of skipped) console.log(`  跳过 ${s.sha1.slice(0, 10)}: ${s.reason}`);
process.exit(skipped.length > 0 ? 1 : 0);
