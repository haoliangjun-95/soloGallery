import Link from "next/link";

/**
 * 根级 404：未匹配任何路由的 URL 渲染在根布局内——没有 (site) 的 header/footer，
 * 因此必须自包含整页（min-h-dvh 居中 + 暗色背景兜底，风格对齐站点设计 token）。
 */
export default function RootNotFound() {
  return (
    <main className="flex min-h-dvh items-center justify-center bg-background px-4">
      <div className="w-full max-w-md rounded-2xl border border-white/[0.06] bg-white/[0.025] p-10 text-center shadow-[0_12px_40px_rgba(0,0,0,0.45)] backdrop-blur-xl">
        <p className="select-none text-8xl font-bold tracking-tight text-white/10" aria-hidden>
          404
        </p>
        <h1 className="-mt-6 text-lg font-semibold text-white">页面不存在</h1>
        <p className="mt-2 text-sm leading-relaxed text-white/50">
          访问的地址没有对应页面，可能已被移动或删除。
        </p>
        <Link
          href="/"
          className="mt-6 inline-flex min-h-11 items-center rounded-full bg-[#f5b43c] px-5 text-sm font-medium text-black transition-opacity hover:opacity-90 active:opacity-80"
        >
          返回首页
        </Link>
      </div>
    </main>
  );
}
