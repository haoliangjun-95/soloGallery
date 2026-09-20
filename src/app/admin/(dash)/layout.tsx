import Link from "next/link";
import { redirect } from "next/navigation";
import LogoutButton from "@/components/admin/LogoutButton";
import { isAdmin } from "@/lib/auth";
import { countUnreadComments } from "@/lib/queries";

export const dynamic = "force-dynamic";

const NAV = [
  { href: "/admin/photos", label: "图片" },
  { href: "/admin/upload", label: "上传" },
  { href: "/admin/categories", label: "分类" },
  { href: "/admin/tags", label: "标签" },
  { href: "/admin/comments", label: "评论" },
  { href: "/admin/sync", label: "同步" },
  { href: "/admin/settings", label: "设置" },
];

export default async function DashLayout({ children }: LayoutProps<"/admin">) {
  if (!(await isAdmin().catch(() => false))) redirect("/admin/login");
  const unread = await countUnreadComments().catch(() => 0);

  return (
    <div className="min-h-dvh">
      <header className="sticky top-0 z-20 backdrop-blur bg-background/80 border-b border-edge">
        <div className="max-w-7xl mx-auto px-4 h-14 flex items-center justify-between gap-4">
          <div className="flex items-center gap-5 overflow-x-auto">
            <span className="font-semibold whitespace-nowrap">soloGallery</span>
            <nav className="flex items-center gap-4 text-sm text-muted">
              {NAV.map((item) => (
                <Link key={item.href} href={item.href} className="hover:text-foreground whitespace-nowrap">
                  {item.label}
                  {item.href === "/admin/comments" && unread > 0 ? (
                    <span className="ml-1.5 inline-flex items-center justify-center min-w-5 h-5 px-1.5 rounded-full bg-red-500 text-white text-xs leading-none">
                      {unread > 99 ? "99+" : unread}
                    </span>
                  ) : null}
                </Link>
              ))}
            </nav>
          </div>
          <div className="flex items-center gap-4 text-sm shrink-0">
            <Link href="/" className="text-muted hover:text-foreground">
              前台
            </Link>
            <LogoutButton />
          </div>
        </div>
      </header>
      <main className="w-full px-4 py-6 lg:px-6">{children}</main>
    </div>
  );
}
