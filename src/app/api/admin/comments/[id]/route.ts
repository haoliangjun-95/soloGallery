import { NextRequest } from "next/server";
import { badRequest, guardAdmin, isPrismaNotFound, json } from "@/lib/api";
import { prisma } from "@/lib/db";

export const runtime = "nodejs";

type Params = { params: Promise<{ id: string }> };

export async function PATCH(request: NextRequest, { params }: Params) {
  const denied = await guardAdmin();
  if (denied) return denied;
  const { id } = await params;
  const commentId = Number(id);
  if (!Number.isInteger(commentId)) return badRequest("非法 id");
  const body = await request.json().catch(() => null);

  const data: Record<string, unknown> = {};
  if (body?.status === "PENDING" || body?.status === "APPROVED" || body?.status === "SPAM") {
    data.status = body.status;
  }
  if (typeof body?.adminReply === "string") {
    const reply = body.adminReply.trim().slice(0, 2000);
    data.adminReply = reply || null;
    data.adminReplyAt = reply ? new Date() : null;
  }
  if (!Object.keys(data).length) return badRequest("无可更新字段");

  try {
    const comment = await prisma.comment.update({ where: { id: commentId }, data });
    return json({ ok: true, comment: { id: comment.id, status: comment.status } });
  } catch (err) {
    if (isPrismaNotFound(err)) return json({ error: "评论不存在" }, 404);
    throw err;
  }
}

export async function DELETE(_request: NextRequest, { params }: Params) {
  const denied = await guardAdmin();
  if (denied) return denied;
  const { id } = await params;
  const commentId = Number(id);
  if (!Number.isInteger(commentId)) return badRequest("非法 id");
  try {
    await prisma.comment.delete({ where: { id: commentId } });
  } catch (err) {
    if (isPrismaNotFound(err)) return json({ error: "评论不存在" }, 404);
    throw err;
  }
  return json({ ok: true });
}
