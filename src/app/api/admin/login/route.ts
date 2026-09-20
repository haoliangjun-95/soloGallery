import { NextRequest } from "next/server";
import { badRequest, json } from "@/lib/api";
import { ensureAdminUser, login } from "@/lib/auth";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null);
  const username = typeof body?.username === "string" ? body.username.trim() : "";
  const password = typeof body?.password === "string" ? body.password : "";
  if (!username || !password) return badRequest("用户名和密码必填");

  try {
    await ensureAdminUser();
  } catch (err) {
    return json({ error: `数据库不可用: ${err instanceof Error ? err.message : err}` }, 503);
  }

  const ok = await login(username, password);
  if (!ok) return json({ error: "用户名或密码错误" }, 401);
  return json({ ok: true });
}
