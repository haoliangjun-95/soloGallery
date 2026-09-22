/**
 * 存量照片 GPS 地名回填，幂等可重跑：
 * 1) exif 里没有 gps 的记录 —— 重新下载原图、提取 GPS（Nominatim 限速 1req/s）并更新；
 * 2) 已有 gps 但缺 gps.location 的记录（如迁移脚本导入的行）—— 直接用存量坐标反查地名，不重复下载。
 *   npx tsx scripts/backfill-gps.mts [--limit N]
 */
import "dotenv/config";
import { prisma } from "../src/lib/db";
import { extractExif } from "../src/lib/exif";
import { reverseGeocode } from "../src/lib/geo";
import { getBuffer } from "../src/lib/s3";
import type { GeoPoint } from "../src/lib/exif";

const limitArg = Number(process.argv[process.argv.indexOf("--limit") + 1]);

const photos = await prisma.photo.findMany({
  select: { id: true, sha1: true, exif: true },
  orderBy: { id: "asc" },
});
type ExifLike = { gps?: (GeoPoint & { location?: unknown }) | null } | null;
const noGps = photos.filter((p) => !(p.exif as ExifLike)?.gps);
const noLocation = photos.filter((p) => {
  const gps = (p.exif as ExifLike)?.gps;
  return gps && !gps.location;
});
console.log(
  `共 ${photos.length} 张 · 待提取GPS ${noGps.length} · 待补地名 ${noLocation.length}` +
    (Number.isInteger(limitArg) && limitArg > 0 ? `（本次各处理上限 ${limitArg}）` : ""),
);

let withGps = 0;
let withoutGps = 0;
let geocoded = 0;
let errors = 0;

async function geocodeAndUpdate(id: number, exif: NonNullable<ExifLike>, gps: GeoPoint): Promise<void> {
  const location = await reverseGeocode(gps);
  if (location) {
    gps.location = location;
    geocoded++;
  }
  await prisma.photo.update({
    where: { id },
    data: { exif: { ...exif, gps: { ...gps } } as unknown as object },
  });
  withGps++;
  if (withGps % 20 === 0) console.log(`  进度: 已处理 ${withGps} 张`);
}

// 组 1：有坐标缺地名 —— 免下载直接反查
for (const photo of noLocation) {
  if (limitArg > 0 && withGps >= limitArg) break;
  try {
    const exif = (photo.exif ?? {}) as NonNullable<ExifLike>;
    const gps = exif.gps as GeoPoint;
    await geocodeAndUpdate(photo.id, exif, gps);
  } catch (err) {
    errors++;
    console.warn(`  失败 ${photo.sha1.slice(0, 10)}:`, err instanceof Error ? err.message : err);
  }
}

// 组 2：无 gps —— 下载原图重新提取
for (const photo of noGps) {
  if (limitArg > 0 && withGps >= limitArg) break;
  try {
    const buf = await getBuffer(`objects/${photo.sha1}`);
    const exif = await extractExif(buf);
    if (!exif?.gps) {
      withoutGps++;
      continue;
    }
    await geocodeAndUpdate(photo.id, (photo.exif ?? {}) as NonNullable<ExifLike>, exif.gps);
  } catch (err) {
    errors++;
    console.warn(`  失败 ${photo.sha1.slice(0, 10)}:`, err instanceof Error ? err.message : err);
  }
}

console.log(`回填完成: 处理 ${withGps}（反查到地名 ${geocoded}）· 原图本就无GPS ${withoutGps} · 失败 ${errors}`);
process.exit(errors > 0 ? 1 : 0);
