"use client";

import { useRouter, useSearchParams } from "next/navigation";

export type ViewMode = "normal" | "square" | "masonry" | "list";

/** 右上角视图切换：详细 / 拼图 / 瀑布纯图 / 列表。 */
const MODES: { key: ViewMode; title: string; icon: React.ReactNode }[] = [
  {
    key: "normal",
    title: "详细视图（瀑布流 + 信息卡）",
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
    title: "拼图视图（正方形纯图）",
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
    key: "masonry",
    title: "瀑布视图（纯图 + 悬浮标题）",
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
    key: "list",
    title: "列表视图（缩略图 + 摘要行）",
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

  function switchTo(view: ViewMode) {
    if (view === current) return;
    const params = new URLSearchParams(searchParams.toString());
    if (view === "normal") params.delete("view");
    else params.set("view", view);
    const qs = params.toString();
    router.replace(qs ? `/?${qs}` : "/", { scroll: false });
  }

  // 日历（月份文件夹）视图由侧栏「日历」进入，不支持切换视图，隐藏工具栏
  if (rawView === "calendar") return null;

  return (
    <div className="flex items-center gap-0.5 rounded-full border border-edge p-1 shrink-0 h-12" role="group" aria-label="视图切换">
      {MODES.map((mode) => (
        <button
          key={mode.key}
          type="button"
          onClick={() => switchTo(mode.key)}
          title={mode.title}
          aria-pressed={current === mode.key}
          className={`h-10 w-10 rounded-full flex items-center justify-center transition-colors ${
            current === mode.key ? "bg-foreground/15 text-foreground" : "text-muted hover:text-foreground"
          }`}
        >
          {mode.icon}
        </button>
      ))}
    </div>
  );
}
