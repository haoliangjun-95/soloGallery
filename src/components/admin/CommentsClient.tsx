"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import type { CommentAdminDTO } from "@/lib/types";

export default function CommentsClient({ initial }: { initial: CommentAdminDTO[] }) {
  const router = useRouter();
  const [replies, setReplies] = useState<Record<number, string>>({});
  const [busy, setBusy] = useState(false);

  async function patch(id: number, data: Record<string, unknown>) {
    setBusy(true);
    try {
      await fetch(`/api/admin/comments/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  async function remove(id: number) {
    if (!confirm("确认删除该评论？")) return;
    setBusy(true);
    try {
      await fetch(`/api/admin/comments/${id}`, { method: "DELETE" });
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <ul className="space-y-4">
      {initial.map((c) => (
        <li key={c.id} className="rounded-xl border border-edge bg-card p-4">
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <span className="font-medium">{c.nickname}</span>
            <span className="text-xs text-muted">{c.email ?? "无邮箱"}</span>
            <span className="text-xs text-muted">· {c.ip ?? ""}</span>
            <span className="text-xs text-muted">
              ·{" "}
              {new Intl.DateTimeFormat("zh-CN", {
                timeZone: "Asia/Shanghai",
                month: "2-digit",
                day: "2-digit",
                hour: "2-digit",
                minute: "2-digit",
                hour12: false,
              }).format(new Date(c.createdAt))}
            </span>
            <span className="flex-1" />
            <Link href={`/photo/${c.photoSha1}`} target="_blank" className="text-xs text-muted hover:text-foreground underline">
              {c.photoTitle || "查看图片"}
            </Link>
            <span
              className={`rounded px-1.5 py-0.5 text-[10px] ${
                c.status === "APPROVED"
                  ? "bg-emerald-500/15 text-emerald-300"
                  : c.status === "SPAM"
                    ? "bg-red-500/15 text-red-300"
                    : "bg-amber-500/15 text-amber-300"
              }`}
            >
              {c.status === "APPROVED" ? "已通过" : c.status === "SPAM" ? "垃圾" : "待审"}
            </span>
          </div>

          <p className="mt-2 text-sm whitespace-pre-wrap break-words">{c.content}</p>
          {c.adminReply ? (
            <p className="mt-2 rounded-lg bg-foreground/5 border border-edge px-3 py-2 text-sm">
              <span className="text-xs text-muted">已回复：</span>
              {c.adminReply}
            </p>
          ) : null}

          <div className="mt-3 flex flex-wrap items-center gap-2">
            <input
              value={replies[c.id] ?? ""}
              onChange={(e) => setReplies((prev) => ({ ...prev, [c.id]: e.target.value }))}
              placeholder="回复…"
              className="flex-1 min-w-[180px] rounded-lg bg-background border border-edge px-2 py-1.5 text-sm"
            />
            <button
              type="button"
              disabled={busy || !(replies[c.id] ?? "").trim()}
              onClick={() => patch(c.id, { adminReply: replies[c.id] })}
              className="rounded-lg border border-edge px-3 py-1.5 text-xs text-muted hover:text-foreground disabled:opacity-30"
            >
              回复
            </button>
            {c.status !== "APPROVED" ? (
              <button
                type="button"
                disabled={busy}
                onClick={() => patch(c.id, { status: "APPROVED" })}
                className="rounded-lg border border-emerald-500/40 px-3 py-1.5 text-xs text-emerald-400 hover:bg-emerald-500/10 disabled:opacity-30"
              >
                通过
              </button>
            ) : null}
            {c.status !== "SPAM" ? (
              <button
                type="button"
                disabled={busy}
                onClick={() => patch(c.id, { status: "SPAM" })}
                className="rounded-lg border border-edge px-3 py-1.5 text-xs text-amber-400 hover:bg-amber-500/10 disabled:opacity-30"
              >
                标垃圾
              </button>
            ) : null}
            <button
              type="button"
              disabled={busy}
              onClick={() => remove(c.id)}
              className="rounded-lg border border-red-500/40 px-3 py-1.5 text-xs text-red-400 hover:bg-red-500/10 disabled:opacity-30"
            >
              删除
            </button>
          </div>
        </li>
      ))}
      {initial.length === 0 ? <li className="py-10 text-center text-sm text-muted">没有评论</li> : null}
    </ul>
  );
}
