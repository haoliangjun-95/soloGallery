/**
 * 按器材浏览（功能 3）纯函数层：URL 参数解析、Prisma Json 筛选片段、
 * 器材聚合行 → 侧栏列表构建。queries.ts（服务端聚合）与首页/详情页/API
 * 的参数入口共用；不依赖 Prisma 与 server-only，vitest 可直测。
 */
import { formatCamera } from "./exif-format";

/** 器材筛选维度：make+model 组合定位一台相机，lens 对应 EXIF lensModel。 */
export interface GearFilter {
  make?: string;
  model?: string;
  lens?: string;
}

/** 侧栏相机条目。make/model 保留原值用于回写 URL 参数（label 不可靠反拆）。 */
export interface GearCamera {
  make?: string;
  model?: string;
  /** 展示名：formatCamera 去重 model 以 make 为前缀的常见写法（"Canon" + "Canon EOS R5"）。 */
  label: string;
  count: number;
}

/** 侧栏镜头条目。 */
export interface GearLens {
  lens: string;
  count: number;
}

export interface GearLists {
  cameras: GearCamera[];
  lenses: GearLens[];
}

/** 器材参数长度上限：真实 EXIF make/model/lensModel 远短于此，防超长垃圾串进查询与 URL。
 *  导出供 queries.listGear 聚合 SQL 同口径 LEFT 截断，保证侧栏标签与筛选参数一致。 */
export const GEAR_PARAM_MAX = 100;

/** searchParams → 器材筛选值：trim、空串视为未设、超长截断（与首页 q 同一防御姿态）。 */
export function parseGearParam(value: string | undefined): string | undefined {
  const v = value?.trim().slice(0, GEAR_PARAM_MAX);
  return v ? v : undefined;
}

/**
 * JSON_UNQUOTE(JSON_EXTRACT(...)) 的四种可能形态：
 * SQL NULL（键不存在）、JSON null 字面量（字符串 "null"）、空串、真实值。
 * 前三种一律视为"无器材信息"。
 *
 * 依赖注记（评审 L-1）：此处 trim 只作用于聚合展示/链接标签，而 gearWhere 的
 * equals 匹配的是**原始存储值**——两者一致的前提是写路径 extractExif→cleanString
 * 已在入库前 trim（exif.ts）。历史遗留的未 trim 行会出现「侧栏计数 > 0 但筛选
 * 列表为空」的错位（技术债清单有记录）；纯 equals 无法防御该形态，勿在展示侧
 * 单独"修复"造成两侧标签不一致。
 */
function cleanGearValue(value: string | null | undefined): string | undefined {
  const v = value?.trim();
  if (!v || v === "null") return undefined;
  return v;
}

/** 相机聚合原始行（$queryRaw 的 COUNT(*) 是 bigint）。 */
interface CameraRow {
  make: string | null;
  model: string | null;
  count: bigint;
}

/**
 * 聚合行 → 侧栏相机列表：make/model 全空的行丢弃（不设"无器材"入口），
 * count 降序、同数按展示名（排序在 JS 侧做，DB 只需粗排）。
 */
export function buildGearCameras(rows: CameraRow[]): GearCamera[] {
  const out: GearCamera[] = [];
  for (const r of rows) {
    const make = cleanGearValue(r.make);
    const model = cleanGearValue(r.model);
    const label = formatCamera(make, model);
    if (!label) continue;
    out.push({ ...(make ? { make } : {}), ...(model ? { model } : {}), label, count: Number(r.count) });
  }
  return out.sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));
}

/** 镜头聚合原始行。 */
interface LensRow {
  lens: string | null;
  count: bigint;
}

/** 聚合行 → 镜头列表：丢弃空与 JSON null，count 降序、同数按名称。 */
export function buildGearLenses(rows: LensRow[]): GearLens[] {
  const out: GearLens[] = [];
  for (const r of rows) {
    const lens = cleanGearValue(r.lens);
    if (!lens) continue;
    out.push({ lens, count: Number(r.count) });
  }
  return out.sort((a, b) => b.count - a.count || a.lens.localeCompare(b.lens));
}

/** 筛选片段返回类型：空筛选是空对象，spread 进 where 无副作用。 */
type GearWhereFragment =
  | { AND: Array<{ exif: { path: string; equals: string } }> }
  | Record<string, never>;

/**
 * 器材筛选 → Prisma where 片段（exif Json path 等值匹配，参数化查询无注入面）。
 * 所有维度收敛进单个 AND 数组、只占一个顶层键：与 buildListWhere 其余条件
 * （category/tag/shotAt/q/favorite）不冲突；相机双维度天然表达"同时命中"。
 */
export function gearWhere(gear: GearFilter): GearWhereFragment {
  const and: Array<{ exif: { path: string; equals: string } }> = [];
  if (gear.make) and.push({ exif: { path: "$.make", equals: gear.make } });
  if (gear.model) and.push({ exif: { path: "$.model", equals: gear.model } });
  if (gear.lens) and.push({ exif: { path: "$.lensModel", equals: gear.lens } });
  return and.length ? { AND: and } : {};
}
