import "server-only";
import { prisma } from "../db";

export interface GalleryStats {
  /** 已发布且未缺失的照片总数 */
  total: number;
  /** 原图字节总量（BigInt 求和转 number） */
  bytes: number;
  earliest: Date | null;
  latest: Date | null;
  /** 带 GPS 坐标的照片数（半截 gps 按 lat 判定，与 listMapPoints 的闸门口径一致由调用方保证） */
  withGps: number;
}

/** 统计页总览聚合：单条 SQL 拿全（COUNT/SUM/MIN/MAX/GPS 计数），只算公开图。 */
export async function getGalleryStats(): Promise<GalleryStats> {
  const rows = await prisma.$queryRaw<
    Array<{ total: bigint; bytes: bigint | null; earliest: Date | null; latest: Date | null; withGps: bigint | null }>
  >`
    SELECT COUNT(*) AS total,
           SUM(fileSize) AS bytes,
           MIN(shotAt) AS earliest,
           MAX(shotAt) AS latest,
           SUM(CASE WHEN JSON_EXTRACT(exif, '$.gps.lat') IS NOT NULL THEN 1 ELSE 0 END) AS withGps
    FROM Photo
    WHERE published = 1 AND missing = 0
  `;
  const r = rows[0];
  return {
    total: Number(r?.total ?? 0),
    bytes: Number(r?.bytes ?? 0),
    earliest: r?.earliest ?? null,
    latest: r?.latest ?? null,
    withGps: Number(r?.withGps ?? 0),
  };
}
