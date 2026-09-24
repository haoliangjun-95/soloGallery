"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { errorMessage, responseError } from "@/lib/fetch-error";
import { patchById } from "@/lib/optimistic";
import type { AdminPhotoDTO, CategoryDTO } from "@/lib/types";
import { ConfirmDialog, PromptDialog } from "./ConfirmDialog";
import ErrorBanner from "./ErrorBanner";
import { jsonInit, useAdminAction } from "./useAdminAction";

interface Props {
  items: AdminPhotoDTO[];
  total: number;
  page: number;
  pageSize: number;
  categories: CategoryDTO[];
}

export default function AdminPhotosClient({ items, total, page, pageSize, categories }: Props) {
  const { busy, error, setError, run } = useAdminAction();
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [editing, setEditing] = useState<AdminPhotoDTO | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [tagPrompt, setTagPrompt] = useState(false);
  /** 乐观更新的行级 pending：只禁目标照片的 ★/开关，不再全局 busy 冻结整格 */
  const [pendingIds, setPendingIds] = useState<Set<number>>(new Set());
  // 本地镜像（功能 9 乐观更新）：★/发布翻转立即生效；router.refresh() 回流新
  // items 引用时重置——React 官方「prop 变化时渲染期调整 state」模式
  // （放 effect 会级联渲染并挂 react-hooks/set-state-in-effect）
  const [photos, setPhotos] = useState(items);
  const [syncedItems, setSyncedItems] = useState(items);
  if (items !== syncedItems) {
    setSyncedItems(items);
    setPhotos(items);
  }

  const pages = Math.max(1, Math.ceil(total / pageSize));

  function toggle(id: number) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  /**
   * 乐观单行翻转（★ 收藏 / 发布开关）：本地立即生效，失败以反向补丁只回滚本行
   * ——函数式回滚不 clobber 其它 in-flight 行的中间态；错误经 hook 进 ErrorBanner
   * （此前失败时开关静默弹回原状，用户以为是自己点错了）。成功后仍 refresh 回流
   * 服务端真值兜底一致性。
   */
  async function togglePhoto(id: number, patch: Partial<AdminPhotoDTO>, rollback: Partial<AdminPhotoDTO>) {
    if (busy || pendingIds.has(id)) return;
    setPhotos((prev) => patchById(prev, id, patch));
    setPendingIds((prev) => new Set(prev).add(id));
    const ok = await run(`/api/admin/photos/${id}`, jsonInit("PATCH", patch), { quiet: true });
    setPendingIds((prev) => {
      const next = new Set(prev);
      next.delete(id);
      return next;
    });
    if (!ok) setPhotos((prev) => patchById(prev, id, rollback));
  }

  async function batch(action: string, extra: Record<string, unknown> = {}) {
    if (!selected.size || busy) return;
    // 批量涉及多行且动作多样（含删除），不做乐观——保持全局 busy 门 + refresh
    await run("/api/admin/photos/batch", jsonInit("POST", { ids: [...selected], action, ...extra }), {
      onSuccess: () => setSelected(new Set()),
    });
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

      <ErrorBanner error={error} onClose={() => setError(null)} className="mb-4" />

      <div className="grid grid-cols-[repeat(auto-fill,minmax(200px,1fr))] gap-3">
        {photos.map((photo) => (
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
                  onClick={() => togglePhoto(photo.id, { favorite: !photo.favorite }, { favorite: photo.favorite })}
                  disabled={busy || pendingIds.has(photo.id)}
                  title={photo.favorite ? "已收藏，点击取消" : "点击收藏"}
                  className={`leading-none ${photo.favorite ? "text-amber-400" : "text-white/50 hover:text-amber-300"} disabled:opacity-40`}
                >
                  ★
                </button>
                <input
                  type="checkbox"
                  role="switch"
                  checked={photo.published}
                  disabled={busy || pendingIds.has(photo.id)}
                  title={photo.published ? "已发布，点击隐藏" : "未发布，点击发布"}
                  onChange={(e) => togglePhoto(photo.id, { published: e.target.checked }, { published: photo.published })}
                  className="cursor-pointer accent-emerald-500"
                />
              </div>

              {/* 左下常显状态角标 */}
              <div className="absolute left-2 bottom-2 flex gap-1">
                {photo.missing ? <Badge color="amber">源缺失</Badge> : null}
                {!photo.published && !photo.missing ? <Badge>未发布</Badge> : null}
              </div>

              {/* 编辑入口：仅精确指针设备默认隐藏（悬浮/聚焦显现）；
                  触屏无 hover 必须常显，键盘 Tab 聚焦也要可见（同 PhotoGrid 信息浮层的先例） */}
              <button
                type="button"
                onClick={() => setEditing(photo)}
                className="absolute right-2 bottom-2 rounded-md bg-black/60 px-2 py-1 text-xs text-white/90 hover:text-white opacity-100 [@media(hover:hover)_and_(pointer:fine)]:opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 transition-opacity"
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

      {photos.length === 0 ? (
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
  // busy 即「保存中」：加载详情的 GET 不走 run（有独立 loading/loadFailed 态），
  // hook 的 busy 只由 save() 驱动。error 双源共用——加载失败写 setError 进同一
  // 紧凑错误框（run 开始时 setError(null) 恰好清掉陈旧加载错误，语义正确）
  const { busy: saving, error, setError, run } = useAdminAction();
  const [title, setTitle] = useState(photo.title);
  const [description, setDescription] = useState("");
  const [categoryId, setCategoryId] = useState<string>("");
  const [tags, setTags] = useState("");
  const [loading, setLoading] = useState(true);
  // 详情加载失败同样禁止保存：此时描述/标签/分类还是空初始值，放行等于
  // 把库中已有数据以空值整体替换——与「加载中」是同一条数据丢失路径
  const [loadFailed, setLoadFailed] = useState(false);

  // 详情字段（描述/标签/分类 id）需从服务端取
  useEffect(() => {
    let cancelled = false;
    void fetch(`/api/admin/photos/${photo.id}`)
      .then(async (r) => {
        if (!r.ok) {
          // 取不到详情时要说明，否则描述/标签空白会被当成「本来就没填」
          if (!cancelled) {
            setError(await responseError(r, "无法读取图片详情"));
            setLoadFailed(true);
          }
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
        if (!cancelled) {
          setError(errorMessage(err));
          setLoadFailed(true);
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
    // setError 是 hook 透传的 useState setter，引用恒定——eslint 无法跨自定义
    // hook 证明稳定性，显式列入 deps 消警告且行为不变
  }, [photo.id, setError]);

  async function save() {
    // 失败时 hook 已写 error 且不调 onSuccess——弹窗保持打开并提示，避免用户
    // 以为已保存；成功后 onClose + refresh（hook 内）与旧行为逐帧一致
    await run(
      `/api/admin/photos/${photo.id}`,
      jsonInit("PATCH", {
        title,
        description,
        categoryId: categoryId === "" ? null : Number(categoryId),
        tags: tags.split(/[,，]/).map((t) => t.trim()).filter(Boolean),
      }),
      { onSuccess: onClose },
    );
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
            disabled={loading || loadFailed}
            className="w-full rounded-lg bg-background border border-edge px-3 py-2 text-sm outline-none focus:border-foreground/40 resize-y"
          />
        </label>
        <label className="block text-sm space-y-1">
          <span className="text-muted">分类</span>
          <select
            value={categoryId}
            onChange={(e) => setCategoryId(e.target.value)}
            disabled={loading || loadFailed}
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
            disabled={loading || loadFailed}
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
            // 详情未成功加载不允许保存（含加载失败）：保存语义是整体替换，
            // 此时提交会把服务端已有的描述/标签/分类以空值抹掉（数据丢失）
            disabled={saving || loading || loadFailed}
            className="rounded-lg bg-foreground text-background px-4 py-2 text-sm font-medium disabled:opacity-40"
          >
            {saving ? "保存中…" : loading ? "加载中…" : loadFailed ? "读取详情失败" : "保存"}
          </button>
        </div>
      </div>
    </div>
  );
}
