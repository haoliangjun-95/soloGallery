import "server-only";
import { prisma } from "../db";
import { displayKey, originalKey } from "../bucket-layout";
import { publicUrl } from "../config";
import { groupSimilar } from "../dhash";
import type { CommentAdminDTO, SimilarGroupDTO } from "../types";

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

/** 感知哈希覆盖率（相似页提示存量是否需要跑回填脚本）。 */
export async function countDhashCoverage(): Promise<{ total: number; hashed: number }> {
  const [total, hashed] = await Promise.all([
    prisma.photo.count({ where: { missing: false } }),
    prisma.photo.count({ where: { missing: false, dhash: { not: null } } }),
  ]);
  return { total, hashed };
}

/**
 * 相似照片分组（功能 15）：全量取带哈希的行 → groupSimilar 两两比对聚簇。
 * O(n²) 在 JS 层而非 SQL——汉明距离无索引可用，833 张 ≈ 35 万次 popcount
 * 毫秒级；万张量级再考虑按哈希前缀分桶预筛。missing 行不参与（清理对象是
 * 活着的近似图）。
 */
export async function listSimilarGroups(): Promise<SimilarGroupDTO[]> {
  const rows = await prisma.photo.findMany({
    where: { dhash: { not: null }, missing: false },
    select: {
      id: true,
      sha1: true,
      title: true,
      thumbKey: true,
      width: true,
      height: true,
      fileSize: true,
      favorite: true,
      published: true,
      shotAt: true,
      dhash: true,
    },
    orderBy: { id: "asc" },
  });
  return groupSimilar(
    rows.map((r) => ({
      id: r.id,
      dhash: r.dhash as string, // where 已排除 null；as 收敛 Prisma 可空联合
      favorite: r.favorite,
      width: r.width,
      height: r.height,
      fileSize: Number(r.fileSize),
    })),
  ).map((g) => ({
    keeperId: g.keeperId,
    members: g.members.map((m) => {
      const row = rows.find((r) => r.id === m.id)!;
      return {
        id: m.id,
        sha1: row.sha1,
        title: row.title,
        thumbUrl: row.thumbKey ? publicUrl(row.thumbKey) : publicUrl(displayKey(row.sha1)),
        width: m.width,
        height: m.height,
        fileSize: m.fileSize,
        favorite: m.favorite,
        published: row.published,
        shotAt: row.shotAt ? row.shotAt.toISOString() : null,
      };
    }),
  }));
}
