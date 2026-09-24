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
import { contextToParams, photoHref, type PhotoContext } from "@/lib/filter-url";
import { formatGps, gpsLabel } from "@/lib/geo";
import type { PhotoCardDTO } from "@/lib/types";

interface Props {
  initialItems: PhotoCardDTO[];
  total: number;
  pageSize: number;
  /** normal：瀑布+信息卡；square：正方形纯图；fixed：统一正方形卡片+信息卡（cover 裁切）；masonry：瀑布纯图；list：列表 */
  view?: "normal" | "square" | "fixed" | "masonry" | "list";
  /** 当前列表的筛选上下文：透传到详情页链接，使"上一张/下一张"沿同一列表序 */
  query?: PhotoContext;
}

/** 首屏图片 eager 预载数量：瀑布/固定卡片布局首屏全 lazy 会推迟 LCP、快速滚动时占位抖动 */
const EAGER_FIRST_SCREEN = 8;

/** srcset sizes 预算（功能 10）：按各视图 CSS 列布局推算，断点对齐列数跳变。
 *  宁可略高估——浏览器只会选大一档候选，不会糊。thumbSrcset 为 null（老照片
 *  未生成变体）时不输出 srcSet，浏览器沿用 src，sizes 被忽略。 */
/** 瀑布列（normal/masonry 共用）：columns-2 → sm:3 → xl:4 → 2xl:5 → min-2800:6 */
const SIZES_COLUMNS =
  "(min-width: 2800px) 17vw, (min-width: 1536px) 20vw, (min-width: 1280px) 25vw, (min-width: 640px) 33vw, 50vw";
/** 固定卡片（cover）：minmax(160px|40vw) → sm:230px → xl:290px，瓦片宽约 250-360px */
const SIZES_FIXED_CARD = "(min-width: 1280px) 25vw, (min-width: 640px) 33vw, 45vw";
/** 正方形纯图格：minmax(160px,1fr) auto-fill，瓦片宽恒 160-190px */
const SIZES_SQUARE = "190px";
/** 列表视图：h-10 w-16 固定 64px 宽小图 */
const SIZES_LIST = "64px";

export default function PhotoGrid({ initialItems, total, pageSize, view = "normal", query }: Props) {
  /** 详情链接统一附带当前筛选上下文——详情页"上一张/下一张"据此在同一列表序中取相邻 */
  const photoLink = (sha1: string) => photoHref(sha1, query ?? {});

  const [items, setItems] = useState(initialItems);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(initialItems.length >= total);
  /** 翻页加载失败：哨兵位置不变时 IO 不会重新触发，静默 catch 会卡死——置 error 态给显式重试入口 */
  const [error, setError] = useState(false);
  /** error 的 ref 镜像：IO 回调据此屏蔽错误态自动重发。若只靠 state，失败后 loading 翻转
   *  → loadMore 新身份 → observer 重挂 → 规范强制的初始回调 → 哨兵仍在视口 → 无限自动重试（评审 H-1） */
  const errorRef = useRef(false);
  /** 回到顶部按钮可见性：顶部哨兵滚出视口后显示 */
  const [showTop, setShowTop] = useState(false);
  const sentinelRef = useRef<HTMLDivElement>(null);
  const topSentinelRef = useRef<HTMLDivElement>(null);
  const hasItems = items.length > 0;

  // initialItems 变化时的重置由父组件通过 key 重挂载实现（见各页面），
  // 避免 effect 内同步 setState 的级联渲染反模式。

  const loadMore = useCallback(async () => {
    if (loading || done) return;
    setLoading(true);
    setError(false);
    try {
      const next = page + 1;
      // 与 photoHref 共用 contextToParams：参数词汇表单一出处，后续页与详情链接语义恒一致
      const params = contextToParams(query ?? {});
      params.set("page", String(next));
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
      // 不再静默：error 态渲染"加载失败，点击重试"；ref 镜像同步置位，
      // IO 自动重发被屏蔽——重试只能经显式按钮，杜绝失败→observer 重挂→自动重取的死循环（评审 H-1）
      errorRef.current = true;
      setError(true);
    } finally {
      setLoading(false);
    }
  }, [loading, done, page, pageSize, query]);

  useEffect(() => {
    const el = sentinelRef.current;
    if (!el) return;
    const io = new IntersectionObserver(
      (entries) => {
        // 错误态不触发：observer 重挂时的规范初始回调也会被 errorRef 挡住（评审 H-1）
        if (entries[0]?.isIntersecting && !errorRef.current) void loadMore();
      },
      { rootMargin: "600px" },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [loadMore]);

  // 回到顶部可见性：顶部哨兵（含 200px 缓冲）滚出视口才显示；
  // hasItems 作依赖——空列表提前返回路径不渲染哨兵，从空翻非空时需重挂 observer
  useEffect(() => {
    if (!hasItems) return;
    const el = topSentinelRef.current;
    if (!el) return;
    const io = new IntersectionObserver(
      (entries) => setShowTop(!entries[0]?.isIntersecting),
      { rootMargin: "200px 0px 0px 0px" },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [hasItems]);

  const scrollToTop = useCallback(() => {
    // globals.css 的 prefers-reduced-motion 降级只覆盖 CSS 动画，JS 平滑滚动需显式判断
    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    window.scrollTo({ top: 0, behavior: reduceMotion ? "auto" : "smooth" });
  }, []);

  if (!items.length) {
    return (
      <div className="py-24 text-center text-muted">
        还没有图片 —— 去后台「从桶同步」或上传一些吧
      </div>
    );
  }

  return (
    <div>
      <div ref={topSentinelRef} aria-hidden className="h-px" />
      {view === "square" ? (
        <div className="grid grid-cols-[repeat(auto-fill,minmax(160px,1fr))] gap-1 sm:gap-1.5">
          {items.map((photo) => (
            <Link
              key={photo.sha1}
              href={photoLink(photo.sha1)}
              className="group relative block aspect-square overflow-hidden bg-card"
              title={photo.title}
            >
              <img
                src={photo.thumbUrl}
                srcSet={photo.thumbSrcset ?? undefined}
                sizes={SIZES_SQUARE}
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
              href={photoLink(photo.sha1)}
              className="group relative mb-3 lg:mb-4 block break-inside-avoid overflow-hidden rounded-xl border border-edge focus-visible:-outline-offset-2"
            >
              <img
                src={photo.thumbUrl}
                srcSet={photo.thumbSrcset ?? undefined}
                sizes={SIZES_COLUMNS}
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
            <PhotoCard key={photo.sha1} photo={photo} href={photoLink(photo.sha1)} cover priority={idx < EAGER_FIRST_SCREEN} />
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
                href={photoLink(photo.sha1)}
                className="flex items-center gap-3 px-3 py-1.5 hover:bg-foreground/5 transition-colors"
              >
                <img
                  src={photo.thumbUrl}
                  srcSet={photo.thumbSrcset ?? undefined}
                  sizes={SIZES_LIST}
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
            <PhotoCard key={photo.sha1} photo={photo} href={photoLink(photo.sha1)} priority={idx < EAGER_FIRST_SCREEN} />
          ))}
        </div>
      )}

      <div ref={sentinelRef} className="h-10" />
      {error ? (
        <div className="pb-8 text-center">
          <button
            type="button"
            onClick={() => {
              // 显式重试：先解除 errorRef 屏蔽再重发，成功/失败都由 loadMore 内部状态机接管
              errorRef.current = false;
              void loadMore();
            }}
            className="min-h-11 rounded-full border border-amber-500/40 bg-amber-500/10 px-4 text-sm text-amber-300 transition-colors hover:bg-amber-500/20 focus-visible:outline-2 focus-visible:outline-[#f5b43c] focus-visible:outline-offset-2"
          >
            加载失败，点击重试
          </button>
        </div>
      ) : (
        <div className="text-center text-xs text-muted pb-8">
          {done ? `共 ${total} 张` : loading ? "加载中…" : ""}
        </div>
      )}
      {showTop ? (
        <div className="pb-8 text-center">
          <button
            type="button"
            onClick={scrollToTop}
            className="inline-flex min-h-11 items-center rounded-full border border-edge bg-background/70 px-4 text-sm text-muted backdrop-blur transition-colors hover:text-foreground focus-visible:outline-2 focus-visible:outline-[#f5b43c] focus-visible:outline-offset-2"
          >
            ↑ 回到顶部
          </button>
        </div>
      ) : null}
    </div>
  );
}

/** 单张卡片：图 + 收藏星标 + 标题/分类/标签/拍摄信息（参考用户给的样图布局）。
 *  cover=true 时图片固定正方形裁切铺满，用于固定宽高视图（PhotoPrism Cards 风格）。 */
function PhotoCard({ photo, href, cover, priority }: { photo: PhotoCardDTO; href: string; cover?: boolean; priority?: boolean }) {
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
        <Link href={href} className={`block focus-visible:-outline-offset-2${cover ? " h-full" : ""}`}>
          {/* 图片为 MinIO 公共读 WebP 变体，无需走 next/image 优化代理 */}
          <img
            src={photo.thumbUrl}
            srcSet={photo.thumbSrcset ?? undefined}
            sizes={cover ? SIZES_FIXED_CARD : SIZES_COLUMNS}
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
            href={href}
            className="min-w-0 line-clamp-2 break-words text-sm font-medium leading-5 hover:underline"
            title={photo.title}
          >
            {photo.title}
          </Link>

          {photo.category || photo.tags.length > 0 ? (
            <div className="mt-1.5 flex min-w-0 flex-wrap items-center gap-1">
              {[
                ...(photo.category
                  ? [{ href: `/category/${encodeURIComponent(photo.category.slug)}`, label: photo.category.name }]
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
                <Link href={href} aria-label={`查看照片详情，含其余 ${photo.tags.length + (photo.category ? 1 : 0) - 2} 个标签`} className="shrink-0 rounded px-1.5 py-0.5 text-xs text-muted hover:text-foreground">
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
