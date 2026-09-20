import Link from "next/link";
import CommentsClient from "@/components/admin/CommentsClient";
import { listCommentsAdmin, markAllCommentsRead } from "@/lib/queries";

export const dynamic = "force-dynamic";

const TABS = [
  { key: "PENDING", label: "待审" },
  { key: "APPROVED", label: "已通过" },
  { key: "SPAM", label: "垃圾" },
  { key: "", label: "全部" },
] as const;

export default async function AdminCommentsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  const sp = await searchParams;
  const status = TABS.some((t) => t.key === sp.status) ? (sp.status || undefined) : "PENDING";
  const comments = await listCommentsAdmin(status as "PENDING" | "APPROVED" | "SPAM" | undefined);
  // 打开评论页即视为已读（角标清零）
  await markAllCommentsRead();

  return (
    <div>
      <h1 className="text-lg font-semibold mb-4">评论管理</h1>
      <div className="flex gap-2 mb-4 text-sm">
        {TABS.map((tab) => (
          <Link
            key={tab.key}
            href={tab.key ? `/admin/comments?status=${tab.key}` : "/admin/comments"}
            className={`rounded-full border px-3 py-1 ${
              (sp.status ?? "PENDING") === tab.key || (!sp.status && tab.key === "PENDING")
                ? "border-foreground/60 bg-foreground/10"
                : "border-edge text-muted hover:text-foreground"
            }`}
          >
            {tab.label}
          </Link>
        ))}
      </div>
      <CommentsClient initial={comments} />
    </div>
  );
}
