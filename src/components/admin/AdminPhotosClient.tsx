"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import type { AdminPhotoDTO, CategoryDTO } from "@/lib/types";

interface Props {
  items: AdminPhotoDTO[];
  total: number;
  page: number;
  pageSize: number;
  categories: CategoryDTO[];
}

export default function AdminPhotosClient({ items, total, page, pageSize, categories }: Props) {
  const router = useRouter();
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState<AdminPhotoDTO | null>(null);

  const allSelected = items.length > 0 && items.every((i) => selected.has(i.id));
  const pages = Math.max(1, Math.ceil(total / pageSize));

  function toggle(id: number) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleAll() {
    setSelected(allSelected ? new Set() : new Set(items.map((i) => i.id)));
  }

  async function patchPhoto(id: number, data: Record<string, unknown>) {
    setBusy(true);
    try {
      await fetch(`/api/admin/photos/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  async function batch(action: string, extra: Record<string, unknown> = {}) {
    if (!selected.size || busy) return;
    if (action === "delete" && !confirm(`确认删除选中的 ${selected.size} 张图片？（仅删除画廊记录和 display 变体）`))
      return;
    setBusy(true);
    try {
      await fetch("/api/admin/photos/batch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids: [...selected], action, ...extra }),
      });
      setSelected(new Set());
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  async function addTagToSelection() {
    const input = prompt("输入要给选中图片添加的标签（逗号分隔）");
    if (!input) return;
    const tags = input.split(/[,，]/).map((t) => t.trim()).filter(Boolean);
    if (tags.length) await batch("addTags", { tags });
  }

  async function moveCategory(categoryId: number | null) {
    await batch("setCategory", { categoryId });
  }

  return (
    <div>
      <div className="flex flex-wrap items-center gap-2 mb-4 text-sm">
        <span className="text-muted">
          共 {total} 张 · 第 {page}/{pages} 页
        </span>
        <div className="flex-1" />
        {selected.size > 0 ? (
          <>
            <span className="text-muted">已选 {selected.size} 张</span>
            <ToolbarButton disabled={busy} onClick={() => batch("publish")}>
              发布
            </ToolbarButton>
            <ToolbarButton disabled={busy} onClick={() => batch("unpublish")}>
              隐藏
            </ToolbarButton>
            <ToolbarButton disabled={busy} onClick={addTagToSelection}>
              加标签
            </ToolbarButton>
            <select
              className="rounded-lg border border-edge bg-background px-2 py-1.5 text-sm"
              defaultValue=""
              disabled={busy}
              onChange={(e) => {
                const v = e.target.value;
                if (v === "") return;
                void moveCategory(v === "__none" ? null : Number(v));
                e.target.value = "";
              }}
            >
              <option value="" disabled>
                移动到分类…
              </option>
              <option value="__none">（无分类）</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
            <ToolbarButton danger disabled={busy} onClick={() => batch("delete")}>
              删除
            </ToolbarButton>
          </>
        ) : null}
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-6 gap-3">
        {items.map((photo) => (
          <div
            key={photo.id}
            className={`relative rounded-xl overflow-hidden border bg-card ${
              selected.has(photo.id) ? "border-foreground/60" : "border-edge"
            }`}
          >
            <Link href={`/photo/${photo.sha1}`} target="_blank">
              <img
                src={photo.thumbUrl}
                alt={photo.title}
                loading="lazy"
                className="w-full h-40 object-cover"
              />
            </Link>
            <label className="absolute top-2 left-2 flex items-center gap-1 rounded-md bg-black/60 px-2 py-1 text-xs cursor-pointer">
              <input type="checkbox" checked={selected.has(photo.id)} onChange={() => toggle(photo.id)} />
            </label>
            <div className="absolute top-2 right-2">
              <input
                type="checkbox"
                role="switch"
                checked={photo.published}
                disabled={busy}
                title={photo.published ? "已发布，点击隐藏" : "未发布，点击发布"}
                onChange={(e) => patchPhoto(photo.id, { published: e.target.checked })}
                className="cursor-pointer accent-emerald-500"
              />
            </div>
            <div className="p-2">
              <p className="text-xs truncate" title={photo.title}>
                {photo.title || photo.fileName}
              </p>
              <div className="mt-1 flex flex-wrap items-center gap-1">
                {photo.missing ? <Badge color="amber">源缺失</Badge> : null}
                {!photo.published && !photo.missing ? <Badge>未发布</Badge> : null}
                <Badge>{photo.source === "SYNC" ? "同步" : "上传"}</Badge>
                {photo.category ? <Badge>{photo.category}</Badge> : null}
              </div>
              <button
                type="button"
                onClick={() => setEditing(photo)}
                className="mt-2 text-xs text-muted hover:text-foreground underline"
              >
                编辑
              </button>
            </div>
          </div>
        ))}
      </div>

      {items.length === 0 ? (
        <div className="py-24 text-center text-muted">
          没有图片。去 <Link href="/admin/sync" className="underline">同步</Link> 或{" "}
          <Link href="/admin/upload" className="underline">上传</Link>。
        </div>
      ) : null}

      <div className="flex justify-between mt-6 text-sm">
        {page > 1 ? (
          <Link href={`/admin/photos?page=${page - 1}`} className="text-muted hover:text-foreground">
            ← 上一页
          </Link>
        ) : (
          <span />
        )}
        {page < pages ? (
          <Link href={`/admin/photos?page=${page + 1}`} className="text-muted hover:text-foreground">
            下一页 →
          </Link>
        ) : (
          <span />
        )}
      </div>

      {editing ? <EditModal photo={editing} categories={categories} onClose={() => setEditing(null)} /> : null}
    </div>
  );
}

function ToolbarButton({
  children,
  onClick,
  disabled,
  danger,
}: {
  children: React.ReactNode;
  onClick: () => void;
  disabled?: boolean;
  danger?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`rounded-lg border px-3 py-1.5 transition-colors disabled:opacity-40 ${
        danger
          ? "border-red-500/40 text-red-400 hover:bg-red-500/10"
          : "border-edge text-muted hover:text-foreground"
      }`}
    >
      {children}
    </button>
  );
}

function Badge({ children, color }: { children: React.ReactNode; color?: "amber" }) {
  return (
    <span
      className={`rounded px-1.5 py-0.5 text-[10px] leading-4 ${
        color === "amber" ? "bg-amber-500/15 text-amber-300" : "bg-foreground/10 text-muted"
      }`}
    >
      {children}
    </span>
  );
}

function EditModal({
  photo,
  categories,
  onClose,
}: {
  photo: AdminPhotoDTO;
  categories: CategoryDTO[];
  onClose: () => void;
}) {
  const router = useRouter();
  const [title, setTitle] = useState(photo.title);
  const [description, setDescription] = useState("");
  const [categoryId, setCategoryId] = useState<string>("");
  const [tags, setTags] = useState("");
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);

  // 详情字段（描述/标签/分类 id）需从服务端取
  useEffect(() => {
    let cancelled = false;
    void fetch(`/api/admin/photos/${photo.id}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (cancelled || !d) return;
        setDescription(d.description ?? "");
        setTags((d.tags ?? []).join(", "));
        setCategoryId(d.categoryId !== null && d.categoryId !== undefined ? String(d.categoryId) : "");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [photo.id]);

  async function save() {
    setSaving(true);
    try {
      await fetch(`/api/admin/photos/${photo.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title,
          description,
          categoryId: categoryId === "" ? null : Number(categoryId),
          tags: tags.split(/[,，]/).map((t) => t.trim()).filter(Boolean),
        }),
      });
      onClose();
      router.refresh();
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-40 bg-black/70 flex items-center justify-center p-4" onClick={onClose}>
      <div
        className="w-full max-w-md rounded-2xl border border-edge bg-card p-5 space-y-4"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <h2 className="font-medium">编辑图片</h2>
          <button type="button" onClick={onClose} className="text-muted hover:text-foreground text-xl leading-none">
            ×
          </button>
        </div>
        <div>
          <img src={photo.thumbUrl} alt={photo.title} className="w-full h-44 object-cover rounded-lg" />
          <p className="mt-1 text-xs text-muted">{photo.fileName}</p>
        </div>
        <label className="block text-sm space-y-1">
          <span className="text-muted">命名</span>
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="w-full rounded-lg bg-background border border-edge px-3 py-2 text-sm outline-none focus:border-foreground/40"
          />
        </label>
        <label className="block text-sm space-y-1">
          <span className="text-muted">描述</span>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={3}
            disabled={loading}
            className="w-full rounded-lg bg-background border border-edge px-3 py-2 text-sm outline-none focus:border-foreground/40 resize-y"
          />
        </label>
        <label className="block text-sm space-y-1">
          <span className="text-muted">分类</span>
          <select
            value={categoryId}
            onChange={(e) => setCategoryId(e.target.value)}
            disabled={loading}
            className="w-full rounded-lg bg-background border border-edge px-3 py-2 text-sm"
          >
            <option value="">（无分类）</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </label>
        <label className="block text-sm space-y-1">
          <span className="text-muted">标签（逗号分隔，保存后整体替换）</span>
          <input
            value={tags}
            onChange={(e) => setTags(e.target.value)}
            disabled={loading}
            placeholder="风景, 城市"
            className="w-full rounded-lg bg-background border border-edge px-3 py-2 text-sm outline-none focus:border-foreground/40"
          />
        </label>
        <div className="flex justify-end gap-2">
          <button type="button" onClick={onClose} className="rounded-lg border border-edge px-4 py-2 text-sm text-muted hover:text-foreground">
            取消
          </button>
          <button
            type="button"
            onClick={save}
            disabled={saving}
            className="rounded-lg bg-foreground text-background px-4 py-2 text-sm font-medium disabled:opacity-40"
          >
            {saving ? "保存中…" : "保存"}
          </button>
        </div>
      </div>
    </div>
  );
}
