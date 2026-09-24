import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { cache } from "react";
import BackOnEsc from "@/components/BackOnEsc";
import CommentSection from "@/components/CommentSection";
import ExifCard from "@/components/ExifCard";
import PhotoNav from "@/components/PhotoNav";
import ZoomableImage from "@/components/ZoomableImage";
import { isAdmin } from "@/lib/auth";
import { siteUrl } from "@/lib/config";
import { prisma } from "@/lib/db";
import { formatAperture, formatCamera, formatExposure, formatShotDate } from "@/lib/exif-format";
import { photoHref, type PhotoContext } from "@/lib/filter-url";
import { getAdjacentPhotos, getPhotoDetail } from "@/lib/queries";
import { getSettings } from "@/lib/settings";
import type { PhotoDetailDTO } from "@/lib/types";

export const dynamic = "force-dynamic";

interface Props extends PageProps<"/photo/[sha1]"> {
  searchParams: Promise<{
    category?: string;
    tag?: string;
    year?: string;
    q?: string;
    fav?: string;
    month?: string;
  }>;
}

const SHA1_KEY_RE = /^[a-f0-9]{6,40}$/;

/** 可见性解析：generateMetadata 与页面主体共用，React cache 保证同一请求只查一次。 */
const resolvePhoto = cache(async (key: string) => {
  const row = await prisma.photo.findFirst({
    where: { OR: [{ sha1: key }, { sha1: { startsWith: key } }] },
    select: { id: true, published: true, missing: true },
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
  if (photo.description) return photo.description.slice(0, 200);
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

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { sha1 } = await params;
  const key = decodeURIComponent(sha1).toLowerCase();
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
          width: photo.width ?? undefined,
          height: photo.height ?? undefined,
          alt: photo.title,
        },
      ],
    },
    twitter: { card: "summary_large_image" },
  };
}

export default async function PhotoPage({ params, searchParams }: Props) {
  const { sha1 } = await params;
  const key = decodeURIComponent(sha1).toLowerCase();
  if (!SHA1_KEY_RE.test(key)) notFound();

  const resolved = await resolvePhoto(key);
  if (!resolved) notFound();
  const { row, admin, photo } = resolved;

  // 筛选上下文透传：上一张/下一张沿来源列表的同一顺序（无参数时即全库默认列表序）
  const sp = await searchParams;
  const year = Number.isInteger(Number(sp.year)) && Number(sp.year) > 1970 ? Number(sp.year) : undefined;
  const q = sp.q?.trim().slice(0, 64) || undefined;
  const month = /^\d{4}-\d{2}$/.test(sp.month ?? "") ? sp.month : undefined;
  const favorite = sp.fav === "1";
  const navQuery: PhotoContext = { category: sp.category, tag: sp.tag, year, q, fav: favorite, month };

  const [settings, adjacent] = await Promise.all([
    getSettings(),
    getAdjacentPhotos(photo.sha1, { categorySlug: sp.category, tag: sp.tag, year, q, favorite, month }),
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
          {showOriginalEntry ? (
            <div className="mt-3 flex items-center justify-between text-sm">
              <a href={photo.originalUrl} target="_blank" rel="noreferrer" className="text-muted hover:text-foreground">
                ↓ 查看原图（{photo.fileName}）
              </a>
            </div>
          ) : null}
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
                  href={`/category/${photo.category.slug}`}
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
