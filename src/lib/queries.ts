import "server-only";
import { cache } from "react";
import { displayKey, originalKey } from "./bucket-layout";
import { publicUrl } from "./config";
import { prisma } from "./db";
import { getSettings } from "./settings";
import { reservoirSample } from "./sample";
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
  width: true,
  height: true,
  shotAt: true,
  exif: true,
  wallpaperSnapshot: true,
  favorite: true,
  category: { select: { name: true, slug: true } },
  photoTags: { select: { tag: { select: { name: true } } } },
} as const;

export async function listPhotos(options: ListOptions = {}): Promise<{ items: PhotoCardDTO[]; total: number; page: number; pageSize: number }> {
  const settings = await getSettings();
  const page = Math.max(1, options.page ?? 1);
  const pageSize = Math.min(96, Math.max(1, options.pageSize ?? (Number(settings.pageSize) || 24)));
  const q = options.q?.trim().slice(0, 64);
  // 年/月边界统一走展示时区（lib/time），与日历分组、月份列表保持同一套换算
  const month = options.month ? monthBounds(options.month) : null;
  const year = options.year ? yearBounds(options.year) : null;
  const where = {
    ...(options.publishedOnly === false ? {} : { published: true }),
    ...(options.includeMissing ? {} : { missing: false }),
    ...(options.categorySlug ? { category: { slug: options.categorySlug } } : {}),
    ...(options.tag ? { photoTags: { some: { tag: { name: options.tag } } } } : {}),
    ...(year ? { shotAt: { gte: year.gte, lt: year.lt } } : {}),
    ...(month ? { shotAt: { gte: month.gte, lt: month.lt } } : {}),
    ...(q ? { OR: [{ title: { contains: q } }, { fileName: { contains: q } }] } : {}),
    ...(options.favorite ? { favorite: true } : {}),
  };
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
  return { items: rows.map(toCard), total, page, pageSize };
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

export async function getPhotoDetail(sha1OrPrefix: string): Promise<PhotoDetailDTO | null> {
  const isFull = /^[a-f0-9]{40}$/i.test(sha1OrPrefix);
  const photo = await prisma.photo.findFirst({
    where: isFull ? { sha1: sha1OrPrefix.toLowerCase() } : { sha1: { startsWith: sha1OrPrefix.toLowerCase() } },
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
  return {
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
  return picked.flatMap((id) => {
    const r = byId.get(id);
    return r ? [toCard(r)] : [];
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
