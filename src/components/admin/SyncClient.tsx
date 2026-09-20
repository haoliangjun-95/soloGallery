"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

interface SyncRunDTO {
  id: number;
  status: "RUNNING" | "DONE" | "ERROR";
  trigger: string;
  startedAt: string;
  finishedAt: string | null;
  newCount: number;
  updatedCount: number;
  missingCount: number;
  skippedCount: number;
  total: number;
  error: string | null;
}

interface MissingPhoto {
  id: number;
  title: string;
  sha1: string;
  fileName: string;
}

export default function SyncClient() {
  const [runs, setRuns] = useState<SyncRunDTO[]>([]);
  const [missing, setMissing] = useState<MissingPhoto[]>([]);
  const [triggering, setTriggering] = useState(false);

  const refresh = useCallback(async () => {
    const res = await fetch("/api/admin/sync");
    if (!res.ok) return;
    const data = await res.json();
    setRuns(data.runs ?? []);
    setMissing(data.missing ?? []);
  }, []);

  useEffect(() => {
    // 首轮延后一拍，避免 effect 体内同步 setState 的级联渲染
    const kickoff = setTimeout(() => void refresh(), 0);
    const timer = setInterval(() => void refresh(), 3000);
    return () => {
      clearTimeout(kickoff);
      clearInterval(timer);
    };
  }, [refresh]);

  async function trigger() {
    if (triggering) return;
    setTriggering(true);
    try {
      await fetch("/api/admin/sync", { method: "POST" });
      await refresh();
    } finally {
      setTimeout(() => setTriggering(false), 1000);
    }
  }

  const running = runs.some((r) => r.status === "RUNNING");

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={trigger}
          disabled={triggering || running}
          className="rounded-lg bg-foreground text-background px-4 py-2 text-sm font-medium disabled:opacity-40"
        >
          {running ? "同步进行中…" : "立即从桶同步"}
        </button>
        <span className="text-xs text-muted">
          解析 manifests → 归并 → 导入新图 → 补 display → 处理 tombstone（幂等，可随时重跑）
        </span>
      </div>

      {missing.length > 0 ? (
        <section className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-4">
          <h2 className="text-sm font-medium text-amber-300 mb-2">源已缺失（已自动下架）· {missing.length} 张</h2>
          <ul className="space-y-1 text-sm">
            {missing.map((m) => (
              <li key={m.id} className="flex items-center gap-2">
                <Link href={`/photo/${m.sha1}`} className="truncate hover:underline" target="_blank">
                  {m.title || m.fileName}
                </Link>
                <button
                  type="button"
                  className="text-xs text-muted hover:text-red-400"
                  onClick={async () => {
                    if (!confirm("从画廊删除该记录？")) return;
                    await fetch(`/api/admin/photos/${m.id}`, { method: "DELETE" });
                    void refresh();
                  }}
                >
                  删除记录
                </button>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <section>
        <h2 className="text-sm font-medium text-muted mb-2">最近同步</h2>
        <div className="overflow-x-auto rounded-xl border border-edge">
          <table className="w-full text-sm min-w-[640px]">
            <thead>
              <tr className="border-b border-edge text-left text-xs text-muted">
                <th className="px-3 py-2">时间</th>
                <th className="px-3 py-2">触发</th>
                <th className="px-3 py-2">状态</th>
                <th className="px-3 py-2">新增</th>
                <th className="px-3 py-2">更新</th>
                <th className="px-3 py-2">下架</th>
                <th className="px-3 py-2">跳过</th>
                <th className="px-3 py-2">存活总数</th>
              </tr>
            </thead>
            <tbody>
              {runs.map((r) => (
                <tr key={r.id} className="border-b border-edge last:border-0">
                  <td className="px-3 py-2 whitespace-nowrap">
                    {new Intl.DateTimeFormat("zh-CN", {
                      timeZone: "Asia/Shanghai",
                      month: "2-digit",
                      day: "2-digit",
                      hour: "2-digit",
                      minute: "2-digit",
                      second: "2-digit",
                      hour12: false,
                    }).format(new Date(r.startedAt))}
                  </td>
                  <td className="px-3 py-2">{r.trigger === "cron" ? "定时" : "手动"}</td>
                  <td className="px-3 py-2">
                    <span
                      className={
                        r.status === "DONE"
                          ? "text-emerald-400"
                          : r.status === "RUNNING"
                            ? "text-amber-400"
                            : "text-red-400"
                      }
                      title={r.error ?? undefined}
                    >
                      {r.status === "DONE" ? "完成" : r.status === "RUNNING" ? "进行中" : "失败"}
                    </span>
                  </td>
                  <td className="px-3 py-2">{r.newCount}</td>
                  <td className="px-3 py-2">{r.updatedCount}</td>
                  <td className="px-3 py-2">{r.missingCount}</td>
                  <td className="px-3 py-2">{r.skippedCount}</td>
                  <td className="px-3 py-2">{r.total}</td>
                </tr>
              ))}
              {runs.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-3 py-6 text-center text-muted">
                    还没有同步记录
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
