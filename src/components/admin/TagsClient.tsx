"use client";

import { useState } from "react";
import type { TagDTO } from "@/lib/types";
import { ConfirmDialog } from "./ConfirmDialog";
import ErrorBanner from "./ErrorBanner";
import { jsonInit, useAdminAction } from "./useAdminAction";

export default function TagsClient({ initial }: { initial: TagDTO[] }) {
  const { busy, error, setError, run } = useAdminAction();
  const [name, setName] = useState("");
  const [pendingRemove, setPendingRemove] = useState<TagDTO | null>(null);

  // 创建不做乐观：新行需要服务端生成的 id/计数，refresh 回流即真值。
  // 重名等 400 场景原来只清空输入框、看起来像添加成功了——现在错误进 ErrorBanner
  async function create(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim() || busy) return;
    await run("/api/admin/tags", jsonInit("POST", { name: name.trim() }), {
      onSuccess: () => setName(""),
    });
  }

  // 删除不做乐观（低频 + ConfirmDialog 确认门槛），但经 hook 补上此前缺失的
  // busy 门——原实现 DELETE 在途时仍可再次触发（重复请求）
  async function remove(id: number) {
    await run(`/api/admin/tags/${id}`, { method: "DELETE" });
  }

  return (
    <div className="space-y-6">
      <form onSubmit={create} className="flex gap-2">
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="新标签"
          className="flex-1 max-w-xs rounded-lg bg-background border border-edge px-3 py-2 text-sm outline-none focus:border-foreground/40"
        />
        <button
          type="submit"
          disabled={busy || !name.trim()}
          className="rounded-lg bg-foreground text-background px-4 py-2 text-sm font-medium disabled:opacity-40"
        >
          添加
        </button>
      </form>

      <ErrorBanner error={error} onClose={() => setError(null)} />

      <div className="flex flex-wrap gap-2">
        {initial.map((t) => (
          <span key={t.id} className="group inline-flex items-center gap-2 rounded-full border border-edge px-3 py-1 text-sm">
            #{t.name}
            <span className="text-xs text-muted">{t.count}</span>
            <button
              type="button"
              onClick={() => setPendingRemove(t)}
              className="text-muted hover:text-red-400"
              aria-label={`删除标签 ${t.name}`}
            >
              ×
            </button>
          </span>
        ))}
        {initial.length === 0 ? <p className="text-sm text-muted">暂无标签</p> : null}
      </div>

      {pendingRemove ? (
        <ConfirmDialog
          message={`确认删除标签「${pendingRemove.name}」？会从所有图片上移除。`}
          confirmLabel="删除"
          danger
          onConfirm={() => remove(pendingRemove.id)}
          onClose={() => setPendingRemove(null)}
        />
      ) : null}
    </div>
  );
}
