import Link from "next/link";
import CommentsClient from "@/components/admin/CommentsClient";
import { listCommentsAdmin, markAllCommentsRead } from "@/lib/queries";

export const dynamic = "force-dynamic";

const TABS = [
  { key: "PENDING", label: "待审" },
  { key: "APPROVED", label: "已通过" },
  { key: "SPAM", label: "垃圾" },
  // "全部"用显式参数：无 status 参数与"全部"必须可区分，否则默认态会误吞"全部"
  { key: "all", label: "全部" },
] as const;

type CommentStatus = "PENDING" | "APPROVED" | "SPAM";

const VALID_STATUSES = new Set<string>(["PENDING", "APPROVED", "SPAM"]);

export default async function AdminCommentsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  const sp = await searchParams;
  const tabKey = TABS.some((t) => t.key === sp.status) ? (sp.status as string) : "PENDING";
  const status = VALID_STATUSES.has(tabKey) ? (tabKey as CommentStatus) : undefined;
  // 查询与"标记已读"互不依赖，并行（打开评论页即视为已读，角标清零）
  const [comments] = await Promise.all([listCommentsAdmin(status), markAllCommentsRead()]);

  return (
    <div>
      <h1 className="text-lg font-semibold mb-4">评论管理</h1>
      <div className="flex gap-2 mb-4 text-sm">
        {TABS.map((tab) => (
          <Link
            key={tab.key}
            href={`/admin/comments?status=${tab.key}`}
            className={`rounded-full border px-3 py-1 ${
              tabKey === tab.key
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
