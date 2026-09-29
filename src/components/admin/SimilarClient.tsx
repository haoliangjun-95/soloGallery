"use client";

import { useState } from "react";
import type { SimilarGroupDTO } from "@/lib/types";
import { DHASH_SIMILAR_THRESHOLD } from "@/lib/dhash";
import { ConfirmDialog } from "./ConfirmDialog";
import ErrorBanner from "./ErrorBanner";
import { jsonInit, useAdminAction } from "./useAdminAction";

interface Props {
  groups: SimilarGroupDTO[];
}

/**
 * 相似照片（功能 15）：dHash 分组展示 + 勾选保留 → 批量删除未勾选。
 * 删除走既有 /api/admin/photos/batch（桶清理 display/grid 同一汇点），
 * 成功 router.refresh() 回流新分组。每组至少保留一张（删除按钮禁用兜底）。
 */
export default function SimilarClient({ groups }: Props) {
  const { busy, error, setError, run } = useAdminAction();
  const [pendingDelete, setPendingDelete] = useState<{ ids: number[]; keeperId: number } | null>(null);

  const totalMembers = groups.reduce((n, g) => n + g.members.length, 0);

  return (
    <div>
      <ErrorBanner error={error} onClose={() => setError(null)} className="mb-4" />
      <p className="mb-4 text-sm text-muted">
        共 <span className="text-foreground font-medium">{groups.length}</span> 组 · {totalMembers} 张照片参与 ·
        判定：64 位 dHash 汉明距离 ≤ {DHASH_SIMILAR_THRESHOLD}（同簇传递闭合，连拍序列会聚成一组）
      </p>

      {groups.length === 0 ? (
        <div className="rounded-2xl border border-edge bg-card px-6 py-16 text-center">
          <p className="text-base font-medium">没有发现相似照片</p>
          <p className="mt-2 text-sm text-muted">库里无近重复分组，或存量照片尚未回填感知哈希。</p>
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          {groups.map((g) => (
            <GroupCard
              key={g.keeperId}
              group={g}
              busy={busy}
              onRequestDelete={(ids) => setPendingDelete({ ids, keeperId: g.keeperId })}
            />
          ))}
        </div>
      )}

      {pendingDelete ? (
        <ConfirmDialog
          danger
          message={`确认删除 ${pendingDelete.ids.length} 张相似照片？\n桶内 display/网格变体将一并清理，操作不可撤销。`}
          confirmLabel="删除"
          onConfirm={async () => {
            // 失败不抛出：错误已在横幅（对齐 CommentsClient 的 ConfirmDialog 约定），
            // 对话框照常关闭、用户可重新点删除重试
            await run("/api/admin/photos/batch", jsonInit("POST", { action: "delete", ids: pendingDelete.ids }));
          }}
          onClose={() => setPendingDelete(null)}
        />
      ) : null}
    </div>
  );
}

interface GroupCardProps {
  group: SimilarGroupDTO;
  busy: boolean;
  onRequestDelete: (ids: number[]) => void;
}

/** 单个相似组：勾选保留（默认仅推荐保留者），删除按钮删组内全部未勾选。 */
function GroupCard({ group, busy, onRequestDelete }: GroupCardProps) {
  // key={keeperId} 挂载时初始化；删除后 refresh 回流成员缩减，keepIds 中的
  // 已删 id 自然落空（成员过滤基于当前 props），状态语义保持"保留意图"
  const [keepIds, setKeepIds] = useState<number[]>([group.keeperId]);

  const toggle = (id: number) => {
    setKeepIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  };
  const toDelete = group.members.filter((m) => !keepIds.includes(m.id));

  return (
    <section className="rounded-2xl border border-edge bg-card p-4" aria-label={`相似组 ${group.members.length} 张`}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-sm font-medium">
          {group.members.length} 张相似
          <span className="ml-2 font-normal text-muted">推荐规则：收藏 → 像素面积 → 文件大小</span>
        </h2>
        <button
          type="button"
          disabled={busy || toDelete.length === 0 || toDelete.length === group.members.length}
          onClick={() => onRequestDelete(toDelete.map((m) => m.id))}
          className="min-h-11 rounded-lg border border-red-500/40 bg-red-500/10 px-4 text-sm text-red-300 transition-colors hover:bg-red-500/20 disabled:opacity-40"
        >
          删除未勾选（{toDelete.length}）
        </button>
      </div>

      <div className="mt-3 flex flex-wrap gap-3">
        {group.members.map((m) => {
          const kept = keepIds.includes(m.id);
          const isKeeper = m.id === group.keeperId;
          return (
            <label
              key={m.id}
              className={`flex w-36 cursor-pointer flex-col gap-1.5 rounded-xl border p-2 transition-colors ${
                kept ? "border-[#f5b43c]/50 bg-[#f5b43c]/5" : "border-edge opacity-70 hover:opacity-100"
              }`}
            >
              {/* eslint-disable-next-line @next/next/no-img-element -- 直连 MinIO 公共读是设计决策 */}
              <img
                src={m.thumbUrl}
                alt={m.title}
                loading="lazy"
                className="h-28 w-full rounded-lg object-cover"
              />
              <span className="truncate text-xs font-medium" title={m.title}>
                {m.favorite ? "★ " : ""}
                {m.title}
              </span>
              <span className="text-[11px] text-muted">
                {m.width && m.height ? `${m.width}×${m.height}` : "尺寸未知"} ·{" "}
                {(m.fileSize / 1024 / 1024).toFixed(1)}MB{m.published ? "" : " · 未发布"}
              </span>
              <span className="flex items-center gap-1.5 text-xs">
                <input type="checkbox" checked={kept} onChange={() => toggle(m.id)} className="accent-[#f5b43c]" />
                保留
                {isKeeper ? (
                  <span className="rounded-full border border-[#f5b43c]/40 px-1.5 py-0.5 text-[10px] text-[#f5b43c]">
                    推荐
                  </span>
                ) : null}
              </span>
            </label>
          );
        })}
      </div>
    </section>
  );
}
