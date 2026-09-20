import "server-only";
import { cookies } from "next/headers";
import { getIronSession } from "iron-session";
import bcrypt from "bcryptjs";
import { prisma } from "./db";

export interface SessionData {
  id?: number;
  username?: string;
}

function sessionOptions() {
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
      secure: process.env.NODE_ENV === "production",
    },
  };
}

export async function getSession() {
  const cookieStore = await cookies();
  return getIronSession<SessionData>(cookieStore, sessionOptions());
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

/** 首次启动兜底：库里没有管理员时按环境变量创建（seed 脚本也会做）。 */
export async function ensureAdminUser(): Promise<void> {
  const count = await prisma.adminUser.count();
  if (count > 0) return;
  const username = process.env.ADMIN_USERNAME ?? "admin";
  const password = process.env.ADMIN_PASSWORD ?? "admin123456";
  await prisma.adminUser.create({
    data: { username, passwordHash: await bcrypt.hash(password, 10) },
  });
}
