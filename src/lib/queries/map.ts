import "server-only";
import { cache } from "react";
import { prisma } from "../db";
import { displayKey } from "../bucket-layout";
import { publicUrl } from "../config";
import { canSeeGps } from "./list";

/** 地图视图点位 DTO（功能 1）：最小负载——链接、缩略图、坐标、可选地名。 */
export interface MapPointDTO {
  sha1: string;
  title: string;
  thumbUrl: string;
  lat: number;
  lon: number;
  /** Photon 反查地名缓存（exif.gps.location），缺失时无此键 */
  location?: string;
}

/**
 * 全部带 GPS 的已发布照片点位（/map 页数据源）。
 * 隐私闸门与 listPhotos 同源：exposeGps 关闭且非管理员 → 整体空数组
 * （地图是纯 GPS 变现视图，无点可画即无意义，不存在"部分隐藏"形态）。
 * raw SQL 直接投影 gps 子对象——exif 无独立 lat/lon 列，与 listGear 同款
 * JSON path 全表扫描（个人库量级可接受，技术债清单有函数索引方案）。
 * 坐标固定 WGS-84 原样出库；GCJ-02 偏移是瓦片源属性，由 MapView 按配置转换。
 */
export const listMapPoints = cache(async (): Promise<MapPointDTO[]> => {
  if (!(await canSeeGps())) return [];
  const rows = await prisma.$queryRaw<
    Array<{
      sha1: string;
      title: string;
      thumbKey: string | null;
      lat: number | string;
      lon: number | string;
      location: string | null;
    }>
  >`
    SELECT sha1, title, thumbKey,
           JSON_EXTRACT(exif, '$.gps.lat') AS lat,
           JSON_EXTRACT(exif, '$.gps.lon') AS lon,
           JSON_UNQUOTE(JSON_EXTRACT(exif, '$.gps.location')) AS location
    FROM Photo
    WHERE JSON_EXTRACT(exif, '$.gps.lat') IS NOT NULL
      AND JSON_EXTRACT(exif, '$.gps.lon') IS NOT NULL
      AND published = 1 AND missing = 0
    ORDER BY id ASC
  `;
  return rows
    // 纵深防御：驱动可能把 JSON 数值回传为字符串；SQL NULL 需显式排除——
    // Number(null) === 0 能穿过 isFinite，半截 gps（有 lat 无 lon）会成 (lat,0) 幻影点（评审 M-1）
    .filter((r) => r.lat != null && r.lon != null && Number.isFinite(Number(r.lat)) && Number.isFinite(Number(r.lon)))
    .map((r) => ({
      sha1: r.sha1,
      title: r.title,
      thumbUrl: publicUrl(r.thumbKey ?? displayKey(r.sha1)),
      lat: Number(r.lat),
      lon: Number(r.lon),
      ...(r.location && r.location !== "null" ? { location: r.location } : {}),
    }));
});

