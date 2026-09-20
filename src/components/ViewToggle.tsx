"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";

export type ViewMode = "normal" | "square" | "fixed" | "masonry" | "list";

/** 视图切换：固定宽高（默认，无参数即它）/ 瀑布 / 详细 / 拼图 / 列表。title 即悬停提示（视图名 + 效果描述）。
 *  详细、拼图在手机端隐藏（hideOnMobile），手机只保留固定宽高/瀑布/列表三个。 */
const MODES: { key: ViewMode; title: string; hideOnMobile?: boolean; icon: React.ReactNode }[] = [
  {
    key: "fixed",
    title: "固定宽高视图 — 统一方形卡片，图片裁切铺满，下方附拍摄信息",
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <rect x="4" y="3" width="4" height="18" rx="1" />
        <rect x="10" y="3" width="4" height="18" rx="1" />
        <rect x="16" y="3" width="4" height="18" rx="1" />
      </svg>
    ),
  },
  {
    key: "masonry",
    title: "瀑布视图 — 原比例纯图瀑布流，悬停显示标题",
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <rect x="3" y="3" width="5" height="10" />
        <rect x="10" y="3" width="5" height="6" />
        <rect x="17" y="3" width="4" height="12" />
        <rect x="3" y="17" width="5" height="4" />
        <rect x="10" y="13" width="5" height="8" />
        <rect x="17" y="19" width="4" height="2" />
      </svg>
    ),
  },
  {
    key: "normal",
    title: "详细视图 — 原比例图片配完整信息卡",
    hideOnMobile: true,
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <rect x="3" y="3" width="7" height="9" />
        <rect x="14" y="3" width="7" height="5" />
        <rect x="14" y="12" width="7" height="9" />
        <rect x="3" y="16" width="7" height="5" />
      </svg>
    ),
  },
  {
    key: "square",
    title: "拼图视图 — 正方形纯图，高密度紧凑排列",
    hideOnMobile: true,
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <rect x="3" y="3" width="7" height="7" />
        <rect x="14" y="3" width="7" height="7" />
        <rect x="3" y="14" width="7" height="7" />
        <rect x="14" y="14" width="7" height="7" />
      </svg>
    ),
  },
  {
    key: "list",
    title: "列表视图 — 缩略图与摘要逐行排列",
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <rect x="3" y="4" width="7" height="7" />
        <path d="M14 6h7M14 9h5" />
        <rect x="3" y="14" width="7" height="7" />
        <path d="M14 16h7M14 19h5" />
      </svg>
    ),
  },
];

export default function ViewToggle() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const rawView = searchParams.get("view");
  const current = (MODES.find((m) => m.key === rawView) ?? MODES[0]).key;
  // tooltip 用 JS 状态驱动：内嵌 WebKit(Electron/IAB) 对 group-hover 这类
  // :is(:where())+@layer 组合的 CSS 悬浮变体存在静默失效问题，原生 title 也不渲染
  const [hovered, setHovered] = useState<ViewMode | null>(null);

  function switchTo(view: ViewMode) {
    if (view === current) return;
    const params = new URLSearchParams(searchParams.toString());
    // 固定宽高是默认视图（无参数即它），切回它时清掉 view 参数
    if (view === "fixed") params.delete("view");
    else params.set("view", view);
    const qs = params.toString();
    router.replace(qs ? `/?${qs}` : "/", { scroll: false });
  }

  // 日历（月份文件夹）视图由侧栏「日历」进入，不支持切换视图，隐藏工具栏
  if (rawView === "calendar") return null;

  return (
    <div
      className="relative flex items-center gap-0.5 rounded-full border border-edge p-1 shrink-0 h-12 order-2 lg:order-1"
      role="group"
      aria-label="视图切换"
    >
      {MODES.map((mode) => (
        <button
          key={mode.key}
          type="button"
          onClick={() => switchTo(mode.key)}
          aria-label={mode.title}
          aria-pressed={current === mode.key}
          onMouseEnter={() => setHovered(mode.key)}
          onMouseLeave={() => setHovered((h) => (h === mode.key ? null : h))}
          onFocus={() => setHovered(mode.key)}
          onBlur={() => setHovered((h) => (h === mode.key ? null : h))}
          className={`h-10 w-10 rounded-full items-center justify-center transition-colors ${
            mode.hideOnMobile ? "hidden sm:flex" : "flex"
          } ${
            current === mode.key ? "bg-foreground/15 text-foreground" : "text-muted hover:text-foreground"
          }`}
        >
          {mode.icon}
          {/* 悬浮提示：桌面锚定按钮组左缘；手机端按钮组靠右，改锚右缘防超出屏幕；
              未悬停时 display:none —— opacity:0 的绝对定位元素仍会撑出横向滚动 */}
          <span
            aria-hidden
            className={`pointer-events-none absolute right-0 top-full z-50 mt-2.5 w-max max-w-[240px] rounded-md border border-edge bg-card px-2.5 py-1.5 text-left text-xs leading-relaxed text-foreground shadow-[0_8px_24px_rgba(0,0,0,.5)] lg:right-auto lg:left-0 ${
              hovered === mode.key ? "opacity-100" : "hidden"
            }`}
          >
            {mode.title}
          </span>
        </button>
      ))}
    </div>
  );
}
