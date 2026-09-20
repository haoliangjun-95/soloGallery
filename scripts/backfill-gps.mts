/**
 * 存量照片 GPS 回填：对 exif 里没有 gps 的记录重新下载原图、提取 GPS、
 * 反查地名（Nominatim 限速 1req/s）并更新库。幂等，无 GPS 的照片重跑会再扫一遍。
 *   npx tsx scripts/backfill-gps.mts
 */
import "dotenv/config";
import { prisma } from "../src/lib/db";
import { extractExif } from "../src/lib/exif";
import { reverseGeocode } from "../src/lib/geo";
import { getBuffer } from "../src/lib/s3";

const photos = await prisma.photo.findMany({
  select: { id: true, sha1: true, exif: true },
  orderBy: { id: "asc" },
});
const pending = photos.filter((p) => !(p.exif as { gps?: unknown } | null)?.gps);
console.log(`共 ${photos.length} 张，其中 ${pending.length} 张待回填 GPS`);

let withGps = 0;
let withoutGps = 0;
let geocoded = 0;
let errors = 0;

for (const photo of pending) {
  try {
    const buf = await getBuffer(`objects/${photo.sha1}`);
    const exif = await extractExif(buf);
    if (!exif?.gps) {
      withoutGps++;
      continue;
    }
    const location = await reverseGeocode(exif.gps);
    if (location) {
      exif.gps.location = location;
      geocoded++;
    }
    await prisma.photo.update({
      where: { id: photo.id },
      data: { exif: { ...(photo.exif as object), ...(exif as unknown as object) } },
    });
    withGps++;
    if (withGps % 20 === 0) console.log(`  进度: 已回填 ${withGps} 张`);
  } catch (err) {
    errors++;
    console.warn(`  失败 ${photo.sha1.slice(0, 10)}:`, err instanceof Error ? err.message : err);
  }
}

console.log(`回填完成: 有GPS ${withGps}（其中反查到地名 ${geocoded}）· 无GPS ${withoutGps} · 失败 ${errors}`);
process.exit(errors > 0 ? 1 : 0);
