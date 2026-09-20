import Link from "next/link";
import { redirect } from "next/navigation";
import LogoutButton from "@/components/admin/LogoutButton";
import { isAdmin } from "@/lib/auth";

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
      <main className="max-w-7xl mx-auto px-4 py-6">{children}</main>
    </div>
  );
}
