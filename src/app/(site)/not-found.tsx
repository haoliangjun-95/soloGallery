import Link from "next/link";

/**
 * 段内 notFound() 兜底：photo/[sha1] 与 category/[slug] 调用 notFound() 时渲染，
 * 处于 (site) 布局内（header/footer 仍在），只需补齐内容区。
 * 未匹配的 URL 不走这里，走 app/not-found.tsx（根布局，无站点 chrome）。
 */
export default function NotFound() {
  return (
    <div className="flex min-h-[50dvh] flex-col items-center justify-center px-4 py-16 text-center">
      <p className="select-none text-7xl font-bold tracking-tight text-white/10" aria-hidden>
        404
      </p>
      <h1 className="-mt-6 text-lg font-semibold text-white">内容不存在</h1>
      <p className="mt-2 text-sm text-white/50">照片或页面不存在，或尚未发布。</p>
      <Link
        href="/"
        className="mt-6 inline-flex min-h-11 items-center rounded-full bg-[#f5b43c] px-5 text-sm font-medium text-black transition-opacity hover:opacity-90 active:opacity-80"
      >
        返回首页
      </Link>
    </div>
  );
}
