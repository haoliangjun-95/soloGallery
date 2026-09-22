"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { errorMessage, responseError } from "@/lib/fetch-error";
import type { AdminPhotoDTO, CategoryDTO } from "@/lib/types";
import { ConfirmDialog, PromptDialog } from "./ConfirmDialog";

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
  const [error, setError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [tagPrompt, setTagPrompt] = useState(false);

  const pages = Math.max(1, Math.ceil(total / pageSize));

  function toggle(id: number) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function patchPhoto(id: number, data: Record<string, unknown>) {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/photos/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      // 之前无论成败都只 refresh，失败时开关会静默弹回原状，用户以为是自己点错了
      if (!res.ok) {
        setError(await responseError(res));
        return;
      }
      router.refresh();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  async function batch(action: string, extra: Record<string, unknown> = {}) {
    if (!selected.size || busy) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/photos/batch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids: [...selected], action, ...extra }),
      });
      if (!res.ok) {
        setError(await responseError(res));
        return;
      }
      setSelected(new Set());
      router.refresh();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
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
            <ToolbarButton disabled={busy} onClick={() => batch("favorite")}>
              ★ 收藏
            </ToolbarButton>
            <ToolbarButton disabled={busy} onClick={() => batch("unfavorite")}>
              取消收藏
            </ToolbarButton>
            <ToolbarButton disabled={busy} onClick={() => setTagPrompt(true)}>
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
            <ToolbarButton danger disabled={busy} onClick={() => setConfirmDelete(true)}>
              删除
            </ToolbarButton>
          </>
        ) : null}
      </div>

      {error ? (
        <div className="mb-4 flex items-start gap-3 rounded-xl border border-red-500/40 bg-red-500/10 px-4 py-3 text-sm text-red-300">
          <span className="flex-1">{error}</span>
          <button type="button" onClick={() => setError(null)} className="leading-none hover:text-red-200" aria-label="关闭提示">
            ×
          </button>
        </div>
      ) : null}

      <div className="grid grid-cols-[repeat(auto-fill,minmax(200px,1fr))] gap-3">
        {items.map((photo) => (
          <div
            key={photo.id}
            className={`group relative rounded-xl overflow-hidden border bg-card ${
              selected.has(photo.id) ? "border-foreground/80 ring-2 ring-foreground/40" : "border-edge"
            }`}
          >
            <div className="relative aspect-square">
              <Link href={`/photo/${photo.sha1}`} target="_blank" className="block h-full">
                <img
                  src={photo.thumbUrl}
                  alt={photo.title}
                  loading="lazy"
                  className="w-full h-full object-cover"
                />
              </Link>

              {/* 左上：勾选 */}
              <label className="absolute top-2 left-2 flex items-center rounded-md bg-black/60 px-2 py-1 cursor-pointer">
                <input type="checkbox" checked={selected.has(photo.id)} onChange={() => toggle(photo.id)} />
              </label>

              {/* 右上：收藏 + 发布开关 */}
              <div className="absolute top-2 right-2 flex items-center gap-2 rounded-md bg-black/60 px-2 py-1">
                <button
                  type="button"
                  onClick={() => patchPhoto(photo.id, { favorite: !photo.favorite })}
                  disabled={busy}
                  title={photo.favorite ? "已收藏，点击取消" : "点击收藏"}
                  className={`leading-none ${photo.favorite ? "text-amber-400" : "text-white/50 hover:text-amber-300"} disabled:opacity-40`}
                >
                  ★
                </button>
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

              {/* 左下常显状态角标 */}
              <div className="absolute left-2 bottom-2 flex gap-1">
                {photo.missing ? <Badge color="amber">源缺失</Badge> : null}
                {!photo.published && !photo.missing ? <Badge>未发布</Badge> : null}
              </div>

              {/* 悬浮：编辑入口 */}
              <button
                type="button"
                onClick={() => setEditing(photo)}
                className="absolute right-2 bottom-2 rounded-md bg-black/60 px-2 py-1 text-xs text-white/90 hover:text-white opacity-0 group-hover:opacity-100 transition-opacity"
              >
                编辑
              </button>
            </div>

            {/* 图片下方紧凑信息：名称 / 分类 / 标签 */}
            <div className="px-2 py-1.5 space-y-0.5">
              <p className="text-xs truncate" title={photo.title}>
                {photo.title || photo.fileName}
              </p>
              <p className="text-[10px] text-muted truncate">
                {[photo.category, ...photo.tags.map((t) => `#${t}`)].filter(Boolean).join(" ") || "—"}
              </p>
            </div>
          </div>
        ))}
      </div>

      {items.length === 0 ? (
        <div className="py-24 text-center text-muted">
          没有符合条件的图片。调整筛选条件，或去 <Link href="/admin/sync" className="underline">同步</Link> /{" "}
          <Link href="/admin/upload" className="underline">上传</Link>。
        </div>
      ) : null}

      {editing ? <EditModal photo={editing} categories={categories} onClose={() => setEditing(null)} /> : null}

      {confirmDelete ? (
        <ConfirmDialog
          message={`确认删除选中的 ${selected.size} 张图片？（仅删除画廊记录和 display 变体）`}
          confirmLabel="删除"
          danger
          onConfirm={() => batch("delete")}
          onClose={() => setConfirmDelete(false)}
        />
      ) : null}

      {tagPrompt ? (
        <PromptDialog
          label="输入要给选中图片添加的标签（逗号分隔）"
          placeholder="风景, 城市"
          submitLabel="添加"
          onSubmit={async (input) => {
            const tags = input.split(/[,，]/).map((t) => t.trim()).filter(Boolean);
            if (tags.length) await batch("addTags", { tags });
          }}
          onClose={() => setTagPrompt(false)}
        />
      ) : null}
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
  const [error, setError] = useState<string | null>(null);

  // 详情字段（描述/标签/分类 id）需从服务端取
  useEffect(() => {
    let cancelled = false;
    void fetch(`/api/admin/photos/${photo.id}`)
      .then(async (r) => {
        if (!r.ok) {
          // 取不到详情时要说明，否则描述/标签空白会被当成「本来就没填」
          if (!cancelled) setError(await responseError(r, "无法读取图片详情"));
          return null;
        }
        return r.json();
      })
      .then((d) => {
        if (cancelled || !d) return;
        setDescription(d.description ?? "");
        setTags((d.tags ?? []).join(", "));
        setCategoryId(d.categoryId !== null && d.categoryId !== undefined ? String(d.categoryId) : "");
      })
      .catch((err) => {
        if (!cancelled) setError(errorMessage(err));
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
    setError(null);
    try {
      const res = await fetch(`/api/admin/photos/${photo.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title,
          description,
          categoryId: categoryId === "" ? null : Number(categoryId),
          tags: tags.split(/[,，]/).map((t) => t.trim()).filter(Boolean),
        }),
      });
      // 失败时保持弹窗打开并提示，避免用户以为已保存
      if (!res.ok) {
        setError(await responseError(res));
        return;
      }
      onClose();
      router.refresh();
    } catch (err) {
      setError(errorMessage(err));
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
        {error ? (
          <p className="rounded-lg border border-red-500/40 bg-red-500/10 px-3 py-2 text-xs text-red-300">{error}</p>
        ) : null}
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
