"use client";

import { useRouter, useSearchParams } from "next/navigation";

/** 右上角视图切换：normal（瀑布流信息卡）/ square（正方形纯图拼接）。 */
export default function ViewToggle() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const current = searchParams.get("view") === "square" ? "square" : "normal";

  function switchTo(view: "normal" | "square") {
    if (view === current) return;
    const params = new URLSearchParams(searchParams.toString());
    if (view === "square") params.set("view", "square");
    else params.delete("view");
    const qs = params.toString();
    router.replace(qs ? `/?${qs}` : "/", { scroll: false });
  }

  const btn = (active: boolean) =>
    `rounded-md px-2 py-1 transition-colors ${
      active ? "bg-foreground/15 text-foreground" : "text-muted hover:text-foreground"
    }`;

  return (
    <div className="flex items-center gap-1 rounded-lg border border-edge p-0.5 shrink-0" role="group" aria-label="视图切换">
      <button type="button" onClick={() => switchTo("normal")} className={btn(current === "normal")} title="详细视图（瀑布流 + 信息）" aria-pressed={current === "normal"}>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <rect x="3" y="3" width="7" height="9" />
          <rect x="14" y="3" width="7" height="5" />
          <rect x="14" y="12" width="7" height="9" />
          <rect x="3" y="16" width="7" height="5" />
        </svg>
      </button>
      <button type="button" onClick={() => switchTo("square")} className={btn(current === "square")} title="拼图视图（正方形纯图）" aria-pressed={current === "square"}>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <rect x="3" y="3" width="7" height="7" />
          <rect x="14" y="3" width="7" height="7" />
          <rect x="3" y="14" width="7" height="7" />
          <rect x="14" y="14" width="7" height="7" />
        </svg>
      </button>
    </div>
  );
}
