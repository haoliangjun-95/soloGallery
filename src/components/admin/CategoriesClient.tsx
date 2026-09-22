"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { errorMessage, responseError } from "@/lib/fetch-error";
import type { CategoryDTO } from "@/lib/types";
import { ConfirmDialog } from "./ConfirmDialog";

export default function CategoriesClient({ initial }: { initial: CategoryDTO[] }) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [renaming, setRenaming] = useState<Record<number, string>>({});
  const [pendingRemove, setPendingRemove] = useState<CategoryDTO | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function create(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim() || busy) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/categories", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim() }),
      });
      // 重名等 400 场景原来只清空输入框，看起来像添加成功了
      if (!res.ok) {
        setError(await responseError(res));
        return;
      }
      setName("");
      router.refresh();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  async function rename(id: number) {
    const newName = renaming[id]?.trim();
    if (!newName) return;
    setError(null);
    try {
      const res = await fetch(`/api/admin/categories/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: newName }),
      });
      if (!res.ok) {
        setError(await responseError(res));
        return;
      }
      setRenaming((prev) => ({ ...prev, [id]: "" }));
      router.refresh();
    } catch (err) {
      setError(errorMessage(err));
    }
  }

  async function remove(id: number) {
    setError(null);
    try {
      const res = await fetch(`/api/admin/categories/${id}`, { method: "DELETE" });
      if (!res.ok) {
        setError(await responseError(res));
        return;
      }
      router.refresh();
    } catch (err) {
      setError(errorMessage(err));
    }
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

      {error ? (
        <div className="flex items-start gap-3 rounded-xl border border-red-500/40 bg-red-500/10 px-4 py-3 text-sm text-red-300">
          <span className="flex-1">{error}</span>
          <button type="button" onClick={() => setError(null)} className="leading-none hover:text-red-200" aria-label="关闭提示">
            ×
          </button>
        </div>
      ) : null}

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
              disabled={!renaming[c.id]?.trim()}
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
