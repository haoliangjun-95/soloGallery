import "server-only";
import { cache } from "react";
import { prisma } from "../db";
import { buildGearCameras, buildGearLenses, GEAR_PARAM_MAX, type GearLists } from "../gear";
import { DISPLAY_UTC_OFFSET } from "../time";
import type { CategoryDTO, TagDTO } from "../types";


export async function listCategories(publishedOnly = true): Promise<CategoryDTO[]> {
  const rows = await prisma.category.findMany({
    orderBy: { sortOrder: "asc" },
    select: {
      id: true,
      name: true,
      slug: true,
      _count: { select: { photos: { where: publishedOnly ? { published: true, missing: false } : undefined } } },
    },
  });
  return rows.map((r) => ({ id: r.id, name: r.name, slug: r.slug, count: r._count.photos }));
}

export async function listTags(publishedOnly = true): Promise<TagDTO[]> {
  const rows = await prisma.tag.findMany({
    orderBy: { name: "asc" },
    select: {
      id: true,
      name: true,
      _count: { select: { photoTags: { where: publishedOnly ? { photo: { published: true, missing: false } } : undefined } } },
    },
  });
  return rows.map((r) => ({ id: r.id, name: r.name, count: r._count.photoTags }));
}

/** 收藏数（侧栏入口用，仅公开图）。 */
export async function countFavorites(): Promise<number> {
  return prisma.photo.count({ where: { published: true, missing: false, favorite: true } });
}
/** 年份分组（按拍摄时间），倒序：[{year: 2026, count: 12}, ...]。publishedOnly=false 时含未发布。 */
/** 请求级缓存：page.tsx 与 listMemories 同请求各调一次，全表聚合只跑一遍（同 getSettings 模式） */
export const listYears = cache(async (publishedOnly = true): Promise<{ year: number; count: number }[]> => {
  const { Prisma } = await import("@/generated/prisma/client");
  const cond = publishedOnly ? Prisma.sql`AND published = 1 AND missing = 0` : Prisma.empty;
  // 同 listMonths：年份也按展示时区归属，跨年零点的照片才不会和筛选结果打架
  const rows = await prisma.$queryRaw<Array<{ year: number; count: bigint }>>`
    SELECT YEAR(CONVERT_TZ(shotAt, '+00:00', ${DISPLAY_UTC_OFFSET})) AS year, COUNT(*) AS count
    FROM Photo
    WHERE shotAt IS NOT NULL ${cond}
    GROUP BY year
    ORDER BY year DESC
  `;
  return rows.map((r) => ({ year: Number(r.year), count: Number(r.count) }));
});

/**
 * 器材聚合（功能 3）：相机（make+model 组合）与镜头（lensModel）去重列表 + 计数，
 * 侧栏"器材"分组数据源。请求级缓存：page.tsx 一次取齐后传 Sidebar（同 listYears 模式）。
 * JSON_EXTRACT 全表扫描——exif 无 JSON path 索引，个人库量级可接受（技术债清单有记录）。
 */
export const listGear = cache(async (publishedOnly = true): Promise<GearLists> => {
  // GROUP BY 用 SELECT 别名（MariaDB 支持，与 listMonths 的 GROUP BY ym 同款）；
  // 键不存在 → SQL NULL、JSON null → 字符串 "null"，统一交 buildGear* 清洗。
  // LEFT(..., GEAR_PARAM_MAX) 与 parseGearParam 同一截断口径：超长存储值聚合出的
  // 标签与其链接参数一致，避免「侧栏计数>0 点进列表为空」（真实数据最长 35，纯防御）
  const { Prisma } = await import("@/generated/prisma/client");
  const cond = publishedOnly ? Prisma.sql`AND published = 1 AND missing = 0` : Prisma.empty;
  const [cameraRows, lensRows] = await Promise.all([
    prisma.$queryRaw<Array<{ make: string | null; model: string | null; count: bigint }>>`
      SELECT LEFT(JSON_UNQUOTE(JSON_EXTRACT(exif, '$.make')), ${GEAR_PARAM_MAX}) AS make,
             LEFT(JSON_UNQUOTE(JSON_EXTRACT(exif, '$.model')), ${GEAR_PARAM_MAX}) AS model,
             COUNT(*) AS count
      FROM Photo
      WHERE exif IS NOT NULL ${cond}
      GROUP BY make, model
      ORDER BY count DESC
    `,
    prisma.$queryRaw<Array<{ lens: string | null; count: bigint }>>`
      SELECT LEFT(JSON_UNQUOTE(JSON_EXTRACT(exif, '$.lensModel')), ${GEAR_PARAM_MAX}) AS lens, COUNT(*) AS count
      FROM Photo
      WHERE exif IS NOT NULL ${cond}
      GROUP BY lens
      ORDER BY count DESC
    `,
  ]);
  return { cameras: buildGearCameras(cameraRows), lenses: buildGearLenses(lensRows) };
});

