"use client";

import { useState } from "react";
import type { CategoryDTO } from "@/lib/types";
import { ConfirmDialog } from "./ConfirmDialog";
import ErrorBanner from "./ErrorBanner";
import { jsonInit, useAdminAction } from "./useAdminAction";

export default function CategoriesClient({ initial }: { initial: CategoryDTO[] }) {
  const { busy, error, setError, run } = useAdminAction();
  const [name, setName] = useState("");
  const [renaming, setRenaming] = useState<Record<number, string>>({});
  const [pendingRemove, setPendingRemove] = useState<CategoryDTO | null>(null);

  // 创建/重命名不做乐观：新行需要服务端生成的 id/计数，重命名低频且行内即确认。
  // 重名等 400 场景原来只清空输入框、看起来像添加成功了——现在错误进 ErrorBanner
  async function create(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim() || busy) return;
    await run("/api/admin/categories", jsonInit("POST", { name: name.trim() }), {
      onSuccess: () => setName(""),
    });
  }

  // rename 经 hook 补上此前缺失的 busy 门（原实现行内重命名双击可重复发 PATCH）；
  // remove 的 ConfirmDialog 已自带 busy 门，hook 是第二层纵深防御
  async function rename(id: number) {
    const newName = renaming[id]?.trim();
    if (!newName || busy) return;
    await run(`/api/admin/categories/${id}`, jsonInit("PATCH", { name: newName }), {
      onSuccess: () => setRenaming((prev) => ({ ...prev, [id]: "" })),
    });
  }

  async function remove(id: number) {
    await run(`/api/admin/categories/${id}`, { method: "DELETE" });
  }

  return (
    <div className="space-y-6">
      <form onSubmit={create} className="flex gap-2">
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="新分类名称"
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

      <ul className="divide-y divide-edge">
        {initial.map((c) => (
          <li key={c.id} className="flex items-center gap-3 py-3 text-sm">
            <span className="w-40 truncate">{c.name}</span>
            <span className="text-xs text-muted">{c.count} 张</span>
            <input
              value={renaming[c.id] ?? ""}
              onChange={(e) => setRenaming((prev) => ({ ...prev, [c.id]: e.target.value }))}
              placeholder="重命名…"
              className="flex-1 max-w-[200px] rounded-lg bg-background border border-edge px-2 py-1 text-xs"
            />
            <button
              type="button"
              onClick={() => rename(c.id)}
              disabled={busy || !renaming[c.id]?.trim()}
              className="text-muted hover:text-foreground disabled:opacity-30"
            >
              保存
            </button>
            <button type="button" onClick={() => setPendingRemove(c)} className="text-red-400 hover:text-red-300">
              删除
            </button>
          </li>
        ))}
        {initial.length === 0 ? <li className="py-6 text-sm text-muted">暂无分类</li> : null}
      </ul>

      {pendingRemove ? (
        <ConfirmDialog
          message={`确认删除分类「${pendingRemove.name}」？分类下的图片不会被删除（变为无分类）。`}
          confirmLabel="删除"
          danger
          onConfirm={() => remove(pendingRemove.id)}
          onClose={() => setPendingRemove(null)}
        />
      ) : null}
    </div>
  );
}
