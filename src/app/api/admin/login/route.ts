import { NextRequest } from "next/server";
import { badRequest, json } from "@/lib/api";
import { AdminBootstrapError, ensureAdminUser, login } from "@/lib/auth";
import { clientIp, rateAllow } from "@/lib/ratelimit";

export const runtime = "nodejs";

/** 同一 IP 在窗口内允许的登录尝试次数 —— 阻断在线暴力破解 */
const LOGIN_ATTEMPT_LIMIT = 10;
const LOGIN_WINDOW_MS = 15 * 60 * 1000;

export async function POST(request: NextRequest) {
  const ip = clientIp(request.headers);
  // key 加 login: 前缀：限流桶是进程内共享 Map，避免与评论限流互相消耗额度
  if (!rateAllow(`login:${ip}`, LOGIN_ATTEMPT_LIMIT, LOGIN_WINDOW_MS)) {
    return json({ error: "尝试次数过多，请 15 分钟后再试" }, 429);
  }

  const body = await request.json().catch(() => null);
  const username = typeof body?.username === "string" ? body.username.trim() : "";
  const password = typeof body?.password === "string" ? body.password : "";
  if (!username || !password) return badRequest("用户名和密码必填");

  try {
    await ensureAdminUser();
  } catch (err) {
    // 配置类错误要把可执行提示透出；其余（DB 连接等）只给笼统信息，避免泄露内部细节
    if (err instanceof AdminBootstrapError) return json({ error: err.message }, 503);
    return json({ error: "数据库不可用，请稍后再试" }, 503);
  }

  const ok = await login(username, password);
  if (!ok) return json({ error: "用户名或密码错误" }, 401);
  return json({ ok: true });
}
