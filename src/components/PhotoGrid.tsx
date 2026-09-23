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
  /** normal：瀑布+信息卡；square：正方形纯图；fixed：统一正方形卡片+信息卡（cover 裁切）；masonry：瀑布纯图；list：列表 */
  view?: "normal" | "square" | "fixed" | "masonry" | "list";
  query?: { category?: string; tag?: string; year?: number; q?: string; fav?: boolean; month?: string };
}

/** 首屏图片 eager 预载数量：瀑布/固定卡片布局首屏全 lazy 会推迟 LCP、快速滚动时占位抖动 */
const EAGER_FIRST_SCREEN = 8;

export default function PhotoGrid({ initialItems, total, pageSize, view = "normal", query }: Props) {
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
      if (query?.fav) params.set("fav", "1");
      if (query?.month) params.set("month", query.month);
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
      {view === "square" ? (
        <div className="grid grid-cols-[repeat(auto-fill,minmax(160px,1fr))] gap-1 sm:gap-1.5">
          {items.map((photo) => (
            <Link
              key={photo.sha1}
              href={`/photo/${photo.sha1}`}
              className="group relative block aspect-square overflow-hidden bg-card"
              title={photo.title}
            >
              <img
                src={photo.thumbUrl}
                alt={photo.title}
                loading="lazy"
                decoding="async"
                className="h-full w-full object-cover transition-transform duration-200 group-hover:scale-105"
              />
              {photo.favorite ? (
                <span className="absolute left-1.5 bottom-1.5 text-amber-400 text-sm drop-shadow-[0_1px_2px_rgba(0,0,0,.8)]">
                  ★
                </span>
              ) : null}
            </Link>
          ))}
        </div>
      ) : view === "masonry" ? (
        <div className="columns-2 sm:columns-3 xl:columns-4 2xl:columns-5 min-[2800px]:columns-6 gap-3 lg:gap-4 [column-fill:_balance]">
          {items.map((photo, idx) => (
            <Link
              key={photo.sha1}
              href={`/photo/${photo.sha1}`}
              className="group relative mb-3 lg:mb-4 block break-inside-avoid overflow-hidden rounded-xl border border-edge focus-visible:-outline-offset-2"
            >
              <img
                src={photo.thumbUrl}
                alt={photo.title}
                width={photo.width ?? undefined}
                height={photo.height ?? undefined}
                loading={idx < EAGER_FIRST_SCREEN ? "eager" : "lazy"}
                fetchPriority={idx === 0 ? "high" : undefined}
                decoding="async"
                className="w-full h-auto block transition-transform duration-200 group-hover:scale-[1.02]"
              />
              {photo.favorite ? (
                <span className="absolute left-2 top-2 text-amber-400 drop-shadow-[0_1px_2px_rgba(0,0,0,.8)]">★</span>
              ) : null}
              <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 to-transparent px-3 py-2 opacity-100 transition-opacity [@media(hover:hover)_and_(pointer:fine)]:opacity-0 group-hover:opacity-100 group-focus-within:opacity-100">
                <p className="text-sm text-white truncate">{photo.title}</p>
              </div>
            </Link>
          ))}
        </div>
      ) : view === "fixed" ? (
        // 固定宽高（参考 PhotoPrism Cards 视图）：统一正方形图片区 + cover 居中裁切 + 图下信息卡；
        // auto-fill 自适应列数（手机 2 列 / 平板笔记本 3 列 / 大屏 5-6 列），间距 6px 对齐 PhotoPrism
        <div className="grid grid-cols-[repeat(auto-fill,minmax(min(160px,40vw),1fr))] sm:grid-cols-[repeat(auto-fill,minmax(230px,1fr))] xl:grid-cols-[repeat(auto-fill,minmax(290px,1fr))] gap-1.5 items-start">
          {items.map((photo, idx) => (
            <PhotoCard key={photo.sha1} photo={photo} cover priority={idx < EAGER_FIRST_SCREEN} />
          ))}
        </div>
      ) : view === "list" ? (
        <div className="divide-y divide-edge rounded-xl border border-edge bg-card overflow-hidden">
          {items.map((photo) => {
            const exif = photo.exif;
            const date = formatShotDateShort(photo.shotAt ?? exif?.shotAt);
            const camera = formatCamera(exif?.make, exif?.model);
            return (
              <Link
                key={photo.sha1}
                href={`/photo/${photo.sha1}`}
                className="flex items-center gap-3 px-3 py-1.5 hover:bg-foreground/5 transition-colors"
              >
                <img
                  src={photo.thumbUrl}
                  alt={photo.title}
                  loading="lazy"
                  decoding="async"
                  className="h-10 w-16 object-cover rounded shrink-0"
                />
                <div className="min-w-0 flex-1 flex items-baseline gap-3">
                  <p className="text-sm truncate shrink-0 max-w-[30%]">{photo.title}</p>
                  <p className="text-xs text-muted truncate flex-1">
                    {[date, camera].filter(Boolean).join(" · ")}
                  </p>
                  <p className="hidden md:block text-xs text-muted/70 truncate">{photo.fileName}</p>
                </div>
                {photo.category ? (
                  <span className="hidden sm:inline rounded border border-edge px-1.5 py-0.5 text-[11px] text-muted shrink-0">
                    {photo.category.name}
                  </span>
                ) : null}
                {photo.favorite ? <span className="text-amber-400 text-xs shrink-0">★</span> : null}
              </Link>
            );
          })}
        </div>
      ) : (
        <div className="columns-2 sm:columns-3 xl:columns-4 2xl:columns-5 min-[2800px]:columns-6 gap-3 lg:gap-4 [column-fill:_balance]">
          {items.map((photo, idx) => (
            <PhotoCard key={photo.sha1} photo={photo} priority={idx < EAGER_FIRST_SCREEN} />
          ))}
        </div>
      )}

      <div ref={sentinelRef} className="h-10" />
      <div className="text-center text-xs text-muted pb-8">
        {done ? `共 ${total} 张` : loading ? "加载中…" : ""}
      </div>
    </div>
  );
}

/** 单张卡片：图 + 收藏星标 + 标题/分类/标签/拍摄信息（参考用户给的样图布局）。
 *  cover=true 时图片固定正方形裁切铺满，用于固定宽高视图（PhotoPrism Cards 风格）。 */
function PhotoCard({ photo, cover, priority }: { photo: PhotoCardDTO; cover?: boolean; priority?: boolean }) {
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
    <div
      className={`rounded-xl overflow-hidden bg-card border border-edge transition-transform hover:-translate-y-0.5${
        cover ? " group" : " mb-3 break-inside-avoid"
      }`}
    >
      <div className={cover ? "relative aspect-square overflow-hidden bg-card" : "relative"}>
        <Link href={`/photo/${photo.sha1}`} className={`block focus-visible:-outline-offset-2${cover ? " h-full" : ""}`}>
          {/* 图片为 MinIO 公共读 WebP 变体，无需走 next/image 优化代理 */}
          <img
            src={photo.thumbUrl}
            alt={photo.title}
            width={cover ? undefined : (photo.width ?? undefined)}
            height={cover ? undefined : (photo.height ?? undefined)}
            loading={priority ? "eager" : "lazy"}
            decoding="async"
            className={
              cover
                ? "h-full w-full object-cover transition-transform duration-200 group-hover:scale-[1.03]"
                : "w-full h-auto block"
            }
          />
        </Link>
        {photo.favorite ? (
          <span className="absolute left-2 bottom-2 text-amber-400 drop-shadow-[0_1px_2px_rgba(0,0,0,.8)]" title="收藏">
            ★
          </span>
        ) : null}
      </div>

      <div className="p-2.5 sm:p-3">
        {/* 标题最多两行；标签独立排列，更多标签可进入详情查看。 */}
        <div className="min-w-0">
          <Link
            href={`/photo/${photo.sha1}`}
            className="min-w-0 line-clamp-2 break-words text-sm font-medium leading-5 hover:underline"
            title={photo.title}
          >
            {photo.title}
          </Link>

          {photo.category || photo.tags.length > 0 ? (
            <div className="mt-1.5 flex min-w-0 flex-wrap items-center gap-1">
              {[
                ...(photo.category
                  ? [{ href: `/category/${photo.category.slug}`, label: photo.category.name }]
                  : []),
                ...photo.tags.map((t) => ({ href: `/tag/${encodeURIComponent(t)}`, label: `#${t}` })),
              ]
                .slice(0, 2)
                .map((item) => (
                  <Link
                    key={item.href}
                    href={item.href}
                    title={item.label}
                    className="max-w-full truncate rounded border border-edge px-1.5 py-0.5 text-xs text-muted hover:text-foreground"
                  >
                    {item.label}
                  </Link>
                ))}
              {photo.tags.length + (photo.category ? 1 : 0) > 2 ? (
                <Link href={`/photo/${photo.sha1}`} aria-label={`查看照片详情，含其余 ${photo.tags.length + (photo.category ? 1 : 0) - 2} 个标签`} className="shrink-0 rounded px-1.5 py-0.5 text-xs text-muted hover:text-foreground">
                  +{photo.tags.length + (photo.category ? 1 : 0) - 2}
                </Link>
              ) : null}
            </div>
          ) : null}
        </div>

        {meta.length > 0 ? (
          <ul className="mt-2 space-y-1">
            {(cover ? meta.slice(0, 3) : meta).map((row, i) => (
              <li key={i} className={`min-w-0 items-start gap-1.5 text-xs text-muted ${cover && i > 0 ? "hidden sm:flex" : "flex"}`}>
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
