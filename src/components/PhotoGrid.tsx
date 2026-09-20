"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  formatAperture,
  formatCamera,
  formatDimensions,
  formatExposure,
  formatFileSize,
  formatShotDateShort,
  formatShotYear,
} from "@/lib/exif-format";
import { formatGps, gpsLabel } from "@/lib/geo";
import type { PhotoCardDTO } from "@/lib/types";

interface Props {
  initialItems: PhotoCardDTO[];
  total: number;
  pageSize: number;
  query?: { category?: string; tag?: string; year?: number; q?: string };
}

export default function PhotoGrid({ initialItems, total, pageSize, query }: Props) {
  const [items, setItems] = useState(initialItems);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(initialItems.length >= total);
  const sentinelRef = useRef<HTMLDivElement>(null);

  // initialItems 变化时的重置由父组件通过 key 重挂载实现（见各页面），
  // 避免 effect 内同步 setState 的级联渲染反模式。

  const loadMore = useCallback(async () => {
    if (loading || done) return;
    setLoading(true);
    try {
      const next = page + 1;
      const params = new URLSearchParams({ page: String(next) });
      if (query?.category) params.set("category", query.category);
      if (query?.tag) params.set("tag", query.tag);
      if (query?.year) params.set("year", String(query.year));
      if (query?.q) params.set("q", query.q);
      const res = await fetch(`/api/photos?${params.toString()}`);
      if (!res.ok) throw new Error("加载失败");
      const data = (await res.json()) as { items: PhotoCardDTO[]; total: number };
      setItems((prev) => {
        const seen = new Set(prev.map((i) => i.sha1));
        return [...prev, ...data.items.filter((i) => !seen.has(i.sha1))];
      });
      setPage(next);
      setDone(next * pageSize >= data.total || data.items.length === 0);
    } catch {
      /* 网络抖动：下次滚动重试 */
    } finally {
      setLoading(false);
    }
  }, [loading, done, page, pageSize, query]);

  useEffect(() => {
    const el = sentinelRef.current;
    if (!el) return;
    const io = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) void loadMore();
      },
      { rootMargin: "600px" },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [loadMore]);

  if (!items.length) {
    return (
      <div className="py-24 text-center text-muted">
        还没有图片 —— 去后台「从桶同步」或上传一些吧
      </div>
    );
  }

  return (
    <div>
      <div className="columns-2 sm:columns-3 lg:columns-4 gap-3 [column-fill:_balance]">
        {items.map((photo) => (
          <PhotoCard key={photo.sha1} photo={photo} />
        ))}
      </div>

      <div ref={sentinelRef} className="h-10" />
      <div className="text-center text-xs text-muted pb-8">
        {done ? `共 ${total} 张` : loading ? "加载中…" : ""}
      </div>
    </div>
  );
}

/** 单张卡片：图 + 收藏星标 + 标题/分类/标签/拍摄信息（参考用户给的样图布局）。 */
function PhotoCard({ photo }: { photo: PhotoCardDTO }) {
  const exif = photo.exif;
  const meta: { icon: React.ReactNode; text: string; title?: string }[] = [];

  const date = formatShotDateShort(photo.shotAt ?? exif?.shotAt);
  if (date) meta.push({ icon: <IconCalendar />, text: date });

  const cameraBits = [
    formatCamera(exif?.make, exif?.model),
    exif?.iso !== undefined ? `ISO ${exif.iso}` : null,
    formatExposure(exif?.exposureTime),
  ].filter(Boolean);
  if (cameraBits.length) meta.push({ icon: <IconCamera />, text: cameraBits.join(", ") });

  const lensBits = [
    exif?.lensModel,
    exif?.focalLength !== undefined ? `${Math.round(exif.focalLength)}mm` : null,
    formatAperture(exif?.fNumber),
  ].filter(Boolean);
  if (lensBits.length) meta.push({ icon: <IconLens />, text: lensBits.join(", ") });

  const fileBits = [
    photo.format,
    formatDimensions(photo.width ?? undefined, photo.height ?? undefined),
    photo.fileSize ? formatFileSize(photo.fileSize) : null,
  ].filter(Boolean);
  if (fileBits.length) meta.push({ icon: <IconImage />, text: fileBits.join(", ") });

  if (photo.fileName) {
    if (exif?.gps) {
      // 文件名行左侧带地名与年份：📍 贵阳 / 南明区 / 2026 · 1C9A8682.jpg
      const year = formatShotYear(photo.shotAt ?? exif.shotAt);
      meta.push({
        icon: <IconPin />,
        text: [gpsLabel(exif.gps), year].filter(Boolean).join(" / ") + " · " + photo.fileName,
        title: formatGps(exif.gps),
      });
    } else {
      meta.push({ icon: <IconFile />, text: photo.fileName });
    }
  }

  return (
    <div className="mb-3 break-inside-avoid rounded-xl overflow-hidden bg-card border border-edge transition-transform hover:-translate-y-0.5">
      <div className="relative">
        <Link href={`/photo/${photo.sha1}`} className="block">
          {/* 图片为 MinIO 公共读 WebP 变体，无需走 next/image 优化代理 */}
          <img
            src={photo.thumbUrl}
            alt={photo.title}
            width={photo.width ?? undefined}
            height={photo.height ?? undefined}
            loading="lazy"
            decoding="async"
            className="w-full h-auto block"
          />
        </Link>
        {photo.favorite ? (
          <span className="absolute left-2 bottom-2 text-amber-400 drop-shadow-[0_1px_2px_rgba(0,0,0,.8)]" title="收藏">
            ★
          </span>
        ) : null}
      </div>

      <div className="p-3">
        <Link
          href={`/photo/${photo.sha1}`}
          className="block text-sm font-medium truncate hover:underline"
          title={photo.title}
        >
          {photo.title}
        </Link>

        {photo.category || photo.tags.length > 0 ? (
          <div className="mt-1.5 flex flex-wrap gap-1">
            {photo.category ? (
              <Link
                href={`/category/${photo.category.slug}`}
                className="rounded border border-edge px-1.5 py-0.5 text-[11px] text-muted hover:text-foreground"
              >
                {photo.category.name}
              </Link>
            ) : null}
            {photo.tags.map((t) => (
              <Link
                key={t}
                href={`/tag/${encodeURIComponent(t)}`}
                className="rounded border border-edge px-1.5 py-0.5 text-[11px] text-muted hover:text-foreground"
              >
                #{t}
              </Link>
            ))}
          </div>
        ) : null}

        {meta.length > 0 ? (
          <ul className="mt-2 space-y-1">
            {meta.map((row, i) => (
              <li key={i} className="flex items-start gap-1.5 text-xs text-muted min-w-0">
                <span className="shrink-0 mt-[2px] opacity-70">{row.icon}</span>
                <span className="truncate" title={row.title ?? row.text}>
                  {row.text}
                </span>
              </li>
            ))}
          </ul>
        ) : null}
      </div>
    </div>
  );
}

function IconPin() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0z" />
      <circle cx="12" cy="10" r="3" />
    </svg>
  );
}

function IconCalendar() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <rect x="3" y="4" width="18" height="18" rx="2" />
      <path d="M16 2v4M8 2v4M3 10h18" />
    </svg>
  );
}

function IconCamera() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3l-2.5-3z" />
      <circle cx="12" cy="13" r="3" />
    </svg>
  );
}

function IconLens() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <circle cx="12" cy="12" r="10" />
      <circle cx="12" cy="12" r="4" />
    </svg>
  );
}

function IconImage() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <rect x="3" y="3" width="18" height="18" rx="2" />
      <circle cx="9" cy="9" r="2" />
      <path d="m21 15-3.1-3.1a2 2 0 0 0-2.8 0L6 21" />
    </svg>
  );
}

function IconFile() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <path d="M14 2v6h6" />
    </svg>
  );
}
