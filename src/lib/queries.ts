import "server-only";
import { cache } from "react";
import { buildGridSrcset, displayKey, originalKey } from "./bucket-layout";
import { publicUrl } from "./config";
import { prisma } from "./db";
import { getSettings } from "./settings";
import { isAdmin } from "./auth";
import { buildArchiveYear, type ArchiveMonth } from "./archive";
import { buildGearCameras, buildGearLenses, gearWhere, GEAR_PARAM_MAX, parseGearParam, type GearLists } from "./gear";
import { hideGps } from "./geo";
import { reservoirSample } from "./sample";
import type { NormalizedExif } from "./exif";
import {
  DISPLAY_UTC_OFFSET,
  displayMonthDay,
  displayMonthKey,
  monthBounds,
  monthDayBoundsInYear,
  yearBounds,
  type TimeBounds,
} from "./time";
import type {
  AdminPhotoDTO,
  CategoryDTO,
  CommentAdminDTO,
  CommentDTO,
  PhotoCardDTO,
  PhotoDetailDTO,
  TagDTO,
} from "./types";

export interface ListOptions {
  page?: number;
  pageSize?: number;
  categorySlug?: string;
  tag?: string;
  year?: number;
  /** 按名称搜索（标题/文件名，不区分大小写包含匹配） */
  q?: string;
  /** 仅看收藏 */
  favorite?: boolean;
  /** 月份筛选 YYYY-MM */
  month?: string;
  /** 器材筛选（功能 3）：EXIF make/model（相机双维度）与 lensModel */
  make?: string;
  model?: string;
  lens?: string;
  publishedOnly?: boolean;
  includeMissing?: boolean;
}

type CardSource = {
  id: number;
  sha1: string;
  title: string;
  fileName: string;
  format: string;
  fileSize: bigint;
  thumbKey: string | null;
  gridReady: boolean;
  width: number | null;
  height: number | null;
  shotAt: Date | null;
  exif: unknown;
  wallpaperSnapshot: unknown;
  favorite: boolean;
  category: { name: string; slug: string } | null;
  photoTags: { tag: { name: string } }[];
};

function toCard(p: CardSource): PhotoCardDTO {
  const display = displayKey(p.sha1);
  return {
    id: p.id,
    sha1: p.sha1,
    title: p.title,
    fileName: p.fileName,
    format: p.format,
    fileSize: Number(p.fileSize),
    thumbUrl: p.thumbKey ? publicUrl(p.thumbKey) : publicUrl(display),
    // 功能 10：变体存在才输出 srcset（老照片 null → img 无 srcSet 属性，
    // 浏览器沿用 src）；键纯 sha1 派生，publicUrl 以 toUrl 注入纯构造器
    thumbSrcset: p.gridReady ? buildGridSrcset(p.sha1, publicUrl) : null,
    displayUrl: publicUrl(display),
    width: p.width,
    height: p.height,
    shotAt: p.shotAt ? p.shotAt.toISOString() : null,
    exif: (p.exif as PhotoCardDTO["exif"]) ?? null,
    category: p.category,
    tags: p.photoTags.map((pt) => pt.tag.name).sort(),
    favorite: p.favorite,
  };
}

/** 列表卡片所需的关联与字段（前台/管理端共用）。 */
const CARD_SELECT = {
  id: true,
  sha1: true,
  title: true,
  fileName: true,
  format: true,
  fileSize: true,
  thumbKey: true,
  gridReady: true,
  width: true,
  height: true,
  shotAt: true,
  exif: true,
  wallpaperSnapshot: true,
  favorite: true,
  category: { select: { name: true, slug: true } },
  photoTags: { select: { tag: { select: { name: true } } } },
} as const;

/**
 * GPS 可见性判定（功能 18）：React cache 请求级去重——同一请求内多个公开
 * 生产点（listPhotos/listRandomPhotos/getPhotoDetail）只读一次设置 + 会话。
 * exposeGps 关闭时站长仍可见；管理端 DTO 走 listPhotosAdmin 等独立函数，不经此闸门。
 */
const canSeeGps = cache(async (): Promise<boolean> => {
  const { exposeGps } = await getSettings();
  return exposeGps === "true" || isAdmin();
});

/**
 * 公开 DTO 裁剪：expose=true 或无 gps 时原引用返回（零拷贝）；
 * 否则浅拷贝剔除 gps（hideGps 保证不可变）。收敛所有公开 exif 出口。
 */
function applyGpsPolicy<P extends { exif: NormalizedExif | null }>(photo: P, expose: boolean): P {
  if (expose || !photo.exif?.gps) return photo;
  return { ...photo, exif: hideGps(photo.exif) };
}

/**
 * listPhotos 与 getAdjacentPhotos 共用的可见性 + 筛选 where 构造——
 * 详情页"上一张/下一张"必须与列表用同一套筛选语义，否则相邻关系会错位。
 */
function buildListWhere(options: ListOptions) {
  const q = options.q?.trim().slice(0, 64);
  // 年/月边界统一走展示时区（lib/time），与日历分组、月份列表保持同一套换算
  const month = options.month ? monthBounds(options.month) : null;
  const year = options.year ? yearBounds(options.year) : null;
  return {
    ...(options.publishedOnly === false ? {} : { published: true }),
    ...(options.includeMissing ? {} : { missing: false }),
    ...(options.categorySlug ? { category: { slug: options.categorySlug } } : {}),
    ...(options.tag ? { photoTags: { some: { tag: { name: options.tag } } } } : {}),
    ...(year ? { shotAt: { gte: year.gte, lt: year.lt } } : {}),
    ...(month ? { shotAt: { gte: month.gte, lt: month.lt } } : {}),
    ...(q ? { OR: [{ title: { contains: q } }, { fileName: { contains: q } }] } : {}),
    ...(options.favorite ? { favorite: true } : {}),
    // 器材筛选（功能 3）：exif Json path 等值 AND 片段，无器材参数时为空对象零影响。
    // 与 q 同款纵深防御：入口已 parseGearParam，此处再清洗一次，任何调用方都不会把垃圾串带进查询
    ...gearWhere({
      make: parseGearParam(options.make),
      model: parseGearParam(options.model),
      lens: parseGearParam(options.lens),
    }),
  };
}

export async function listPhotos(options: ListOptions = {}): Promise<{ items: PhotoCardDTO[]; total: number; page: number; pageSize: number }> {
  const settings = await getSettings();
  const page = Math.max(1, options.page ?? 1);
  const pageSize = Math.min(96, Math.max(1, options.pageSize ?? (Number(settings.pageSize) || 24)));
  const where = buildListWhere(options);
  const [rows, total] = await Promise.all([
    prisma.photo.findMany({
      where,
      orderBy: [{ shotAt: "desc" }, { createdAt: "desc" }],
      skip: (page - 1) * pageSize,
      take: pageSize,
      select: CARD_SELECT,
    }),
    prisma.photo.count({ where }),
  ]);
  const exposeGps = await canSeeGps();
  return { items: rows.map((r) => applyGpsPolicy(toCard(r), exposeGps)), total, page, pageSize };
}

/** 管理端列表（含筛选与状态标记）。status: published/unpublished/missing。 */
export async function listPhotosAdmin(
  options: ListOptions & { status?: "published" | "unpublished" | "missing" } = {},
): Promise<{
  items: AdminPhotoDTO[];
  total: number;
  page: number;
  pageSize: number;
}> {
  const settings = await getSettings();
  const page = Math.max(1, options.page ?? 1);
  const pageSize = Math.min(96, Math.max(1, options.pageSize ?? (Number(settings.pageSize) || 24)));
  const q = options.q?.trim().slice(0, 64);
  // 信任边界：year 由调用方（admin photos 页）经 parseYear 校验（1971..9998）；
  // 新增调用方必须同样走 parseYear——yearBounds 对 ≥9999 构造 Invalid Date 即 500
  const year = options.year && Number.isInteger(options.year) ? yearBounds(options.year) : null;
  const where = {
    ...(options.categorySlug ? { category: { slug: options.categorySlug } } : {}),
    ...(options.tag ? { photoTags: { some: { tag: { name: options.tag } } } } : {}),
    ...(q ? { OR: [{ title: { contains: q } }, { fileName: { contains: q } }] } : {}),
    ...(year ? { shotAt: { gte: year.gte, lt: year.lt } } : {}),
    ...(options.favorite ? { favorite: true } : {}),
    ...(options.status === "published"
      ? { published: true, missing: false }
      : options.status === "unpublished"
        ? { published: false }
        : options.status === "missing"
          ? { missing: true }
          : {}),
  };
  const [rows, total] = await Promise.all([
    prisma.photo.findMany({
      where,
      orderBy: [{ createdAt: "desc" }],
      skip: (page - 1) * pageSize,
      take: pageSize,
      select: { ...CARD_SELECT, published: true, missing: true, source: true },
    }),
    prisma.photo.count({ where }),
  ]);
  return {
    items: rows.map((p) => ({
      ...toCard(p),
      published: p.published,
      missing: p.missing,
      source: p.source,
      category: p.category?.name ?? null,
    })),
    total,
    page,
    pageSize,
  };
}

/** 请求级缓存：详情页 generateMetadata 与页面主体共用一次抓取（fetch memoization 不覆盖 Prisma）。 */
export const getPhotoDetail = cache(async (sha1OrPrefix: string): Promise<PhotoDetailDTO | null> => {
  const isFull = /^[a-f0-9]{40}$/i.test(sha1OrPrefix);
  const photo = await prisma.photo.findFirst({
    where: isFull ? { sha1: sha1OrPrefix.toLowerCase() } : { sha1: { startsWith: sha1OrPrefix.toLowerCase() } },
    // 短前缀碰撞多行时与 resolvePhoto 选同一行（同 min-id）：渲染的 detail 必须就是
    // 通过 published/missing 判定的那行，否则存在"判定行已发布、渲染行未发布"的泄露路径（评审 H-1）
    orderBy: { id: "asc" },
    include: {
      category: { select: { name: true, slug: true } },
      photoTags: { include: { tag: true } },
      comments: { where: { status: "APPROVED" }, orderBy: { createdAt: "asc" } },
    },
  });
  if (!photo) return null;
  const comments: CommentDTO[] = photo.comments.map((c) => ({
    id: c.id,
    nickname: c.nickname,
    content: c.content,
    adminReply: c.adminReply,
    adminReplyAt: c.adminReplyAt ? c.adminReplyAt.toISOString() : null,
    createdAt: c.createdAt.toISOString(),
  }));
  const detail: PhotoDetailDTO = {
    id: photo.id,
    sha1: photo.sha1,
    title: photo.title,
    description: photo.description,
    fileName: photo.fileName,
    format: photo.format,
    fileSize: Number(photo.fileSize),
    width: photo.width,
    height: photo.height,
    thumbUrl: photo.thumbKey ? publicUrl(photo.thumbKey) : publicUrl(displayKey(photo.sha1)),
    displayUrl: publicUrl(displayKey(photo.sha1)),
    shotAt: photo.shotAt ? photo.shotAt.toISOString() : null,
    exif: (photo.exif as PhotoDetailDTO["exif"]) ?? null,
    category: photo.category,
    tags: photo.photoTags.map((pt) => pt.tag.name).sort(),
    comments,
    originalUrl: `/api/photos/${photo.sha1}/original`,
  };
  return applyGpsPolicy(detail, await canSeeGps());
});

export interface AdjacentPhoto {
  sha1: string;
  title: string;
}

export interface AdjacentPhotos {
  /** 列表序中前一张（较新，列表靠前） */
  prev: AdjacentPhoto | null;
  /** 列表序中后一张（较旧，列表靠后） */
  next: AdjacentPhoto | null;
}

const ADJACENT_SELECT = { sha1: true, title: true };

/**
 * 指定筛选上下文下、按列表排序（shotAt desc, createdAt desc，与 listPhotos 一致）
 * 取相邻照片，sha1 须为完整值。
 *
 * MariaDB 默认 NULL 排序（ASC 在前 / DESC 在后）与 listPhotos 的隐式行为一致：
 * shotAt 为 null 的照片恒排在列表末尾。
 * - 当前照片 shotAt 非空：next 用 (lt) OR (eq 且 createdAt lt) OR (null) 三条件，
 *   DESC 序 take 1 天然取到"列表中的下一张"（非空段的下一张，或空段的第一张）；
 *   prev 用 (gt) OR (eq 且 createdAt gt)，NULL 不参与 >/< 比较故自然被排除。
 * - 当前照片 shotAt 为 null（实践数据中几乎不存在）：next 只在 null 段内按
 *   createdAt 找；prev 先取非空段最后一张（ASC 序最小），全库皆 null 才退回 createdAt。
 *
 * 相邻条件与 buildListWhere（q 筛选会产生顶层 OR）用 AND 组合，避免键覆盖。
 * 两张照片 (shotAt, createdAt) 完全相同时先后未定义——与列表分页自身的
 * skip/take 边界行为一致，不做额外决胜。
 */
export async function getAdjacentPhotos(
  sha1: string,
  options: ListOptions = {},
): Promise<AdjacentPhotos> {
  const where = buildListWhere(options);
  const cur = await prisma.photo.findFirst({
    where: { ...where, sha1 },
    select: { shotAt: true, createdAt: true },
  });
  if (!cur) return { prev: null, next: null };

  const findNext = (): Promise<AdjacentPhoto | null> =>
    cur.shotAt
      ? prisma.photo.findFirst({
          where: {
            AND: [
              where,
              {
                OR: [
                  { shotAt: { lt: cur.shotAt } },
                  { shotAt: cur.shotAt, createdAt: { lt: cur.createdAt } },
                  { shotAt: null },
                ],
              },
            ],
          },
          orderBy: [{ shotAt: "desc" }, { createdAt: "desc" }],
          select: ADJACENT_SELECT,
        })
      : prisma.photo.findFirst({
          where: { AND: [where, { shotAt: null, createdAt: { lt: cur.createdAt } }] },
          orderBy: { createdAt: "desc" },
          select: ADJACENT_SELECT,
        });

  const findPrev = async (): Promise<AdjacentPhoto | null> => {
    if (cur.shotAt) {
      return prisma.photo.findFirst({
        where: {
          AND: [
            where,
            {
              OR: [
                { shotAt: { gt: cur.shotAt } },
                { shotAt: cur.shotAt, createdAt: { gt: cur.createdAt } },
              ],
            },
          ],
        },
        orderBy: [{ shotAt: "asc" }, { createdAt: "asc" }],
        select: ADJACENT_SELECT,
      });
    }
    // 列序 null 段按 createdAt 倒序排在末尾：当前是段内第 2+ 行时，上一张是段内
    // createdAt 更大的最近一条；仅当当前是段首才回退到非空段末尾（最旧一张）。
    // 顺序不能反——先取 lastNonNull 会跳过 null 段邻居（无 EXIF 上传即产生该段）
    const nullSegPrev = await prisma.photo.findFirst({
      where: { AND: [where, { shotAt: null, createdAt: { gt: cur.createdAt } }] },
      orderBy: { createdAt: "asc" },
      select: ADJACENT_SELECT,
    });
    return (
      nullSegPrev ??
      prisma.photo.findFirst({
        where: { AND: [where, { shotAt: { not: null } }] },
        orderBy: [{ shotAt: "asc" }, { createdAt: "asc" }],
        select: ADJACENT_SELECT,
      })
    );
  };

  const [prev, next] = await Promise.all([findPrev(), findNext()]);
  return { prev, next };
}

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

export interface MonthGroup {
  ym: string; // YYYY-MM
  year: number;
  month: number;
  count: number;
  photos: { sha1: string; thumbUrl: string; title: string; favorite: boolean }[];
}

/** 有照片的月份列表（倒序），日历视图与前后月切换用。 */
export async function listMonths(publishedOnly = true): Promise<{ ym: string; count: number }[]> {
  const { Prisma } = await import("@/generated/prisma/client");
  const cond = publishedOnly ? Prisma.sql`AND published = 1 AND missing = 0` : Prisma.empty;
  // shotAt 存的是 UTC，先转展示时区再取月份，否则东八区凌晨的照片会落到上一个月。
  // 用字面量偏移（非 'Asia/Shanghai'）以免依赖 MySQL 时区表是否导入。
  const rows = await prisma.$queryRaw<Array<{ ym: string; count: bigint }>>`
    SELECT DATE_FORMAT(CONVERT_TZ(shotAt, '+00:00', ${DISPLAY_UTC_OFFSET}), '%Y-%m') AS ym, COUNT(*) AS count
    FROM Photo
    WHERE shotAt IS NOT NULL ${cond}
    GROUP BY ym
    ORDER BY ym DESC
  `;
  return rows.map((r) => ({ ym: r.ym, count: Number(r.count) }));
}

/** 日历视图单次最多加载的照片数：无上限会随库增长拖垮首屏与内存 */
const CALENDAR_MAX_PHOTOS = 20000;

/** 日历视图轻量数据（已发布，按拍摄时间倒序，上限 CALENDAR_MAX_PHOTOS），JS 侧按月分组。 */
export async function listPhotosCalendar(): Promise<MonthGroup[]> {
  const rows = await prisma.photo.findMany({
    where: { published: true, missing: false },
    orderBy: [{ shotAt: "desc" }, { createdAt: "desc" }],
    take: CALENDAR_MAX_PHOTOS,
    select: { sha1: true, thumbKey: true, title: true, favorite: true, shotAt: true },
  });
  const groups = new Map<string, MonthGroup>();
  for (const r of rows) {
    if (!r.shotAt) continue;
    // 按展示时区分月，与 listMonths 的 CONVERT_TZ 分组保持一致
    const key = displayMonthKey(r.shotAt);
    let g = groups.get(key);
    if (!g) {
      g = {
        ym: key,
        year: Number(key.slice(0, 4)),
        month: Number(key.slice(5, 7)),
        count: 0,
        photos: [],
      };
      groups.set(key, g);
    }
    g.count++;
    g.photos.push({
      sha1: r.sha1,
      thumbUrl: publicUrl(r.thumbKey ?? displayKey(r.sha1)),
      title: r.title,
      favorite: r.favorite,
    });
  }
  return [...groups.values()].sort((a, b) => (a.ym < b.ym ? 1 : -1));
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
 * 年度归档（功能 16）：某年已发布照片的轻量行 → 按展示时区月份分节、每月收藏优先精选。
 * 与 listPhotosCalendar 同款轻量 select；年份边界走 yearBounds（展示时区 UTC 瞬间，
 * 与 listYears 的 CONVERT_TZ 分组同一时间语义）。分组/排序/截断收敛在 archive.ts 纯函数层。
 */
export async function listArchiveYear(year: number): Promise<ArchiveMonth[]> {
  const { gte, lt } = yearBounds(year);
  const rows = await prisma.photo.findMany({
    where: { published: true, missing: false, shotAt: { gte, lt } },
    orderBy: [{ shotAt: "desc" }, { createdAt: "desc" }],
    select: { sha1: true, thumbKey: true, title: true, favorite: true, shotAt: true },
  });
  return buildArchiveYear(
    rows.map((r) => ({
      sha1: r.sha1,
      title: r.title,
      thumbUrl: publicUrl(r.thumbKey ?? displayKey(r.sha1)),
      favorite: r.favorite,
      // shotAt 由 where 边界保证非空；空串兜底仅为 TS 收窄，真出现也会被
      // buildArchiveYear 的 `${year}-` 前缀过滤排除（纯函数层纵深防御）
      monthKey: r.shotAt ? displayMonthKey(r.shotAt) : "",
    })),
    year,
  );
}

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

/** "那年今日"轻量照片卡（横滑条专用，无 exif/文件元数据）。 */
export interface MemoryPhoto {
  sha1: string;
  thumbUrl: string;
  title: string;
  favorite: boolean;
}

export interface MemoryGroup {
  year: number;
  yearsAgo: number;
  photos: MemoryPhoto[];
}

export interface MemoriesResult {
  /** 展示时区的今天 "MM-DD"（标题展示与分组换算同源） */
  monthDay: string;
  groups: MemoryGroup[];
}

/** 单年上限：防止某一年数量碾压其他年份，横滑条失去"跨年回顾"意义 */
const MEMORIES_PER_YEAR = 12;

/**
 * "那年今日"：往年（不含今年）的今天（展示时区 MM-DD）拍摄的照片，按年分组倒序。
 * 只对库里有照片的年份构造日界 range（复用 listYears），平年 2-29 自动跳过；
 * 每年一个走索引的 range 查询、各取至多 MEMORIES_PER_YEAR 张并行执行——
 * 若改为全局 OR + take，最近的某个大日子会占满配额，更早年份一张都进不来。
 */
export async function listMemories(now: Date = new Date()): Promise<MemoriesResult> {
  const monthDay = displayMonthDay(now);
  const thisYear = Number(displayMonthKey(now).slice(0, 4));
  const years = await listYears();
  const ranges = years
    .filter((y) => y.year < thisYear)
    .map((y) => ({ year: y.year, bounds: monthDayBoundsInYear(y.year, monthDay) }))
    .filter((r): r is { year: number; bounds: TimeBounds } => r.bounds !== null);
  if (!ranges.length) return { monthDay, groups: [] };

  // 每年的日界 range 内所有行天然同属该展示日，无需再按 displayMonthKey 归年
  const perYear = await Promise.all(
    ranges.map(async (r) => {
      const rows = await prisma.photo.findMany({
        where: { published: true, missing: false, shotAt: { gte: r.bounds.gte, lt: r.bounds.lt } },
        orderBy: { shotAt: "desc" },
        take: MEMORIES_PER_YEAR,
        select: { sha1: true, thumbKey: true, title: true, favorite: true },
      });
      return { year: r.year, rows };
    }),
  );

  return {
    monthDay,
    groups: perYear
      .filter((g) => g.rows.length > 0)
      .sort((a, b) => b.year - a.year)
      .map((g) => ({
        year: g.year,
        yearsAgo: thisYear - g.year,
        photos: g.rows.map(
          (r): MemoryPhoto => ({
            sha1: r.sha1,
            thumbUrl: publicUrl(r.thumbKey ?? displayKey(r.sha1)),
            title: r.title,
            favorite: r.favorite,
          }),
        ),
      })),
  };
}

/** 随机漫游候选 id 上限：只 select id，内存可忽略（与日历视图上限同量级） */
const RANDOM_CANDIDATE_CAP = 20000;
/** 单次随机漫游的照片数（上限，防调用方传入过大值） */
const RANDOM_WALK_COUNT = 10;

/**
 * 随机漫游：应用层水塘抽样取 count 张已发布照片。
 * 两段式（轻量 id 候选 → 按 id 回取完整卡片）避免 ORDER BY RAND() 全表排序；
 * 返回顺序保持抽样顺序。
 */
export async function listRandomPhotos(count: number = RANDOM_WALK_COUNT): Promise<PhotoCardDTO[]> {
  if (count <= 0) return [];
  const n = Math.min(count, RANDOM_WALK_COUNT);
  // 候选池无 orderBy：库超过 RANDOM_CANDIDATE_CAP 后"前 2 万"由存储引擎决定
  // （近似主键序 = 偏向老照片）。当前规模远低于上限可接受；超限时应改
  // COUNT + 随机 offset 分段取候选。
  const candidates = await prisma.photo.findMany({
    where: { published: true, missing: false },
    select: { id: true },
    take: RANDOM_CANDIDATE_CAP,
  });
  const picked = reservoirSample(candidates, n).map((c) => c.id);
  if (!picked.length) return [];
  // 回取不复检 published/missing：容忍两段查询之间照片被下架的极小窗口
  const rows = await prisma.photo.findMany({
    where: { id: { in: picked } },
    select: CARD_SELECT,
  });
  const byId = new Map(rows.map((r) => [r.id, r]));
  const exposeGps = await canSeeGps();
  return picked.flatMap((id) => {
    const r = byId.get(id);
    return r ? [applyGpsPolicy(toCard(r), exposeGps)] : [];
  });
}

/** 未读评论数（待审/已通过且从未被后台查看过；垃圾拦截的不计）。 */
export async function countUnreadComments(): Promise<number> {
  return prisma.comment.count({
    where: { readAt: null, status: { in: ["PENDING", "APPROVED"] } },
  });
}

/** 后台打开评论页即视为已读：批量打标。 */
export async function markAllCommentsRead(): Promise<number> {
  const res = await prisma.comment.updateMany({
    where: { readAt: null, status: { in: ["PENDING", "APPROVED"] } },
    data: { readAt: new Date() },
  });
  return res.count;
}

export async function listCommentsAdmin(status?: "PENDING" | "APPROVED" | "SPAM"): Promise<CommentAdminDTO[]> {
  const rows = await prisma.comment.findMany({
    where: status ? { status } : undefined,
    orderBy: { createdAt: "desc" },
    take: 200,
    include: { photo: { select: { title: true, sha1: true } } },
  });
  return rows.map((c) => ({
    id: c.id,
    nickname: c.nickname,
    email: c.email,
    content: c.content,
    adminReply: c.adminReply,
    adminReplyAt: c.adminReplyAt ? c.adminReplyAt.toISOString() : null,
    createdAt: c.createdAt.toISOString(),
    status: c.status,
    ip: c.ip,
    photoTitle: c.photo.title,
    photoSha1: c.photo.sha1,
  }));
}

export function originalStorageKey(sha1: string): string {
  return originalKey(sha1);
}
