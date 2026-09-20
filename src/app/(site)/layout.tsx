import Link from "next/link";
import { Suspense } from "react";
import SearchBox from "@/components/SearchBox";
import ViewToggle from "@/components/ViewToggle";
import { getSettings } from "@/lib/settings";
import { isAdmin } from "@/lib/auth";

export default async function SiteLayout({ children }: LayoutProps<"/">) {
  const settings = await getSettings().catch(() => null);
  const admin = await isAdmin().catch(() => false);
  return (
    <div className="min-h-dvh flex flex-col">
      <header className="sticky top-0 z-20 backdrop-blur bg-background/80 border-b border-edge">
        <div className="w-full px-4 lg:px-6 h-14 flex items-center gap-4">
          <div className="flex items-center gap-3 min-w-0 shrink-0">
            {settings?.siteLogo ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={settings.siteLogo} alt="" className="h-8 w-8 rounded-full object-cover shrink-0" />
            ) : null}
            <Link href="/" className="text-lg font-semibold tracking-wide hover:opacity-80 truncate">
              {settings?.siteTitle ?? "soloGallery"}
            </Link>
          </div>
          <div className="flex-1 min-w-0 flex">
            <SearchBox />
          </div>
          <Suspense fallback={null}>
            <ViewToggle />
          </Suspense>
        </div>
      </header>
      <main className="flex-1">{children}</main>
      <footer className="border-t border-edge py-6 text-center text-xs text-muted">
        {settings?.siteTitle ?? "soloGallery"} · Powered by soloGallery
      </footer>
    </div>
  );
}
