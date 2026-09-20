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
