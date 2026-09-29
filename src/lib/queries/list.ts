import "server-only";
import { cache } from "react";
import { buildGridSrcset, displayKey } from "../bucket-layout";
import { publicUrl } from "../config";
import { prisma } from "../db";
import { getSettings } from "../settings";
import { isAdmin } from "../auth";
import { gearWhere, parseGearParam } from "../gear";
import { monthBounds, yearBounds } from "../time";
import { hideGps } from "../geo";
import { reservoirSample } from "../sample";
import type { NormalizedExif } from "../exif";
import type { AdminPhotoDTO, CommentDTO, PhotoCardDTO, PhotoDetailDTO } from "../types";

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
export const canSeeGps = cache(async (): Promise<boolean> => {
  const { exposeGps } = await getSettings();
  return exposeGps === "true" || isAdmin();
});

/**
 * 公开 DTO 裁剪：expose=true 或无 gps 时原引用返回（零拷贝）；
 * 否则浅拷贝剔除 gps（hideGps 保证不可变）。收敛所有公开 exif 出口。
 */
export function applyGpsPolicy<P extends { exif: NormalizedExif | null }>(photo: P, expose: boolean): P {
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

