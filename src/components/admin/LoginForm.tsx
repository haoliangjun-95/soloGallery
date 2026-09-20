"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export default function LoginForm() {
  const router = useRouter();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (loading) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? "登录失败");
      router.replace("/admin/photos");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "登录失败");
      setLoading(false);
    }
  }

  return (
    <form onSubmit={submit} className="w-full max-w-sm space-y-4 rounded-2xl border border-edge bg-card p-8">
      <h1 className="text-lg font-semibold text-center">soloGallery 后台</h1>
      <input
        value={username}
        onChange={(e) => setUsername(e.target.value)}
        placeholder="用户名"
        autoComplete="username"
        required
        className="w-full rounded-lg bg-background border border-edge px-3 py-2 text-sm outline-none focus:border-foreground/40"
      />
      <input
        type="password"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        placeholder="密码"
        autoComplete="current-password"
        required
        className="w-full rounded-lg bg-background border border-edge px-3 py-2 text-sm outline-none focus:border-foreground/40"
      />
      {error ? <p className="text-sm text-red-400">{error}</p> : null}
      <button
        type="submit"
        disabled={loading || !username || !password}
        className="w-full rounded-lg bg-foreground text-background py-2 text-sm font-medium disabled:opacity-40 hover:opacity-90"
      >
        {loading ? "登录中…" : "登录"}
      </button>
    </form>
  );
}
