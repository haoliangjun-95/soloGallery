/**
 * 无数据库的核心管线自检：夹具生成（EXIF 注入）→ 嗅探 → EXIF 提取 →
 * display 生成 → grid 变体 → manifest 归并。快速验证同步引擎依赖的纯逻辑，不需要 MySQL。
 *   npx tsx scripts/pipeline-check.ts
 */
import crypto from "node:crypto";
import sharp from "sharp";
import { buildItems, phase1Manifests } from "./fixtures.mjs";
import { sniffImage } from "../src/lib/sniff";
import { extractExif } from "../src/lib/exif";
import { generateDisplay, generateGridVariants } from "../src/lib/image-pipeline";
import { mergeManifests, parseManifest } from "../src/lib/manifest";

let failures = 0;
function assert(cond: unknown, label: string) {
  const ok = Boolean(cond);
  console.log(`${ok ? "  ✅" : "  ❌"} ${label}`);
  if (!ok) failures++;
}

const items = await buildItems();

const hash = crypto.createHash("sha1").update(items[0].jpeg).digest("hex");
assert(hash === items[0].hash, "sha1 内容寻址一致");

const sniff = sniffImage(items[0].jpeg);
assert(sniff.format === "JPEG" && sniff.mimeType === "image/jpeg", `格式嗅探 JPEG（实际 ${sniff.format}）`);

const exif = await extractExif(items[0].jpeg);
assert(String(exif?.model ?? "").includes("EOS R6m2"), `EXIF 机身（实际 ${exif?.model}）`);
assert(String(exif?.lensModel ?? "").includes("RF24-105"), `EXIF 镜头（实际 ${exif?.lensModel}）`);
assert(exif?.iso === 100, `EXIF ISO（实际 ${exif?.iso}）`);
assert(exif?.exposureTime !== undefined && Math.abs(1 / exif.exposureTime - 160) < 1, `EXIF 快门 1/160（实际 ${exif?.exposureTime}）`);
assert(exif?.shotAt?.startsWith("2026-02-12"), `EXIF 拍摄时间（实际 ${exif?.shotAt}）`);

const disp = await generateDisplay(items[1].jpeg); // 竖图 900x1350
assert(disp.webp.length > 1000, `display WebP 生成（${disp.webp.length} bytes）`);
assert(disp.displayWidth === 900, `竖图不放大（display ${disp.displayWidth}x${disp.displayHeight}）`);
assert(disp.width === 900 && disp.height === 1350, `原始尺寸（${disp.width}x${disp.height}）`);

// 功能 10：grid 变体从 display WebP 派生；900w 竖图 → 400/800 两档都是真实缩小
const grid = await generateGridVariants(disp.webp);
assert(
  grid.length === 2 && grid[0].width === 400 && grid[1].width === 800,
  `grid 变体档位（${grid.map((g) => `${g.width}w/${g.webp.length}B`).join(" ")}）`,
);
const g0 = await sharp(grid[0].webp).metadata();
const g1 = await sharp(grid[1].webp).metadata();
assert(g0.width === 400 && g0.height === 600 && g0.format === "webp", `400w 档实际尺寸/格式（${g0.width}x${g0.height}/${g0.format}）`);
assert(g1.width === 800 && g1.height === 1200 && g1.format === "webp", `800w 档实际尺寸/格式（${g1.width}x${g1.height}/${g1.format}）`);
assert(grid[0].webp.length < disp.webp.length && grid[1].webp.length < disp.webp.length, "变体字节数小于 display（缩小有效）");

const snapshots = phase1Manifests(items).map((m) => ({
  deviceId: m.device,
  ts: m.ts,
  ...parseManifest(m.json),
}));
const merged = mergeManifests(snapshots);
assert(merged.size === 8, `归并 8 张（实际 ${merged.size}）`);
assert([...merged.values()].every((m) => !m.deleted), "无 tombstone");
const w1 = merged.get(items[0].hash);
assert(w1?.categoryName === "风景", `categoryId 经 categories 映射为名称（实际 ${w1?.categoryName}）`);
assert(w1?.fileName === "DSC_1001.jpg", `fileName 直接来自 manifest（实际 ${w1?.fileName}）`);
const w5 = merged.get(items[4].hash);
assert(
  Array.isArray(w5?.tags) && w5!.tags.includes("风景") && w5!.tags.includes("旅行"),
  `跨设备 tags 并集（实际 ${w5?.tags.join(",")}）`,
);
assert(w5?.favorite === true, "favorite 跨设备取或");

console.log(failures === 0 ? "\n🎉 管线自检全部通过" : `\n⚠️ ${failures} 项失败`);
process.exit(failures === 0 ? 0 : 1);
