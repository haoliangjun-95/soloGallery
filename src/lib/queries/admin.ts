import "server-only";
import { prisma } from "../db";
import { originalKey } from "../bucket-layout";
import type { CommentAdminDTO } from "../types";

/** 未读评论数（待审/已通过且从未被后台查看过；垃圾拦截的不计）。 */
export async function countUnreadComments(): Promise<number> {
  return prisma.comment.count({
    where: { readAt: null, status: { in: ["PENDING", "APPROVED"] } },
  });
}

/** 后台打开评论页即视为已读：批量打标。 */
export async function markAllCommentsRead(): Promise<number> {
  const res = await prisma.comment.updateMany({
    where: { readAt: null, status: { in: ["PENDING", "APPROVED"] } },
    data: { readAt: new Date() },
  });
  return res.count;
}

export async function listCommentsAdmin(status?: "PENDING" | "APPROVED" | "SPAM"): Promise<CommentAdminDTO[]> {
  const rows = await prisma.comment.findMany({
    where: status ? { status } : undefined,
    orderBy: { createdAt: "desc" },
    take: 200,
    include: { photo: { select: { title: true, sha1: true } } },
  });
  return rows.map((c) => ({
    id: c.id,
    nickname: c.nickname,
    email: c.email,
    content: c.content,
    adminReply: c.adminReply,
    adminReplyAt: c.adminReplyAt ? c.adminReplyAt.toISOString() : null,
    createdAt: c.createdAt.toISOString(),
    status: c.status,
    ip: c.ip,
    photoTitle: c.photo.title,
    photoSha1: c.photo.sha1,
  }));
}

export function originalStorageKey(sha1: string): string {
  return originalKey(sha1);
}
