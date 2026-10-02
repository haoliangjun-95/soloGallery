import Link from "next/link";

/**
 * 离线回退页（SW 导航失败时兜底）。刻意自包含：不查库、不依赖运行时数据。
 * force-dynamic：(site) 布局的页头组件用了 useSearchParams，静态预渲染会触发
 * CSR bailout 报错——按需渲染即可，SW install 时 cache.add 照样能预热。
 */
export const dynamic = "force-dynamic";

export const metadata = { title: "离线 · soloGallery" };

export default function OfflinePage() {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center px-4 text-center">
      <p className="select-none text-7xl font-bold tracking-tight text-white/10" aria-hidden>
        ⚡
      </p>
      <h1 className="-mt-4 text-lg font-semibold">当前处于离线状态</h1>
      <p className="mt-2 text-sm text-muted">已缓存的图片仍可查看，网络恢复后刷新即可。</p>
      <Link
        href="/"
        className="mt-6 inline-flex min-h-11 items-center rounded-full bg-[#f5b43c] px-5 text-sm font-medium text-black transition-opacity hover:opacity-90"
      >
        返回首页
      </Link>
    </div>
  );
}
