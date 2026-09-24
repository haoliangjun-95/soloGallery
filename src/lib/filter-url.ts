/**
 * 筛选 URL 构造纯函数：首页移动端 chips（叠加组合）与 Sidebar（互斥重置）
 * 两套语义的唯一出处，替代此前 page.tsx 与 Sidebar.tsx 各自内联的重复实现。
 *
 * 固定规则（与历史行为逐条对齐）：
 * - 参数按 category,tag,year,q,fav,view 的规范顺序序列化；
 * - fav 仅当值恰为 "1" 时输出（其余值视为未收藏）；
 * - keep 模式下 current.view === "calendar" 不透传（日历是月份文件夹特殊视图，
 *   任何筛选操作即退出）；显式 patch.view 优先；
 * - 空串与 null/undefined 一律不输出；
 * - month 不参与构造（单月视图链接由日历/月份入口直接生成）。
 */

export type FilterKey = "category" | "tag" | "year" | "q" | "fav" | "view";

/** 当前 URL 中的筛选状态（值来自 searchParams，均为原始字符串）。 */
export type FilterValues = Readonly<Partial<Record<FilterKey, string | undefined>>>;

/** 变更集：string=设定新值；null/undefined=显式清除；键缺席=按 unset 策略处理。 */
export type FilterPatch = Readonly<Partial<Record<FilterKey, string | null | undefined>>>;

export interface BuildFilterUrlOptions {
  /**
   * patch 未提及维度的处理策略：
   * - "clear"（默认）：全部清空 —— Sidebar 互斥导航语义；
   * - "keep"：保留 current 值 —— 移动端 chips 叠加组合语义。
   */
  unset?: "clear" | "keep";
}

const FILTER_KEYS: readonly FilterKey[] = ["category", "tag", "year", "q", "fav", "view"];

/** 构造首页筛选链接；无有效参数时返回 "/"。 */
export function buildFilterUrl(
  current: FilterValues = {},
  patch: FilterPatch = {},
  options: BuildFilterUrlOptions = {},
): string {
  const unset = options.unset ?? "clear";
  const params = new URLSearchParams();
  for (const key of FILTER_KEYS) {
    const explicit = key in patch;
    const value = explicit ? patch[key] : unset === "keep" ? current[key] : undefined;
    if (value === null || value === undefined || value === "") continue;
    if (key === "fav") {
      if (value === "1") params.set("fav", "1");
      continue;
    }
    if (key === "view") {
      if (!explicit && value === "calendar") continue;
      params.set("view", value);
      continue;
    }
    params.set(key, value);
  }
  const s = params.toString();
  return s ? `/?${s}` : "/";
}
