import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { cache } from "react";
import BackOnEsc from "@/components/BackOnEsc";
import CommentSection from "@/components/CommentSection";
import ExifCard from "@/components/ExifCard";
import PhotoNav from "@/components/PhotoNav";
import SlideshowButton from "@/components/slideshow/SlideshowButton";
import ZoomableImage from "@/components/ZoomableImage";
import { isAdmin } from "@/lib/auth";
import { DISPLAY_WIDTH } from "@/lib/bucket-layout";
import { siteUrl } from "@/lib/config";
import { prisma } from "@/lib/db";
import { formatAperture, formatCamera, formatExposure, formatShotDate } from "@/lib/exif-format";
import { firstParam, parseYear, photoHref, type PhotoContext } from "@/lib/filter-url";
import { parseGearParam } from "@/lib/gear";
import { getAdjacentPhotos, getPhotoDetail } from "@/lib/queries";
import { getSettings } from "@/lib/settings";
import type { PhotoDetailDTO } from "@/lib/types";

export const dynamic = "force-dynamic";

interface Props extends PageProps<"/photo/[sha1]"> {
  /** 重复参数（?q=a&q=b）运行时是数组——类型如实声明，入口经 firstParam 归一 */
  searchParams: Promise<{
    category?: string | string[];
    tag?: string | string[];
    year?: string | string[];
    q?: string | string[];
    fav?: string | string[];
    month?: string | string[];
    make?: string | string[];
    model?: string | string[];
    lens?: string | string[];
  }>;
}

const SHA1_KEY_RE = /^[a-f0-9]{6,40}$/;
/** meta description 长度上限（社交平台摘要惯例值） */
const META_DESC_MAX = 200;

/** 可见性解析：generateMetadata 与页面主体共用，React cache 保证同一请求只查一次。 */
const resolvePhoto = cache(async (key: string) => {
  const row = await prisma.photo.findFirst({
    where: { OR: [{ sha1: key }, { sha1: { startsWith: key } }] },
    select: { id: true, published: true, missing: true },
    // 短前缀碰撞（6 位前缀在万张量级下可能撞车）时取最早入库的一条，跨请求选择确定
    orderBy: { id: "asc" },
  });
  if (!row) return null;
  const admin = await isAdmin();
  if ((!row.published || row.missing) && !admin) return null;
  const photo = await getPhotoDetail(key);
  if (!photo) return null;
  return { row, admin, photo };
});

/** meta description：手工描述优先，否则拼 EXIF 摘要（器材 · 参数 · 拍摄时间）。 */
function metaDescription(photo: PhotoDetailDTO): string | undefined {
  // Array.from 按码点截断，避免 slice 切断 emoji 代理对产生乱码
  if (photo.description) return Array.from(photo.description).slice(0, META_DESC_MAX).join("");
  const exif = photo.exif;
  if (!exif) return undefined;
  const parts = [
    formatCamera(exif.make, exif.model),
    exif.focalLength ? `${Math.round(exif.focalLength)}mm` : null,
    formatAperture(exif.fNumber),
    formatExposure(exif.exposureTime),
    exif.iso ? `ISO ${exif.iso}` : null,
    formatShotDate(exif.shotAt ?? photo.shotAt ?? undefined),
  ].filter((v): v is string => Boolean(v));
  return parts.length ? parts.join(" · ") : undefined;
}

/** displayUrl 是 DISPLAY_WIDTH 上限的缩小 WebP 变体：OG 尺寸按同比折算，声明原图尺寸会让纵横比失真。 */
function ogDimensions(width: number | null, height: number | null): { width: number; height: number } | undefined {
  if (!width || !height || width <= 0 || height <= 0) return undefined;
  if (width <= DISPLAY_WIDTH) return { width, height };
  return { width: DISPLAY_WIDTH, height: Math.max(1, Math.round((height * DISPLAY_WIDTH) / width)) };
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { sha1 } = await params;
  const key = sha1.toLowerCase(); // params 已由 Next 路由层解码；纯 hex 无需 decode，%zz 序列交 SHA1_KEY_RE 兜底（评审 L-8）
  if (!SHA1_KEY_RE.test(key)) return {};
  const resolved = await resolvePhoto(key);
  // 不可见照片（未发布/缺失且非管理员）不输出任何元数据——分享卡片不泄露其标题与图像
  if (!resolved) return {};
  const { photo } = resolved;
  const url = `${siteUrl()}/photo/${photo.sha1}`;
  const description = metaDescription(photo);
  return {
    title: photo.title, // 根布局 template 自动拼接为「标题 · soloGallery」
    description,
    alternates: { canonical: url },
    openGraph: {
      type: "article",
      url,
      title: photo.title,
      description,
      images: [
        {
          url: photo.displayUrl, // MinIO 公共读绝对地址，社交平台可直接抓取
          ...ogDimensions(photo.width, photo.height),
          alt: photo.title,
        },
      ],
    },
    twitter: { card: "summary_large_image" },
  };
}

export default async function PhotoPage({ params, searchParams }: Props) {
  const { sha1 } = await params;
  const key = sha1.toLowerCase(); // params 已由 Next 路由层解码；纯 hex 无需 decode，%zz 序列交 SHA1_KEY_RE 兜底（评审 L-8）
  if (!SHA1_KEY_RE.test(key)) notFound();

  const resolved = await resolvePhoto(key);
  if (!resolved) notFound();
  const { row, admin, photo } = resolved;

  // 筛选上下文透传：上一张/下一张沿来源列表的同一顺序（无参数时即全库默认列表序）。
  // 重复参数运行时是数组，统一 firstParam 归一后再做业务校验（与首页同一套解析）
  const sp = await searchParams;
  const category = firstParam(sp.category);
  const tag = firstParam(sp.tag);
  const year = parseYear(firstParam(sp.year));
  const qRaw = firstParam(sp.q);
  const q = qRaw?.trim().slice(0, 64) || undefined;
  const monthRaw = firstParam(sp.month);
  const month = /^\d{4}-\d{2}$/.test(monthRaw ?? "") ? monthRaw : undefined;
  const favorite = firstParam(sp.fav) === "1";
  // 器材筛选透传（功能 3）：相邻导航沿器材过滤后的同一列表序
  const make = parseGearParam(firstParam(sp.make));
  const model = parseGearParam(firstParam(sp.model));
  const lens = parseGearParam(firstParam(sp.lens));
  const navQuery: PhotoContext = { category, tag, year, q, fav: favorite, make, model, lens, month };

  const [settings, adjacent] = await Promise.all([
    getSettings(),
    getAdjacentPhotos(photo.sha1, { categorySlug: category, tag, year, q, favorite, month, make, model, lens }),
  ]);
  const originalView = settings.originalView === "true";
  // HEIC 原图浏览器无法渲染，开启查看原图时也回退 display WebP（下载入口仍给原文件）
  const zoomSrc =
    originalView && photo.format !== "HEIC" ? `${photo.originalUrl}?inline=1` : photo.displayUrl;
  const showOriginalEntry = originalView || admin;

  return (
    <div className="w-full max-w-[1900px] mx-auto px-4 py-6 lg:px-6">
      <BackOnEsc />
      {admin && !row.published ? (
        <div className="mb-4 rounded-lg border border-amber-500/40 bg-amber-500/10 px-4 py-2 text-sm text-amber-300">
          该图片{row.missing ? "源已缺失且" : ""}未发布，仅管理员可见 ·{" "}
          <Link href="/admin/photos" className="underline">
            去管理
          </Link>
        </div>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_380px] xl:grid-cols-[minmax(0,1fr)_420px] items-start">
        <div className="relative">
          <PhotoNav
            prev={adjacent.prev ? { href: photoHref(adjacent.prev.sha1, navQuery), title: adjacent.prev.title } : null}
            next={adjacent.next ? { href: photoHref(adjacent.next.sha1, navQuery), title: adjacent.next.title } : null}
          />
          <ZoomableImage src={zoomSrc} alt={photo.title} width={photo.width} height={photo.height} />
          <div className="mt-3 flex flex-wrap items-center justify-between gap-3 text-sm">
            {/* 功能 4：幻灯片入口——播放列表与 ←/→ 相邻导航同一列表序（navQuery 上下文透传）；
                放映用 display WebP 变体而非 zoomSrc（originalView 开启时那是原图直链，HEIC 浏览器无法渲染） */}
            <SlideshowButton
              initial={{ sha1: photo.sha1, title: photo.title, displayUrl: photo.displayUrl }}
              context={navQuery}
            />
            {showOriginalEntry ? (
              <a href={photo.originalUrl} target="_blank" rel="noreferrer" className="text-muted hover:text-foreground">
                ↓ 查看原图（{photo.fileName}）
              </a>
            ) : null}
          </div>
        </div>

        <div className="space-y-5 lg:sticky lg:top-20">
          <div>
            <h1 className="text-xl font-semibold break-words">{photo.title}</h1>
            {photo.description ? (
              <p className="mt-2 text-sm text-foreground/80 whitespace-pre-wrap break-words">
                {photo.description}
              </p>
            ) : null}
            <div className="mt-3 flex flex-wrap gap-2 text-sm">
              {photo.category ? (
                <Link
                  href={`/category/${encodeURIComponent(photo.category.slug)}`}
                  className="rounded-full border border-edge px-3 py-1 text-muted hover:text-foreground"
                >
                  {photo.category.name}
                </Link>
              ) : null}
              {photo.tags.map((t) => (
                <Link
                  key={t}
                  href={`/tag/${encodeURIComponent(t)}`}
                  className="rounded-full border border-edge px-3 py-1 text-muted hover:text-foreground"
                >
                  #{t}
                </Link>
              ))}
            </div>
          </div>

          <ExifCard
            exif={photo.exif}
            format={photo.format}
            width={photo.width}
            height={photo.height}
            fileSize={photo.fileSize}
            fileName={photo.fileName}
          />

          <CommentSection photoId={photo.id} initialComments={photo.comments} />
        </div>
      </div>
    </div>
  );
}
