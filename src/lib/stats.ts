/**
 * 统计面板的纯展示逻辑（/stats）：字节格式化、柱状比例、标签云权重。
 * 数据聚合在 queries/stats.ts，本层只做确定性变换，vitest 直测。
 */

/** 字节数人性化：B → KB → MB → GB → TB，保留 1 位小数（整数不带 .0） */
export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  let value = bytes;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit++;
  }
  const text = unit === 0 || Number.isInteger(value) ? String(value) : value.toFixed(1);
  return `${text} ${units[unit]}`;
}

export interface TrendBar {
  year: number;
  count: number;
  /** 相对最大值的百分比（1-100），柱高的确定性来源；空输入返回空数组 */
  pct: number;
}

/** 年度趋势柱：相对最大计数归一为百分比，最小 4%（1 张的年份也有可见柱） */
export function yearTrendBars(years: { year: number; count: number }[]): TrendBar[] {
  if (years.length === 0) return [];
  const max = Math.max(...years.map((y) => y.count));
  return years
    .slice()
    .sort((a, b) => a.year - b.year)
    .map((y) => ({ year: y.year, count: y.count, pct: Math.max(4, Math.round((y.count / max) * 100)) }));
}

/** 横向占比条：相对自身的百分比（单项即满宽），count<=0 不应出现（调用方已过滤） */
export function barPercent(count: number, max: number): number {
  if (max <= 0 || count <= 0) return 0;
  return Math.max(2, Math.round((count / max) * 100));
}

/** 标签云字号档位：按计数在 [min,max] 区间的相对位置离散成 1-5 档。
 *  单一计数（min===max）落中档；档位是样式选择不是精确比例。 */
export function tagCloudLevel(count: number, min: number, max: number): 1 | 2 | 3 | 4 | 5 {
  if (max <= min) return 3;
  const t = (count - min) / (max - min);
  if (t <= 0.2) return 1;
  if (t <= 0.4) return 2;
  if (t <= 0.6) return 3;
  if (t <= 0.8) return 4;
  return 5;
}

/** 年份跨度文案："2020 – 2026"；缺任一端返回 null（不渲染该瓦片） */
export function formatYearSpan(earliest: Date | null, latest: Date | null): string | null {
  if (!earliest || !latest) return null;
  const a = earliest.getFullYear();
  const b = latest.getFullYear();
  if (a === b) return String(a);
  return `${Math.min(a, b)} – ${Math.max(a, b)}`;
}
