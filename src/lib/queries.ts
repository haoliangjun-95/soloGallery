import "server-only";
import { displayKey, originalKey } from "./bucket-layout";
import { publicUrl } from "./config";
import { prisma } from "./db";
import { getSettings } from "./settings";
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
  const where = {
    ...(options.publishedOnly === false ? {} : { published: true }),
    ...(options.includeMissing ? {} : { missing: false }),
    ...(options.categorySlug ? { category: { slug: options.categorySlug } } : {}),
    ...(options.tag ? { photoTags: { some: { tag: { name: options.tag } } } } : {}),
    ...(options.year
      ? {
          shotAt: {
            gte: new Date(options.year, 0, 1),
            lt: new Date(options.year + 1, 0, 1),
          },
        }
      : {}),
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

/** 管理端列表（含未发布/missing 状态标记）。 */
export async function listPhotosAdmin(options: ListOptions = {}): Promise<{
  items: AdminPhotoDTO[];
  total: number;
  page: number;
  pageSize: number;
}> {
  const settings = await getSettings();
  const page = Math.max(1, options.page ?? 1);
  const pageSize = Math.min(96, Math.max(1, options.pageSize ?? (Number(settings.pageSize) || 24)));
  const where = {
    ...(options.categorySlug ? { category: { slug: options.categorySlug } } : {}),
    ...(options.tag ? { photoTags: { some: { tag: { name: options.tag } } } } : {}),
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

/** 年份分组（按拍摄时间，仅公开图），倒序：[{year: 2026, count: 12}, ...]。 */
export async function listYears(): Promise<{ year: number; count: number }[]> {
  const rows = await prisma.$queryRaw<Array<{ year: number; count: bigint }>>`
    SELECT YEAR(shotAt) AS year, COUNT(*) AS count
    FROM Photo
    WHERE shotAt IS NOT NULL AND published = 1 AND missing = 0
    GROUP BY YEAR(shotAt)
    ORDER BY year DESC
  `;
  return rows.map((r) => ({ year: Number(r.year), count: Number(r.count) }));
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
