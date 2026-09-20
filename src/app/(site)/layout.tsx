import Link from "next/link";
import SearchBox from "@/components/SearchBox";
import { getSettings } from "@/lib/settings";
import { isAdmin } from "@/lib/auth";

export default async function SiteLayout({ children }: LayoutProps<"/">) {
  const settings = await getSettings().catch(() => null);
  const admin = await isAdmin().catch(() => false);
  return (
    <div className="min-h-dvh flex flex-col">
      <header className="sticky top-0 z-20 backdrop-blur bg-background/80 border-b border-edge">
        <div className="max-w-7xl mx-auto px-4 h-14 flex items-center justify-between gap-4">
          <div className="flex items-center gap-4 min-w-0">
            <Link href="/" className="text-lg font-semibold tracking-wide hover:opacity-80 shrink-0">
              {settings?.siteTitle ?? "soloGallery"}
            </Link>
            <nav className="flex items-center gap-4 text-sm text-muted">
              <Link href="/" className="hover:text-foreground">
                画廊
              </Link>
              {admin ? (
                <Link href="/admin/photos" className="hover:text-foreground">
                  后台
                </Link>
              ) : null}
            </nav>
          </div>
          <SearchBox />
        </div>
      </header>
      <main className="flex-1">{children}</main>
      <footer className="border-t border-edge py-6 text-center text-xs text-muted">
        {settings?.siteTitle ?? "soloGallery"} · Powered by soloGallery
      </footer>
    </div>
  );
}
