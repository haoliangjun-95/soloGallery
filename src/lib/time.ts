/**
 * 展示时区与时间边界 —— 前后台共用同一来源。
 *
 * 照片按 Asia/Shanghai（东八区，无夏令时）展示；Prisma 入库为 UTC。
 * 所有「某年 / 某月」的边界换算必须基于展示时区，否则跨零点、跨月、跨年
 * 的照片会在筛选与日历分组之间出现归属不一致。
 */

/** 展示时区（Intl.DateTimeFormat 的 timeZone 用） */
export const DISPLAY_TZ = "Asia/Shanghai";

/** 展示时区对应的固定 UTC 偏移：构造 Date 边界与 SQL CONVERT_TZ 用 */
export const DISPLAY_UTC_OFFSET = "+08:00";

export interface TimeBounds {
  /** 起始（含）：>= gte */
  gte: Date;
  /** 结束（不含）：< lt */
  lt: Date;
}

/** 展示时区某年的边界：[当年 1 月 1 日 00:00, 次年 1 月 1 日 00:00) */
export function yearBounds(year: number): TimeBounds {
  return {
    gte: new Date(`${year}-01-01T00:00:00${DISPLAY_UTC_OFFSET}`),
    lt: new Date(`${year + 1}-01-01T00:00:00${DISPLAY_UTC_OFFSET}`),
  };
}

/** 展示时区某月（"YYYY-MM"）的边界：[当月 1 日 00:00, 次月 1 日 00:00)；格式非法或月份越界返回 null */
export function monthBounds(ym: string): TimeBounds | null {
  const m = /^(\d{4})-(\d{2})$/.exec(ym);
  if (!m) return null;
  const year = Number(m[1]);
  const month = Number(m[2]);
  if (month < 1 || month > 12) return null;
  const nextYear = month === 12 ? year + 1 : year;
  const nextMonth = String(month === 12 ? 1 : month + 1).padStart(2, "0");
  return {
    gte: new Date(`${year}-${m[2]}-01T00:00:00${DISPLAY_UTC_OFFSET}`),
    lt: new Date(`${nextYear}-${nextMonth}-01T00:00:00${DISPLAY_UTC_OFFSET}`),
  };
}

// Intl 格式化器构造较重，模块级复用
let monthFormatter: Intl.DateTimeFormat | null = null;

/** Date → 展示时区的 "YYYY-MM"（en-CA 输出即为 YYYY-MM，斜杠替换兜底） */
export function displayMonthKey(date: Date): string {
  monthFormatter ??= new Intl.DateTimeFormat("en-CA", {
    timeZone: DISPLAY_TZ,
    year: "numeric",
    month: "2-digit",
  });
  return monthFormatter.format(date).replaceAll("/", "-");
}
