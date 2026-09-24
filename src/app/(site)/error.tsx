"use client";

import Link from "next/link";

/**
 * 路由级错误边界：(site) 段内任意页面抛错时的兜底 UI（Error Boundary 必须是客户端组件）。
 * Next 16 的 props 是 { error, retry }——retry 重新拉取并渲染该段，成功则自动替换本 UI。
 * 服务端已自动记录原始错误；此处展示 digest 供与服务器日志对照，不再重复 console 输出。
 */

/** 线性图标统一规格：16px、1.5 描边、圆角端点（与 Sidebar 图标规范一致）。 */
const STROKE = {
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.5,
  strokeLinecap: "round",
  strokeLinejoin: "round",
} as const;

export default function Error({
  error,
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  return (
    <div className="flex min-h-[60dvh] items-center justify-center px-4 py-16">
      <div
        role="alert"
        className="w-full max-w-md rounded-2xl border border-white/[0.06] bg-white/[0.025] p-8 text-center shadow-[0_12px_40px_rgba(0,0,0,0.45)] backdrop-blur-xl"
      >
        <span
          className="mx-auto mb-5 flex h-12 w-12 items-center justify-center rounded-full bg-[#f5b43c]/10 text-[#f5b43c]"
          aria-hidden
        >
          <svg className="h-6 w-6" viewBox="0 0 24 24" {...STROKE}>
            <path d="M12 3.5L1.8 20.5h20.4L12 3.5z" />
            <path d="M12 10v4.5M12 17.6v.4" />
          </svg>
        </span>
        <h1 className="text-lg font-semibold text-white">页面加载失败</h1>
        <p className="mt-2 text-sm leading-relaxed text-white/50">
          发生了意外错误，可以重试一次，或回到首页继续浏览。
        </p>
        {error.digest ? (
          <p className="mt-3 font-mono text-xs text-white/30">错误码：{error.digest}</p>
        ) : null}
        <div className="mt-6 flex items-center justify-center gap-3">
          <button
            type="button"
            onClick={retry}
            className="inline-flex min-h-11 items-center rounded-full bg-[#f5b43c] px-5 text-sm font-medium text-black transition-opacity hover:opacity-90 active:opacity-80"
          >
            重试
          </button>
          <Link
            href="/"
            className="inline-flex min-h-11 items-center rounded-full border border-edge px-5 text-sm text-muted transition-colors hover:text-foreground"
          >
            返回首页
          </Link>
        </div>
      </div>
    </div>
  );
}
