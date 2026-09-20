import { NextRequest } from "next/server";
import { badRequest, guardAdmin, json } from "@/lib/api";
import { changePassword } from "@/lib/auth";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  const denied = await guardAdmin();
  if (denied) return denied;
  const body = (await request.json().catch(() => null)) as {
    currentPassword?: unknown;
    newPassword?: unknown;
  } | null;
  const currentPassword = typeof body?.currentPassword === "string" ? body.currentPassword : "";
  const newPassword = typeof body?.newPassword === "string" ? body.newPassword : "";
  if (!currentPassword) return badRequest("请输入当前密码");
  if (newPassword.length < 8 || newPassword.length > 72) {
    return badRequest("新密码长度须为 8-72 位");
  }
  const result = await changePassword(currentPassword, newPassword);
  if (!result.ok) return badRequest(result.error ?? "修改失败");
  return json({ ok: true });
}
