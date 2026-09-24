"use client";

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { errorMessage, responseError } from "@/lib/fetch-error";

interface SettingsShape {
  siteTitle: string;
  siteLogo: string;
  pageSize: string;
  commentsModerated: string;
  syncIntervalMinutes: string;
  syncAutoPublish: string;
  originalView: string;
  exposeGps: string;
  /** 评论 IM 通知（功能 14）："" 关闭 | "serverchan" | "telegram" */
  notifyProvider: string;
  notifyWebhookUrl: string;
  /** telegram 专用 chat_id；serverchan 忽略 */
  notifyChatId: string;
}

export default function SettingsClient({ initial }: { initial: SettingsShape }) {
  const router = useRouter();
  const [form, setForm] = useState({
    siteTitle: initial.siteTitle,
    pageSize: initial.pageSize,
    commentsModerated: initial.commentsModerated === "true",
    syncIntervalMinutes: initial.syncIntervalMinutes,
    syncAutoPublish: initial.syncAutoPublish === "true",
    originalView: initial.originalView === "true",
    exposeGps: initial.exposeGps === "true",
    notifyProvider: initial.notifyProvider,
    notifyWebhookUrl: initial.notifyWebhookUrl,
    notifyChatId: initial.notifyChatId,
  });
  const [logo, setLogo] = useState(initial.siteLogo);
  const [logoBusy, setLogoBusy] = useState(false);
  const [logoError, setLogoError] = useState<string | null>(null);
  const logoInputRef = useRef<HTMLInputElement>(null);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [pwd, setPwd] = useState({ current: "", next: "", confirm: "" });
  const [pwdBusy, setPwdBusy] = useState(false);
  const [pwdMessage, setPwdMessage] = useState<{ ok: boolean; text: string } | null>(null);

  async function uploadLogo(file: File) {
    setLogoBusy(true);
    setLogoError(null);
    try {
      const body = new FormData();
      body.append("file", file);
      const res = await fetch("/api/admin/logo", { method: "POST", body });
      // 原来用原生 alert，风格不统一且会阻塞；改成表单内提示
      if (!res.ok) {
        setLogoError(await responseError(res, "上传失败"));
        return;
      }
      const data = (await res.json()) as { logo?: string };
      setLogo(data.logo ?? "");
      router.refresh();
    } catch (err) {
      setLogoError(errorMessage(err));
    } finally {
      setLogoBusy(false);
    }
  }

  async function removeLogo() {
    setLogoBusy(true);
    setLogoError(null);
    try {
      const res = await fetch("/api/admin/logo", { method: "DELETE" });
      if (!res.ok) {
        setLogoError(await responseError(res, "移除失败"));
        return;
      }
      setLogo("");
      router.refresh();
    } catch (err) {
      setLogoError(errorMessage(err));
    } finally {
      setLogoBusy(false);
    }
  }

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

  async function changePassword(e: React.FormEvent) {
    e.preventDefault();
    setPwdMessage(null);
    if (pwd.next !== pwd.confirm) {
      setPwdMessage({ ok: false, text: "两次输入的新密码不一致" });
      return;
    }
    setPwdBusy(true);
    try {
      const res = await fetch("/api/admin/password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ currentPassword: pwd.current, newPassword: pwd.next }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? "修改失败");
      setPwd({ current: "", next: "", confirm: "" });
      setPwdMessage({ ok: true, text: "密码已更新" });
    } catch (err) {
      setPwdMessage({ ok: false, text: err instanceof Error ? err.message : "修改失败" });
    } finally {
      setPwdBusy(false);
    }
  }

  return (
    <div className="max-w-md">
      <form onSubmit={save} className="space-y-5">
      <div className="text-sm space-y-2">
        <span className="text-muted">站点 Logo（显示在站点名称左侧）</span>
        <div className="flex items-center gap-3">
          {logo ? (
            <img src={logo} alt="logo" className="h-12 w-12 rounded-full border border-edge object-cover" />
          ) : (
            <div className="h-12 w-12 rounded-lg border border-dashed border-edge flex items-center justify-center text-muted text-xs">
              无
            </div>
          )}
          <div className="flex gap-2">
            <button
              type="button"
              disabled={logoBusy}
              onClick={() => logoInputRef.current?.click()}
              className="rounded-lg border border-edge px-3 py-1.5 text-xs text-muted hover:text-foreground disabled:opacity-40"
            >
              {logoBusy ? "处理中…" : logo ? "更换" : "上传"}
            </button>
            {logo ? (
              <button
                type="button"
                disabled={logoBusy}
                onClick={removeLogo}
                className="rounded-lg border border-red-500/40 px-3 py-1.5 text-xs text-red-400 hover:bg-red-500/10 disabled:opacity-40"
              >
                移除
              </button>
            ) : null}
          </div>
          <input
            ref={logoInputRef}
            type="file"
            accept="image/png,image/jpeg,image/webp,image/svg+xml"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void uploadLogo(f);
              e.target.value = "";
            }}
          />
        </div>
        {logoError ? (
          <p className="rounded-lg border border-red-500/40 bg-red-500/10 px-3 py-2 text-xs text-red-300">{logoError}</p>
        ) : null}
      </div>

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

      <label className="flex items-center gap-3 text-sm">
        <input
          type="checkbox"
          checked={form.exposeGps}
          onChange={(e) => setForm({ ...form, exposeGps: e.target.checked })}
        />
        <span>
          公开照片 GPS 位置
          <span className="block text-xs text-muted">
            关闭后前台页面与公开 API 不再展示 EXIF 中的 GPS 坐标与地名（管理端仍可见）。注意：若同时开启「允许查看原图」，原图文件字节自带 EXIF，仍可被读取到位置信息
          </span>
        </span>
      </label>

      {/* 评论 IM 通知（功能 14）。选项值与 lib/notify.ts NOTIFY_PROVIDERS 对齐
          （UI 刻意不 import——避免把含 fetch 副作用的模块拉进客户端包；
          服务端 settings API 以 parseNotifyProvider 白名单校验兜底） */}
      <div className="space-y-3 border-t border-edge pt-5">
        <label className="block space-y-1 text-sm">
          <span className="text-muted">评论 IM 通知</span>
          <select
            value={form.notifyProvider}
            onChange={(e) => setForm({ ...form, notifyProvider: e.target.value })}
            className="w-full rounded-lg bg-background border border-edge px-3 py-2 text-sm outline-none focus:border-foreground/40"
          >
            <option value="">关闭</option>
            <option value="serverchan">Server酱（微信）</option>
            <option value="telegram">Telegram Bot</option>
          </select>
        </label>
        {form.notifyProvider ? (
          <>
            <label className="block space-y-1 text-sm">
              <span className="text-muted">Webhook URL</span>
              <input
                type="url"
                placeholder={
                  form.notifyProvider === "telegram"
                    ? "https://api.telegram.org/bot<token>/sendMessage"
                    : "https://sctapi.ftqq.com/<SendKey>.send"
                }
                value={form.notifyWebhookUrl}
                onChange={(e) => setForm({ ...form, notifyWebhookUrl: e.target.value })}
                className="w-full rounded-lg bg-background border border-edge px-3 py-2 text-sm outline-none focus:border-foreground/40"
              />
            </label>
            {form.notifyProvider === "telegram" ? (
              <label className="block space-y-1 text-sm">
                <span className="text-muted">Chat ID</span>
                <input
                  value={form.notifyChatId}
                  onChange={(e) => setForm({ ...form, notifyChatId: e.target.value })}
                  placeholder="如 -1001234567890（频道/群组为负数）"
                  className="w-full rounded-lg bg-background border border-edge px-3 py-2 text-sm outline-none focus:border-foreground/40"
                />
              </label>
            ) : null}
            <p className="text-xs text-muted">
              有新评论（含待审核）入库时推送一条即时提醒；推送失败仅记服务端日志，不影响评论提交
            </p>
          </>
        ) : null}
      </div>

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

      <section className="mt-10 border-t border-edge pt-6">
        <h2 className="mb-1 text-sm font-medium">修改密码</h2>
        <p className="mb-4 text-xs text-muted">修改后当前登录保持有效，下次登录请使用新密码</p>
        <form onSubmit={changePassword} className="space-y-3">
          <label className="block text-sm space-y-1">
            <span className="text-muted">当前密码</span>
            <input
              type="password"
              autoComplete="current-password"
              required
              value={pwd.current}
              onChange={(e) => setPwd({ ...pwd, current: e.target.value })}
              className="w-full rounded-lg bg-background border border-edge px-3 py-2 text-sm outline-none focus:border-foreground/40"
            />
          </label>
          <label className="block text-sm space-y-1">
            <span className="text-muted">新密码（8-72 位）</span>
            <input
              type="password"
              autoComplete="new-password"
              required
              minLength={8}
              maxLength={72}
              value={pwd.next}
              onChange={(e) => setPwd({ ...pwd, next: e.target.value })}
              className="w-full rounded-lg bg-background border border-edge px-3 py-2 text-sm outline-none focus:border-foreground/40"
            />
          </label>
          <label className="block text-sm space-y-1">
            <span className="text-muted">确认新密码</span>
            <input
              type="password"
              autoComplete="new-password"
              required
              minLength={8}
              maxLength={72}
              value={pwd.confirm}
              onChange={(e) => setPwd({ ...pwd, confirm: e.target.value })}
              className="w-full rounded-lg bg-background border border-edge px-3 py-2 text-sm outline-none focus:border-foreground/40"
            />
          </label>
          <div className="flex items-center gap-3">
            <button
              type="submit"
              disabled={pwdBusy}
              className="rounded-lg border border-edge px-4 py-2 text-sm font-medium hover:bg-foreground/5 disabled:opacity-40"
            >
              {pwdBusy ? "提交中…" : "更新密码"}
            </button>
            {pwdMessage ? (
              <span className={`text-sm ${pwdMessage.ok ? "text-emerald-400" : "text-red-400"}`}>
                {pwdMessage.text}
              </span>
            ) : null}
          </div>
        </form>
      </section>
    </div>
  );
}
