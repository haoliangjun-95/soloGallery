/**
 * 年度归档页纯函数层（功能 16）：某年的轻量照片行 → 按月分节的归档结构，
 * 每月收藏优先取前 perMonth 张。分组/排序/截断逻辑收敛在这里（vitest 可测），
 * queries 侧只负责取数（yearBounds + displayMonthKey）与 thumbUrl 映射。
 *
 * 与 listPhotosCalendar 的分工：日历视图要全量（每月封面+计数），归档只要
 * 每月精选 top-N——排序语义也不同（日历月倒序取最新，归档月升序像翻相册）。
 */

/** 归档输入行：DB 轻量 select 映射后的最小结构（monthKey 为展示时区 YYYY-MM） */
export interface ArchiveSourcePhoto {
  sha1: string;
  title: string;
  thumbUrl: string;
  favorite: boolean;
  /** displayMonthKey(shotAt) 产物；入参约定已按 shotAt 倒序（类内保序依赖它） */
  monthKey: string;
}

/** 归档输出照片：剥离 monthKey 的 DTO（页面按节已知月份） */
export interface ArchivePhoto {
  sha1: string;
  title: string;
  thumbUrl: string;
  favorite: boolean;
}

export interface ArchiveMonth {
  ym: string;
  year: number;
  month: number;
  /** 该月照片总数（含未入选的）——UI「共 X 张」+ 链到 /?month= 全量 */
  total: number;
  /** 收藏优先精选，至多 perMonth 张；favorite 类内保持输入序（shotAt 倒序） */
  photos: ArchivePhoto[];
}

/** 每月精选张数（4 列 × 2 行） */
export const ARCHIVE_PER_MONTH = 8;

/**
 * 构建单年归档。月份升序（1→12 月）；只出现有照片的月份（不生成空占位）；
 * 非本年 monthKey 的行排除（纵深防御——取数侧 yearBounds 已保证，但纯函数
 * 不依赖调用方守约）。入参不被触碰；photos 为新对象。
 */
export function buildArchiveYear(
  rows: readonly ArchiveSourcePhoto[],
  year: number,
  perMonth: number = ARCHIVE_PER_MONTH,
): ArchiveMonth[] {
  const prefix = `${year}-`;
  const byMonth = new Map<string, ArchiveSourcePhoto[]>();
  for (const r of rows) {
    if (!r.monthKey.startsWith(prefix)) continue;
    const bucket = byMonth.get(r.monthKey);
    if (bucket) bucket.push(r);
    else byMonth.set(r.monthKey, [r]);
  }
  // ym 为零填充 YYYY-MM，字符串序即时间序
  return [...byMonth.entries()]
    .sort(([a], [b]) => (a < b ? -1 : 1))
    .map(([ym, members]) => ({
      ym,
      year,
      month: Number(ym.slice(5, 7)),
      total: members.length,
      // Array.sort 稳定性由 ES2019 规范保证：favorite 类内维持输入序（shotAt 倒序）
      photos: [...members]
        .sort((a, b) => Number(b.favorite) - Number(a.favorite))
        .slice(0, perMonth)
        .map(({ sha1, title, thumbUrl, favorite }) => ({ sha1, title, thumbUrl, favorite })),
    }));
}
