"use client";

import { useRouter, useSearchParams } from "next/navigation";

export type ViewMode = "normal" | "square" | "masonry" | "list";

/** 右上角视图切换：详细 / 拼图 / 瀑布纯图 / 列表。 */
const MODES: { key: ViewMode; title: string; icon: React.ReactNode }[] = [
  {
    key: "normal",
    title: "详细视图（瀑布流 + 信息卡）",
    icon: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
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
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
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
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
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
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
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
  const current = (MODES.find((m) => m.key === searchParams.get("view")) ?? MODES[0]).key;

  function switchTo(view: ViewMode) {
    if (view === current) return;
    const params = new URLSearchParams(searchParams.toString());
    if (view === "normal") params.delete("view");
    else params.set("view", view);
    const qs = params.toString();
    router.replace(qs ? `/?${qs}` : "/", { scroll: false });
  }

  return (
    <div className="flex items-center gap-0.5 rounded-lg border border-edge p-0.5 shrink-0" role="group" aria-label="视图切换">
      {MODES.map((mode) => (
        <button
          key={mode.key}
          type="button"
          onClick={() => switchTo(mode.key)}
          title={mode.title}
          aria-pressed={current === mode.key}
          className={`rounded-md px-2 py-1 transition-colors ${
            current === mode.key ? "bg-foreground/15 text-foreground" : "text-muted hover:text-foreground"
          }`}
        >
          {mode.icon}
        </button>
      ))}
    </div>
  );
}
