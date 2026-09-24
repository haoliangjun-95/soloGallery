"use client";

/**
 * 幻灯片放映入口 + 全屏放映器（功能 4）：详情页「▶ 幻灯片」胶囊按钮。
 * - 播放列表：点开时取当前筛选上下文第一页（/api/photos，contextToParams 与
 *   PhotoGrid.loadMore 同源），buildPlaylist 从当前照片截到页尾；播到末尾
 *   nextIndex 回卷循环（slideshow.ts 纯函数，vitest 直测）
 * - 过渡只动 opacity（globals.css .slideshow-fade；全局 prefers-reduced-motion
 *   块会把 animation-duration 压到 0.01ms，合成器友好，不碰布局属性）
 * - prefers-reduced-motion 用户打开时默认暂停（自动轮播即动效；WCAG 2.2.2
 *   要求可暂停机制，空格/播放按钮随时可恢复）
 * - 键盘：Esc 退出、←/→ 手动切换（重置自动计时）、空格播放/暂停；守卫对齐
 *   PhotoNav（e.repeat 连发与 shiftKey 组合不响应）
 * - 点击黑幕区域退出（对齐 ZoomableImage 灯箱惯例）：stopPropagation 只下沉到
 *   交互子元素与图片层；打开时焦点迁入对话框——否则焦点留在被覆盖的入口按钮上，
 *   Enter 原生激活会静默重播（空格已被 preventDefault，Enter 此前不对称）
 * - 打开期间置 body[data-lightbox="1"] + 锁滚动：PhotoNav/BackOnEsc 按既有约定让位
 * - 取数失败不静默：错误态 + 显式重试（PhotoGrid/MapView 同款姿态）；
 *   关闭/重开时 AbortController 中止上一发请求，杜绝竞态旧响应覆盖新列表
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { contextToParams, type PhotoContext } from "@/lib/filter-url";
import {
  SLIDE_INTERVAL_MS,
  buildPlaylist,
  nextIndex,
  prevIndex,
  toSlideshowPhoto,
  type SlideshowPhoto,
} from "@/lib/slideshow";

interface Props {
  /** 详情页当前照片（播放列表第一张）。刻意用 display WebP 变体而非原图直链：
   *  HEIC 原图浏览器无法渲染（详情页 zoomSrc 同款回退逻辑） */
  initial: SlideshowPhoto;
  /** 筛选上下文透传：播放列表与 ←/→ 相邻导航同一列表序 */
  context: PhotoContext;
}

/** /api/photos 响应中本组件消费的最小结构（其余字段忽略）。
 *  items 声明为 unknown：编译期断言约束不了 JSON 运行时形状，元素经
 *  isPlaylistItem 逐字段校验后才进入播放列表 */
interface PlaylistResponse {
  items?: unknown;
}

/** 元素级运行时校验（信任边界防御）：三字段都必须是 string，
 *  坏元素静默丢弃——一条脏数据不拖垮整个播放列表 */
function isPlaylistItem(p: unknown): p is { sha1: string; title: string; displayUrl: string } {
  if (typeof p !== "object" || p === null) return false;
  const item = p as Record<string, unknown>;
  return typeof item.sha1 === "string" && typeof item.title === "string" && typeof item.displayUrl === "string";
}

export default function SlideshowButton({ initial, context }: Props) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);
  const [playlist, setPlaylist] = useState<SlideshowPhoto[]>([]);
  const [index, setIndex] = useState(0);
  const [playing, setPlaying] = useState(true);
  /** 中止上一发列表请求：关闭、重开、重试都先 abort，旧响应不会覆盖新状态 */
  const abortRef = useRef<AbortController | null>(null);
  /** 打开时把焦点迁入对话框（M-2b）：焦点若留在被覆盖的入口按钮上，Enter 会
   *  原生激活它静默重播；Tab 也能绕回被覆盖层（无焦点陷阱，与既有灯箱一致） */
  const dialogRef = useRef<HTMLDivElement>(null);

  const start = useCallback(() => {
    abortRef.current?.abort();
    const ac = new AbortController();
    abortRef.current = ac;
    setOpen(true);
    setLoading(true);
    setError(false);
    // 自动轮播即动效：reduced-motion 用户打开时即为暂停（WCAG 2.2.2，播放键/空格
    // 随时可恢复）。判定放在点击处理器而非挂载 effect——setState 同步进 effect 会
    // 级联渲染（react-hooks/set-state-in-effect），且首帧 playing=true 会空转一次
    // 自动切换计时器（window.matchMedia 用法与 PhotoGrid.tsx:111 同款）
    setPlaying(!window.matchMedia("(prefers-reduced-motion: reduce)").matches);
    void (async () => {
      try {
        // 与 PhotoGrid.loadMore 共用 contextToParams：参数词汇表单一出处
        const params = contextToParams(context);
        const res = await fetch(`/api/photos?${params.toString()}`, { signal: ac.signal });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = (await res.json()) as PlaylistResponse;
        const items = Array.isArray(data.items) ? data.items.filter(isPlaylistItem).map(toSlideshowPhoto) : [];
        setPlaylist(buildPlaylist(initial, items));
        setIndex(0);
      } catch {
        if (ac.signal.aborted) return; // 主动中止（关闭/重试）不是失败
        setError(true);
      } finally {
        // 被新 start() abort 的旧请求不得再写 loading：catch 里的 return 不会
        // 跳过 finally，无守卫时旧 IIFE 会把新一轮刚置的 loading=true 踩回 false
        if (!ac.signal.aborted) setLoading(false);
      }
    })();
  }, [context, initial]);

  const close = useCallback(() => {
    abortRef.current?.abort();
    setOpen(false);
  }, []);

  const goNext = useCallback(() => setIndex((i) => nextIndex(i, playlist.length)), [playlist.length]);
  const goPrev = useCallback(() => setIndex((i) => prevIndex(i, playlist.length)), [playlist.length]);

  // 组件卸载兜底中止（快速导航离开详情页时不留悬挂请求）
  useEffect(() => () => abortRef.current?.abort(), []);

  // 自动切换：index 在依赖中 → 每张重置计时；手动切换/暂停/单张列表都自然停表
  useEffect(() => {
    if (!open || !playing || playlist.length < 2) return;
    const timer = setTimeout(() => setIndex((i) => nextIndex(i, playlist.length)), SLIDE_INTERVAL_MS);
    return () => clearTimeout(timer);
  }, [open, playing, index, playlist.length]);

  // 预取下一张的 display 变体：淡入时不出现空窗
  useEffect(() => {
    if (!open || playlist.length < 2) return;
    const upcoming = playlist[nextIndex(index, playlist.length)];
    if (!upcoming) return;
    const img = new Image();
    img.src = upcoming.displayUrl;
  }, [open, index, playlist]);

  // 全屏接管：锁滚动 + lightbox 标记（BackOnEsc/PhotoNav 据此让位），Esc/←/→/空格
  useEffect(() => {
    if (!open) return;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    document.body.dataset.lightbox = "1";
    // 焦点迁入对话框：中和被覆盖入口按钮的 Enter 激活（tabIndex=-1 可聚焦不进 Tab 序）
    dialogRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.repeat) return; // 按键连发：一次按压只走一步（对齐 PhotoNav）
      if (e.defaultPrevented || e.metaKey || e.ctrlKey || e.altKey || e.shiftKey) return;
      const t = e.target as HTMLElement | null;
      if (t && (t.isContentEditable || t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.tagName === "SELECT")) {
        return;
      }
      if (e.key === "Escape") {
        close();
      } else if (e.key === "ArrowRight") {
        e.preventDefault();
        goNext();
      } else if (e.key === "ArrowLeft") {
        e.preventDefault();
        goPrev();
      } else if (e.key === " " || e.key === "Spacebar") {
        // preventDefault 同时压掉空格对焦点按钮的原生激活，避免"切播放+触发按钮"双动作
        e.preventDefault();
        setPlaying((p) => !p);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
      delete document.body.dataset.lightbox;
    };
  }, [open, close, goNext, goPrev]);

  const current = playlist.length > 0 ? playlist[index] : undefined;
  const glassBtn =
    "flex h-11 w-11 items-center justify-center rounded-full border border-white/20 bg-white/10 text-lg leading-none text-white/85 backdrop-blur transition-colors hover:bg-white/20 focus-visible:outline-2 focus-visible:outline-[#f5b43c]";

  return (
    <>
      <button
        type="button"
        onClick={start}
        className="rounded-full border border-edge px-3 py-1 text-sm text-muted transition-colors hover:text-foreground focus-visible:outline-2 focus-visible:outline-[#f5b43c] focus-visible:outline-offset-2"
      >
        ▶ 幻灯片
      </button>

      {open ? (
        <div
          ref={dialogRef}
          tabIndex={-1}
          className="fixed inset-0 z-50 flex flex-col bg-black outline-none"
          role="dialog"
          aria-modal="true"
          aria-label="幻灯片放映"
          onClick={close}
        >
          {/* 顶栏：计数（aria-live 播报换片）+ 标题 + 退出。容器不 stopPropagation：
              黑幕点击冒泡到根节点退出（M-1，对齐 ZoomableImage 灯箱惯例），
              stopPropagation 只在交互子元素与图片上 */}
          <div className="flex shrink-0 items-center justify-between gap-4 px-5 pt-4 text-sm text-white/85">
            <p className="min-w-0 truncate">
              {/* loading 门控（L-2）：重开加载期间 playlist 仍是旧列表，不展示过期计数/标题 */}
              <span aria-live="polite">{!loading && current ? `${index + 1} / ${playlist.length}` : "幻灯片"}</span>
              {!loading && current ? <span className="ml-3 text-white/55">{current.title}</span> : null}
            </p>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                close();
              }}
              aria-label="退出幻灯片（Esc）"
              className="flex h-11 w-11 shrink-0 items-center justify-center text-3xl leading-none text-white/80 transition-colors hover:text-white focus-visible:outline-2 focus-visible:outline-[#f5b43c]"
            >
              ×
            </button>
          </div>

          {/* 舞台 */}
          <div className="relative flex min-h-0 flex-1 items-center justify-center">
            {loading ? <p className="text-sm text-white/60">正在加载播放列表…</p> : null}
            {!loading && error ? (
              <div className="flex flex-col items-center gap-3 px-4 text-center">
                <p className="text-sm text-white/70">播放列表加载失败，可能是网络问题</p>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    start();
                  }}
                  className="min-h-11 rounded-full border border-amber-500/40 bg-amber-500/10 px-4 text-sm text-amber-300 transition-colors hover:bg-amber-500/20 focus-visible:outline-2 focus-visible:outline-[#f5b43c] focus-visible:outline-offset-2"
                >
                  重试
                </button>
              </div>
            ) : null}
            {!loading && !error && current ? (
              /* key 换片重挂载触发 .slideshow-fade 淡入；reduced-motion 全局块自动降级 */
              <img
                key={current.sha1}
                src={current.displayUrl}
                alt={current.title}
                decoding="async"
                onClick={(e) => e.stopPropagation()}
                className="slideshow-fade max-h-full max-w-full object-contain"
              />
            ) : null}
            {!loading && !error && playlist.length > 1 ? (
              <>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    goPrev();
                  }}
                  aria-label="上一张（←）"
                  className={`absolute left-3 top-1/2 -translate-y-1/2 ${glassBtn}`}
                >
                  ‹
                </button>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    goNext();
                  }}
                  aria-label="下一张（→）"
                  className={`absolute right-3 top-1/2 -translate-y-1/2 ${glassBtn}`}
                >
                  ›
                </button>
              </>
            ) : null}
          </div>

          {/* 底栏：播放/暂停（空格） */}
          <div className="flex shrink-0 items-center justify-center px-5 pb-5 pt-2">
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setPlaying((p) => !p);
              }}
              aria-label={playing ? "暂停（空格）" : "播放（空格）"}
              className="min-h-11 rounded-full border border-white/20 bg-white/10 px-5 text-sm text-white/85 backdrop-blur transition-colors hover:bg-white/20 focus-visible:outline-2 focus-visible:outline-[#f5b43c]"
            >
              {playing ? "⏸ 暂停" : "▶ 播放"}
            </button>
          </div>
        </div>
      ) : null}
    </>
  );
}
