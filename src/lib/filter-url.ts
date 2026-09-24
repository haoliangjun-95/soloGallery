/**
 * 筛选 URL 构造纯函数：首页移动端 chips（叠加组合）与 Sidebar（互斥重置）
 * 两套语义的唯一出处，替代此前 page.tsx 与 Sidebar.tsx 各自内联的重复实现。
 *
 * 固定规则（与历史行为逐条对齐）：
 * - 参数按 category,tag,year,q,fav,make,model,lens,view 的规范顺序序列化；
 * - fav 仅当值恰为 "1" 时输出（其余值视为未收藏）；
 * - keep 模式下 current.view === "calendar" 不透传（日历是月份文件夹特殊视图，
 *   任何筛选操作即退出）；显式 patch.view 优先；
 * - 空串与 null/undefined 一律不输出；
 * - month 不参与构造（单月视图链接由日历/月份入口直接生成）。
 */

export type FilterKey = "category" | "tag" | "year" | "q" | "fav" | "make" | "model" | "lens" | "view";

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

const FILTER_KEYS: readonly FilterKey[] = ["category", "tag", "year", "q", "fav", "make", "model", "lens", "view"];

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

/**
 * 详情页链接携带的筛选上下文（列表页透传，用于"上一张/下一张"在同一列表序中取相邻照片）。
 * 与首页 searchParams 维度一致，但不含 view（布局不影响顺序）与 random（随机样本无稳定相邻关系）。
 */
export interface PhotoContext {
  category?: string;
  tag?: string;
  year?: number;
  q?: string;
  fav?: boolean;
  /** 器材筛选（功能 3）：相机双维度 + 镜头，列表→详情→相邻导航全程透传 */
  make?: string;
  model?: string;
  lens?: string;
  month?: string;
}

/**
 * 序列化 PhotoContext 为规范顺序（category,tag,year,q,fav,make,model,lens,month）的 URLSearchParams；
 * photoHref 与 PhotoGrid.loadMore 共用，参数词汇表的唯一出处。
 */
export function contextToParams(ctx: PhotoContext): URLSearchParams {
  const params = new URLSearchParams();
  if (ctx.category) params.set("category", ctx.category);
  if (ctx.tag) params.set("tag", ctx.tag);
  if (ctx.year) params.set("year", String(ctx.year));
  if (ctx.q) params.set("q", ctx.q);
  if (ctx.fav) params.set("fav", "1");
  if (ctx.make) params.set("make", ctx.make);
  if (ctx.model) params.set("model", ctx.model);
  if (ctx.lens) params.set("lens", ctx.lens);
  if (ctx.month) params.set("month", ctx.month);
  return params;
}

/**
 * 构造 /photo/{sha1} 链接，按规范顺序附加上下文参数；
 * 空值一律省略，fav 仅 true 时输出 "1"（与 buildFilterUrl 的 fav 语义对齐）。
 */
export function photoHref(sha1: string, ctx: PhotoContext = {}): string {
  const s = contextToParams(ctx).toString();
  return s ? `/photo/${sha1}?${s}` : `/photo/${sha1}`;
}

/**
 * searchParams 归一化：重复参数（?q=a&q=b）运行时是数组而非声明的 string，
 * 直接调用字符串方法会抛 TypeError。统一取首元素后再做业务校验。
 */
export function firstParam(value: string | string[] | undefined): string | undefined {
  if (Array.isArray(value)) return value[0];
  return value;
}

/** 年份下界（不含）：EXIF/胶片数字化之前的年份无意义，沿袭既有校验。 */
const YEAR_MIN_EXCLUSIVE = 1970;
/** 年份上界（含）：≥9999 时 yearBounds 构造的日期串是 Invalid Date，进 Prisma 即 500。 */
const YEAR_MAX_INCLUSIVE = 9998;

/**
 * 解析年份筛选参数：整数且 1971..9998，否则 undefined。
 * 首页 / 详情页 / /api/photos 三处同源，消除上界校验漂移。
 */
export function parseYear(value: string | undefined): number | undefined {
  const n = Number(value);
  if (!Number.isInteger(n)) return undefined;
  if (n <= YEAR_MIN_EXCLUSIVE || n > YEAR_MAX_INCLUSIVE) return undefined;
  return n;
}
