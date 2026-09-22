"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { errorMessage, responseError } from "@/lib/fetch-error";
import type { TagDTO } from "@/lib/types";
import { ConfirmDialog } from "./ConfirmDialog";

export default function TagsClient({ initial }: { initial: TagDTO[] }) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [pendingRemove, setPendingRemove] = useState<TagDTO | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function create(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim() || busy) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/tags", {
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

  async function remove(id: number) {
    setError(null);
    try {
      const res = await fetch(`/api/admin/tags/${id}`, { method: "DELETE" });
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

      {error ? (
        <div className="flex items-start gap-3 rounded-xl border border-red-500/40 bg-red-500/10 px-4 py-3 text-sm text-red-300">
          <span className="flex-1">{error}</span>
          <button type="button" onClick={() => setError(null)} className="leading-none hover:text-red-200" aria-label="关闭提示">
            ×
          </button>
        </div>
      ) : null}

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
