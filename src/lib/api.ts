import "server-only";
import { NextResponse } from "next/server";
import { isAdmin } from "./auth";

export function json(data: unknown, status = 200) {
  return NextResponse.json(data as object, { status });
}

export function badRequest(message: string, details?: unknown) {
  return NextResponse.json({ error: message, details }, { status: 400 });
}

export async function guardAdmin(): Promise<NextResponse | null> {
  if (!(await isAdmin())) {
    return NextResponse.json({ error: "未登录" }, { status: 401 });
  }
  return null;
}

/**
 * Prisma P2025：update/delete 的目标记录不存在。
 * 这类请求是客户端拿了过期 id，属于 404，不该冒成 500。
 */
export function isPrismaNotFound(err: unknown): boolean {
  return typeof err === "object" && err !== null && (err as { code?: unknown }).code === "P2025";
}
