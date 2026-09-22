import "server-only";
import { cookies, headers } from "next/headers";
import { getIronSession } from "iron-session";
import bcrypt from "bcryptjs";
import { prisma } from "./db";

export interface SessionData {
  id?: number;
  username?: string;
}

function sessionOptions(secure: boolean) {
  const password = process.env.SESSION_SECRET;
  if (!password || password.length < 32) {
    throw new Error("SESSION_SECRET 未设置或不足 32 字符");
  }
  return {
    cookieName: "solog_session",
    password,
    ttl: 7 * 24 * 60 * 60,
    cookieOptions: {
      httpOnly: true,
      sameSite: "lax" as const,
      // Secure cookie 只在 HTTPS 下发：直连 http://IP:3000 时浏览器会拒收，
      // 否则登录成功但会话存不住，出现「正确密码却弹回登录页」。
      secure,
    },
  };
}

export async function getSession() {
  const cookieStore = await cookies();
  // 反代终止 TLS 时，上游 socket 永远是 http，须以 x-forwarded-proto 为准
  const forwardedProto = (await headers()).get("x-forwarded-proto")?.split(",")[0]?.trim();
  return getIronSession<SessionData>(cookieStore, sessionOptions(forwardedProto === "https"));
}

export async function isAdmin(): Promise<boolean> {
  const session = await getSession();
  return Boolean(session.username);
}

export async function login(username: string, password: string): Promise<boolean> {
  const user = await prisma.adminUser.findUnique({ where: { username } });
  if (!user) return false;
  const ok = await bcrypt.compare(password, user.passwordHash);
  if (!ok) return false;
  const session = await getSession();
  session.id = user.id;
  session.username = user.username;
  await session.save();
  return true;
}

export async function logout() {
  const session = await getSession();
  session.destroy();
}

/** 已登录管理员修改自己的密码：校验当前密码后更新哈希。 */
export async function changePassword(
  currentPassword: string,
  newPassword: string,
): Promise<{ ok: boolean; error?: string }> {
  const session = await getSession();
  if (!session.username || !session.id) return { ok: false, error: "未登录" };
  const user = await prisma.adminUser.findUnique({ where: { id: session.id } });
  if (!user || user.username !== session.username) return { ok: false, error: "账号不存在" };
  const ok = await bcrypt.compare(currentPassword, user.passwordHash);
  if (!ok) return { ok: false, error: "当前密码不正确" };
  await prisma.adminUser.update({
    where: { id: user.id },
    data: { passwordHash: await bcrypt.hash(newPassword, 10) },
  });
  return { ok: true };
}

/** 管理员初始化失败（配置缺失）——与「数据库不可用」区分，便于路由层给出可执行提示。 */
export class AdminBootstrapError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AdminBootstrapError";
  }
}

/** ADMIN_PASSWORD 最小长度 */
const MIN_ADMIN_PASSWORD_LENGTH = 8;

/**
 * 首次启动兜底：库里没有管理员时按环境变量创建（seed 脚本也会做）。
 * 不再回落到硬编码弱密码 —— 未配置 ADMIN_PASSWORD 时拒绝创建，
 * 否则公网部署会留下人人皆知的默认账号。
 */
export async function ensureAdminUser(): Promise<void> {
  const count = await prisma.adminUser.count();
  if (count > 0) return;
  const username = process.env.ADMIN_USERNAME ?? "admin";
  const password = process.env.ADMIN_PASSWORD;
  if (!password || password.length < MIN_ADMIN_PASSWORD_LENGTH) {
    throw new AdminBootstrapError(
      `尚未初始化管理员：请设置环境变量 ADMIN_PASSWORD（至少 ${MIN_ADMIN_PASSWORD_LENGTH} 位）后重启，或执行 npm run db:seed`,
    );
  }
  await prisma.adminUser.create({
    data: { username, passwordHash: await bcrypt.hash(password, 10) },
  });
}
