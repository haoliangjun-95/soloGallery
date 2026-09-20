import SearchBox from "@/components/SearchBox";
import ViewToggle from "@/components/ViewToggle";
import { getSettings } from "@/lib/settings";

export default async function SiteLayout({ children }: LayoutProps<"/">) {
  const settings = await getSettings().catch(() => null);
  return (
    <div className="min-h-dvh flex flex-col">
      <header className="sticky top-0 z-20 backdrop-blur bg-background/80 border-b border-edge">
        <div className="w-full px-4 lg:px-6 h-16 flex items-center gap-4">
          {/* 品牌仅在移动端页头展示（只留头像，空间让给搜索框）；桌面端头像+名称在左侧栏顶部 */}
          <div className="flex lg:hidden items-center gap-3 min-w-0 shrink-0">
            {settings?.siteLogo ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={settings.siteLogo} alt="" className="h-12 w-12 rounded-full object-cover shrink-0" />
            ) : null}
          </div>
          <div className="flex-1 min-w-0 flex items-center gap-4">
            {/* (site) 下全部路由都是动态渲染，useSearchParams 无需 Suspense；
                包 Suspense 会走流式揭示（S:0/B:0 + rAF 延迟），曾在面板折叠时卡住不显示 */}
            <ViewToggle />
            <SearchBox />
          </div>
        </div>
      </header>
      <main className="flex-1">{children}</main>
      <footer className="border-t border-edge py-6 text-center text-xs text-muted">
        {settings?.siteTitle ?? "soloGallery"} · Powered by soloGallery
      </footer>
    </div>
  );
}
