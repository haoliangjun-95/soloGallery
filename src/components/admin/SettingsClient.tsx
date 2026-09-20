"use client";

import { useState } from "react";

interface SettingsShape {
  siteTitle: string;
  pageSize: string;
  commentsModerated: string;
  syncIntervalMinutes: string;
  syncAutoPublish: string;
  originalView: string;
}

export default function SettingsClient({ initial }: { initial: SettingsShape }) {
  const [form, setForm] = useState({
    siteTitle: initial.siteTitle,
    pageSize: initial.pageSize,
    commentsModerated: initial.commentsModerated === "true",
    syncIntervalMinutes: initial.syncIntervalMinutes,
    syncAutoPublish: initial.syncAutoPublish === "true",
    originalView: initial.originalView === "true",
  });
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setMessage(null);
    try {
      const res = await fetch("/api/admin/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? "保存失败");
      setMessage("已保存");
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "保存失败");
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={save} className="max-w-md space-y-5">
      <label className="block text-sm space-y-1">
        <span className="text-muted">站点标题</span>
        <input
          value={form.siteTitle}
          onChange={(e) => setForm({ ...form, siteTitle: e.target.value })}
          className="w-full rounded-lg bg-background border border-edge px-3 py-2 text-sm outline-none focus:border-foreground/40"
        />
      </label>

      <label className="block text-sm space-y-1">
        <span className="text-muted">每页图片数（1-96）</span>
        <input
          type="number"
          min={1}
          max={96}
          value={form.pageSize}
          onChange={(e) => setForm({ ...form, pageSize: e.target.value })}
          className="w-full rounded-lg bg-background border border-edge px-3 py-2 text-sm outline-none focus:border-foreground/40"
        />
      </label>

      <label className="flex items-center gap-3 text-sm">
        <input
          type="checkbox"
          checked={form.commentsModerated}
          onChange={(e) => setForm({ ...form, commentsModerated: e.target.checked })}
        />
        <span>
          评论先审后显
          <span className="block text-xs text-muted">
            默认关闭（自动通过）；命中反垃圾规则（敏感词/链接垃圾/重复刷屏/蜜罐/频控）的评论会被静默标记为垃圾，可在评论管理中处理
          </span>
        </span>
      </label>

      <label className="block text-sm space-y-1">
        <span className="text-muted">自动同步间隔（分钟，1-1440）</span>
        <input
          type="number"
          min={1}
          max={1440}
          value={form.syncIntervalMinutes}
          onChange={(e) => setForm({ ...form, syncIntervalMinutes: e.target.value })}
          className="w-full rounded-lg bg-background border border-edge px-3 py-2 text-sm outline-none focus:border-foreground/40"
        />
      </label>

      <label className="flex items-center gap-3 text-sm">
        <input
          type="checkbox"
          checked={form.syncAutoPublish}
          onChange={(e) => setForm({ ...form, syncAutoPublish: e.target.checked })}
        />
        <span>
          同步导入的图片自动发布
          <span className="block text-xs text-muted">关闭则导入后为「未发布」，需在图片管理中手动发布</span>
        </span>
      </label>

      <label className="flex items-center gap-3 text-sm">
        <input
          type="checkbox"
          checked={form.originalView}
          onChange={(e) => setForm({ ...form, originalView: e.target.checked })}
        />
        <span>
          允许查看原图
          <span className="block text-xs text-muted">
            开启后前台点击放大与「查看原图」下载均使用桶内无压缩原图；关闭则访客仅见压缩展示图（管理员仍可下载）
          </span>
        </span>
      </label>

      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={saving}
          className="rounded-lg bg-foreground text-background px-4 py-2 text-sm font-medium disabled:opacity-40"
        >
          {saving ? "保存中…" : "保存设置"}
        </button>
        {message ? <span className="text-sm text-muted">{message}</span> : null}
      </div>
    </form>
  );
}
