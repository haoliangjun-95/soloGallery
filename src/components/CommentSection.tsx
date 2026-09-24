"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import {
  COMMENT_CONTENT_MAX,
  COMMENT_PAGE_SIZE,
  expandVisible,
  isNearCommentLimit,
  sliceComments,
} from "@/lib/comment-view";
import { DISPLAY_TZ } from "@/lib/time";
import type { CommentDTO } from "@/lib/types";

const NICKNAME_KEY = "solog_comment_nickname";
const EMAIL_KEY = "solog_comment_email";

export default function CommentSection({
  photoId,
  initialComments,
}: {
  photoId: number;
  initialComments: CommentDTO[];
}) {
  const router = useRouter();
  // 直接渲染 prop（派生值）而非 useState 冻结快照：
  // 自动过审模式下 router.refresh() 拉回的新 initialComments 才能立即上屏
  const comments = initialComments;
  // 功能 13：客户端渐进分页——首屏 5 条，「查看更多」每次 +5（lib/comment-view.ts
  // 纯函数切片）；刻意不做服务端游标分页：单人博客量级下 RSC 一次给全量 +
  // 客户端切片零额外请求、零公开 GET API 面（技术债已记清单）
  const [visible, setVisible] = useState(COMMENT_PAGE_SIZE);
  const [expandedAll, setExpandedAll] = useState(false);
  const shown = sliceComments(comments, visible, expandedAll);
  const hidden = comments.length - shown.length;
  const [nickname, setNickname] = useState("");
  const [email, setEmail] = useState("");
  const [content, setContent] = useState("");
  const [honeypot, setHoneypot] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // 回填浏览器缓存的昵称/邮箱（延后一拍，避免 effect 体内同步 setState）
  useEffect(() => {
    const kickoff = setTimeout(() => {
      try {
        const savedNick = localStorage.getItem(NICKNAME_KEY);
        const savedEmail = localStorage.getItem(EMAIL_KEY);
        if (savedNick) setNickname(savedNick);
        if (savedEmail) setEmail(savedEmail);
      } catch {
        /* 隐私模式等 localStorage 不可用时静默降级 */
      }
    }, 0);
    return () => clearTimeout(kickoff);
  }, []);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (submitting) return;
    setSubmitting(true);
    setMessage(null);
    setError(null);
    try {
      const res = await fetch("/api/comments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ photoId, nickname, email, content, website: honeypot }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? "提交失败");
      setMessage(data.message ?? "评论成功");
      setContent("");
      // 记住昵称/邮箱，下次自动回填
      try {
        if (nickname.trim()) localStorage.setItem(NICKNAME_KEY, nickname.trim());
        if (email.trim()) localStorage.setItem(EMAIL_KEY, email.trim());
      } catch {
        /* localStorage 不可用时忽略 */
      }
      // 自动通过模式：刷新让新评论立即出现
      if (data.moderated === false) {
        // 先全量展开再刷新：评论 asc 排序、新评论在末尾，若仍按 visible
        // 切片，refresh 拉回的新评论会落在隐藏区「发了却看不见」
        setExpandedAll(true);
        router.refresh();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "提交失败");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <section className="rounded-xl border border-edge bg-card p-4">
      <h2 className="text-sm font-medium text-muted mb-4">
        评论 <span className="opacity-60">{comments.length > 0 ? `· ${comments.length}` : ""}</span>
      </h2>

      <form onSubmit={submit} className="space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <input
            value={nickname}
            onChange={(e) => setNickname(e.target.value)}
            placeholder="昵称 *"
            required
            maxLength={24}
            className="rounded-lg bg-background border border-edge px-3 py-2 text-sm outline-none focus:border-foreground/40"
          />
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="邮箱（可选，不公开）"
            maxLength={255}
            className="rounded-lg bg-background border border-edge px-3 py-2 text-sm outline-none focus:border-foreground/40"
          />
        </div>
        {/* 蜜罐：人类不可见，机器人会填 */}
        <input
          value={honeypot}
          onChange={(e) => setHoneypot(e.target.value)}
          name="website"
          tabIndex={-1}
          autoComplete="off"
          aria-hidden="true"
          className="hidden"
        />
        <textarea
          value={content}
          onChange={(e) => setContent(e.target.value)}
          placeholder="说点什么…"
          required
          maxLength={COMMENT_CONTENT_MAX}
          rows={3}
          className="w-full rounded-lg bg-background border border-edge px-3 py-2 text-sm outline-none focus:border-foreground/40 resize-y"
        />
        {/* 功能 13：实时字数计数——maxLength 静默截断改为可见余量，≥90% 琥珀预警 */}
        <div className="flex justify-end">
          <span
            className={`text-xs tabular-nums ${
              isNearCommentLimit(content.length) ? "text-amber-400" : "text-muted"
            }`}
          >
            {content.length} / {COMMENT_CONTENT_MAX}
          </span>
        </div>
        {message ? <p className="text-sm text-emerald-400">{message}</p> : null}
        {error ? <p className="text-sm text-red-400">{error}</p> : null}
        <button
          type="submit"
          disabled={submitting || !nickname.trim() || !content.trim()}
          className="rounded-lg bg-foreground text-background px-4 py-2 text-sm font-medium disabled:opacity-40 hover:opacity-90"
        >
          {submitting ? "提交中…" : "发表评论"}
        </button>
      </form>

      {comments.length > 0 ? (
        <>
          <ul className="mt-6 space-y-4">
            {shown.map((c) => (
              <li key={c.id} className="border-t border-edge pt-4 first:border-0 first:pt-0">
                <div className="flex items-baseline justify-between gap-2">
                  <span className="text-sm font-medium">{c.nickname}</span>
                  <time className="text-xs text-muted">{formatTime(c.createdAt)}</time>
                </div>
                <p className="mt-1 text-sm text-foreground/90 whitespace-pre-wrap break-words">{c.content}</p>
                {c.adminReply ? (
                  <div className="mt-2 rounded-lg bg-foreground/5 border border-edge px-3 py-2">
                    <span className="text-xs font-medium text-foreground">作者回复：</span>
                    <p className="mt-1 text-sm text-foreground/90 whitespace-pre-wrap break-words">{c.adminReply}</p>
                  </div>
                ) : null}
              </li>
            ))}
          </ul>
          {hidden > 0 ? (
            <button
              type="button"
              onClick={() => setVisible((v) => expandVisible(v, comments.length))}
              className="mt-4 w-full rounded-lg border border-edge px-4 py-2 text-sm text-muted hover:text-foreground"
            >
              查看更多评论（剩余 {hidden} 条）
            </button>
          ) : null}
        </>
      ) : (
        <p className="mt-6 text-sm text-muted">还没有评论，来抢沙发。</p>
      )}
    </section>
  );
}

// Intl 格式化器构造较重，模块级复用（同 lib/time.ts 的先例）；评论列表逐条调用时避免重复构造
let commentTimeFormatter: Intl.DateTimeFormat | null = null;

function formatTime(iso: string): string {
  commentTimeFormatter ??= new Intl.DateTimeFormat("zh-CN", {
    timeZone: DISPLAY_TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
  return commentTimeFormatter.format(new Date(iso));
}
