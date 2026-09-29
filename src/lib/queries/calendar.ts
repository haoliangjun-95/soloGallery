import "server-only";
import { prisma } from "../db";
import { displayKey } from "../bucket-layout";
import { publicUrl } from "../config";
import { buildArchiveYear, type ArchiveMonth } from "../archive";
import {
  DISPLAY_UTC_OFFSET,
  displayMonthDay,
  displayMonthKey,
  monthDayBoundsInYear,
  yearBounds,
  type TimeBounds,
} from "../time";
import { listYears } from "./taxonomy";


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

