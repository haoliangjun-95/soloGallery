"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import type { TagDTO } from "@/lib/types";

export default function TagsClient({ initial }: { initial: TagDTO[] }) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);

  async function create(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim() || busy) return;
    setBusy(true);
    try {
      await fetch("/api/admin/tags", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim() }),
      });
      setName("");
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  async function remove(id: number, name: string) {
    if (!confirm(`确认删除标签「${name}」？会从所有图片上移除。`)) return;
    await fetch(`/api/admin/tags/${id}`, { method: "DELETE" });
    router.refresh();
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

      <div className="flex flex-wrap gap-2">
        {initial.map((t) => (
          <span key={t.id} className="group inline-flex items-center gap-2 rounded-full border border-edge px-3 py-1 text-sm">
            #{t.name}
            <span className="text-xs text-muted">{t.count}</span>
            <button
              type="button"
              onClick={() => remove(t.id, t.name)}
              className="text-muted hover:text-red-400"
              aria-label={`删除标签 ${t.name}`}
            >
              ×
            </button>
          </span>
        ))}
        {initial.length === 0 ? <p className="text-sm text-muted">暂无标签</p> : null}
      </div>
    </div>
  );
}
