"use client";

import Link from "next/link";
import { useState } from "react";
import { insertIfAbsent, patchById, removeById } from "@/lib/optimistic";
import { DISPLAY_TZ } from "@/lib/time";
import type { CommentAdminDTO } from "@/lib/types";
import { ConfirmDialog } from "./ConfirmDialog";
import ErrorBanner from "./ErrorBanner";
import { jsonInit, useAdminAction } from "./useAdminAction";

export default function CommentsClient({ initial }: { initial: CommentAdminDTO[] }) {
  const { busy, error, setError, run, refresh } = useAdminAction();
  const [replies, setReplies] = useState<Record<number, string>>({});
  const [pendingRemoveId, setPendingRemoveId] = useState<number | null>(null);
  /** 乐观更新的行级 pending：只禁目标评论的按钮，不再全局 busy 冻结整列表 */
  const [pendingIds, setPendingIds] = useState<Set<number>>(new Set());
  // 本地镜像（功能 9 乐观更新）：通过/标垃圾/回复/删除立即生效；router.refresh()
  // 回流新 initial 引用时重置——React 官方「prop 变化时渲染期调整 state」模式
  // （放 effect 会级联渲染并挂 react-hooks/set-state-in-effect）
  const [comments, setComments] = useState(initial);
  const [syncedInitial, setSyncedInitial] = useState(initial);
  if (initial !== syncedInitial) {
    setSyncedInitial(initial);
    setComments(initial);
  }

  function withPending(id: number) {
    setPendingIds((prev) => new Set(prev).add(id));
  }
  function withoutPending(id: number) {
    setPendingIds((prev) => {
      const next = new Set(prev);
      next.delete(id);
      return next;
    });
  }

  /**
   * 乐观 PATCH（通过/标垃圾/回复）：本地立即生效，失败以反向补丁只回滚本行
   * ——函数式回滚不 clobber 其它 in-flight 行的中间态。失败时原来只 refresh、
   * 界面毫无变化致用户反复点同一按钮——现在错误进 ErrorBanner + 本行还原。
   * patch 类型收窄到服务端实际接受的字段集（route 白名单 status/adminReply，
   * 宽于契约的字段会被乐观应用但被服务端静默忽略，refresh 前展示分歧）。
   */
  async function patchComment(
    comment: CommentAdminDTO,
    patch: Partial<Pick<CommentAdminDTO, "status" | "adminReply">>,
    rollback: Partial<Pick<CommentAdminDTO, "status" | "adminReply">>,
    onSuccess?: () => void,
  ) {
    if (busy || pendingIds.has(comment.id)) return;
    // 显式类型实参：patch 收窄为 Partial<Pick<…>> 后不再能反推 T=CommentAdminDTO，
    // 泛型会退化到约束 { id: number }（与 [] 字面量退化 never[] 同一类修法）
    setComments((prev) => patchById<CommentAdminDTO>(prev, comment.id, patch));
    withPending(comment.id);
    const ok = await run(`/api/admin/comments/${comment.id}`, jsonInit("PATCH", patch), { quiet: true, onSuccess });
    withoutPending(comment.id);
    if (!ok) {
      setComments((prev) => patchById<CommentAdminDTO>(prev, comment.id, rollback));
      // 失败路径也回流：点击后镜像可能已被并发 refresh 重置且目标行被外部写过，
      // 回滚值是点击时的旧快照——refresh 收敛到服务端真值（失败低频，代价可忽略）
      refresh();
    }
  }

  /** 乐观 DELETE：行立即消失，失败按删除前记录的 index 原位幂等插回恢复顺序 */
  async function removeComment(id: number) {
    if (busy || pendingIds.has(id)) return;
    const index = comments.findIndex((c) => c.id === id);
    if (index < 0) return;
    const row = comments[index];
    setComments((prev) => removeById(prev, id));
    withPending(id);
    const ok = await run(`/api/admin/comments/${id}`, { method: "DELETE" }, { quiet: true });
    withoutPending(id);
    if (!ok) {
      // 幂等插回：DELETE 失败 = 服务端行始终在，并发操作成功的 refresh 可能已
      // 把它随 props 带回（镜像重置后行已复活）——盲目 insertAt 会重复行/key 冲突
      setComments((prev) => insertIfAbsent(prev, index, row));
      refresh();
    }
  }

  return (
    <>
      <ErrorBanner error={error} onClose={() => setError(null)} className="mb-4" />
      <ul className="space-y-4">
      {comments.map((c) => (
        <li key={c.id} className="rounded-xl border border-edge bg-card p-4">
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <span className="font-medium">{c.nickname}</span>
            <span className="text-xs text-muted">{c.email ?? "无邮箱"}</span>
            <span className="text-xs text-muted">· {c.ip ?? ""}</span>
            <span className="text-xs text-muted">
              ·{" "}
              {new Intl.DateTimeFormat("zh-CN", {
                timeZone: DISPLAY_TZ,
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
              disabled={pendingIds.has(c.id) || !(replies[c.id] ?? "").trim()}
              onClick={() =>
                patchComment(
                  c,
                  { adminReply: replies[c.id] },
                  { adminReply: c.adminReply },
                  // 服务端确认后才清空草稿：失败时用户输入还在，可直接重试
                  () => setReplies((prev) => ({ ...prev, [c.id]: "" })),
                )
              }
              className="rounded-lg border border-edge px-3 py-1.5 text-xs text-muted hover:text-foreground disabled:opacity-30"
            >
              回复
            </button>
            {c.status !== "APPROVED" ? (
              <button
                type="button"
                disabled={pendingIds.has(c.id)}
                onClick={() => patchComment(c, { status: "APPROVED" }, { status: c.status })}
                className="rounded-lg border border-emerald-500/40 px-3 py-1.5 text-xs text-emerald-400 hover:bg-emerald-500/10 disabled:opacity-30"
              >
                通过
              </button>
            ) : null}
            {c.status !== "SPAM" ? (
              <button
                type="button"
                disabled={pendingIds.has(c.id)}
                onClick={() => patchComment(c, { status: "SPAM" }, { status: c.status })}
                className="rounded-lg border border-edge px-3 py-1.5 text-xs text-amber-400 hover:bg-amber-500/10 disabled:opacity-30"
              >
                标垃圾
              </button>
            ) : null}
            <button
              type="button"
              disabled={pendingIds.has(c.id)}
              onClick={() => setPendingRemoveId(c.id)}
              className="rounded-lg border border-red-500/40 px-3 py-1.5 text-xs text-red-400 hover:bg-red-500/10 disabled:opacity-30"
            >
              删除
            </button>
          </div>
        </li>
      ))}
        {comments.length === 0 ? <li className="py-10 text-center text-sm text-muted">没有评论</li> : null}
      </ul>

      {pendingRemoveId !== null ? (
        <ConfirmDialog
          message="确认删除该评论？删除后无法恢复。"
          confirmLabel="删除"
          danger
          onConfirm={() => removeComment(pendingRemoveId)}
          onClose={() => setPendingRemoveId(null)}
        />
      ) : null}
    </>
  );
}
