import Link from "next/link";
import { notFound } from "next/navigation";
import CommentSection from "@/components/CommentSection";
import ExifCard from "@/components/ExifCard";
import ZoomableImage from "@/components/ZoomableImage";
import { isAdmin } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { getPhotoDetail } from "@/lib/queries";
import { getSettings } from "@/lib/settings";

export const dynamic = "force-dynamic";

export default async function PhotoPage({ params }: PageProps<"/photo/[sha1]">) {
  const { sha1 } = await params;
  const key = decodeURIComponent(sha1).toLowerCase();
  if (!/^[a-f0-9]{6,40}$/.test(key)) notFound();

  const row = await prisma.photo.findFirst({
    where: { OR: [{ sha1: key }, { sha1: { startsWith: key } }] },
    select: { id: true, published: true, missing: true },
  });
  if (!row) notFound();
  const admin = await isAdmin();
  if ((!row.published || row.missing) && !admin) notFound();

  const photo = await getPhotoDetail(key);
  if (!photo) notFound();

  const settings = await getSettings();
  const originalView = settings.originalView === "true";
  // HEIC 原图浏览器无法渲染，开启查看原图时也回退 display WebP（下载入口仍给原文件）
  const zoomSrc =
    originalView && photo.format !== "HEIC" ? `${photo.originalUrl}?inline=1` : photo.displayUrl;
  const showOriginalEntry = originalView || admin;

  return (
    <div className="max-w-7xl mx-auto px-4 py-6">
      {admin && !row.published ? (
        <div className="mb-4 rounded-lg border border-amber-500/40 bg-amber-500/10 px-4 py-2 text-sm text-amber-300">
          该图片{row.missing ? "源已缺失且" : ""}未发布，仅管理员可见 ·{" "}
          <Link href="/admin/photos" className="underline">
            去管理
          </Link>
        </div>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_380px] items-start">
        <div>
          <ZoomableImage src={zoomSrc} alt={photo.title} />
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
