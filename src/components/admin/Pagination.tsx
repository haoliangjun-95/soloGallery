"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";

/** 页码分页：窗口式页码 + 省略号 + 上一页/下一页 + 自定义跳页。保留当前所有查询参数。 */
export default function Pagination({ page, pages }: { page: number; pages: number }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [jump, setJump] = useState("");

  if (pages <= 1) return null;

  function go(next: number) {
    const p = Math.min(Math.max(1, Math.round(next)), pages);
    if (p === page) return;
    const params = new URLSearchParams(searchParams.toString());
    if (p === 1) params.delete("page");
    else params.set("page", String(p));
    const qs = params.toString();
    router.push(qs ? `?${qs}` : "?");
  }

  function submitJump(e: React.FormEvent) {
    e.preventDefault();
    const n = Number(jump);
    if (Number.isInteger(n) && n >= 1 && n <= pages) go(n);
    setJump("");
  }

  const nums: (number | "...")[] = [];
  const window = 2; // 当前页左右各 2 个
  for (let i = 1; i <= pages; i++) {
    if (i === 1 || i === pages || Math.abs(i - page) <= window) nums.push(i);
    else if (nums[nums.length - 1] !== "...") nums.push("...");
  }

  const btn =
    "min-w-8 h-8 px-2 rounded-lg text-sm transition-colors disabled:opacity-30";

  return (
    <div className="flex flex-wrap items-center justify-center gap-1.5 mt-6 text-sm">
      <button type="button" onClick={() => go(page - 1)} disabled={page <= 1} className={`${btn} border border-edge text-muted hover:text-foreground`}>
        ←
      </button>
      {nums.map((n, i) =>
        n === "..." ? (
          <span key={`e${i}`} className="px-1 text-muted select-none">
            …
          </span>
        ) : (
          <button
            key={n}
            type="button"
            onClick={() => go(n)}
            aria-current={n === page ? "page" : undefined}
            className={`${btn} ${
              n === page
                ? "bg-foreground text-background font-medium"
                : "border border-edge text-muted hover:text-foreground"
            }`}
          >
            {n}
          </button>
        ),
      )}
      <button type="button" onClick={() => go(page + 1)} disabled={page >= pages} className={`${btn} border border-edge text-muted hover:text-foreground`}>
        →
      </button>
      {pages > 7 ? (
        <form onSubmit={submitJump} className="flex items-center gap-1.5 ml-2 text-xs text-muted">
          <span>跳至</span>
          <input
            value={jump}
            onChange={(e) => setJump(e.target.value.replace(/\D/g, ""))}
            placeholder={`${page}`}
            inputMode="numeric"
            className="w-14 h-8 rounded-lg bg-background border border-edge px-2 text-sm outline-none focus:border-foreground/40"
          />
          <span>/ {pages} 页</span>
        </form>
      ) : null}
    </div>
  );
}
