import { NextRequest } from "next/server";
import { badRequest, guardAdmin, json } from "@/lib/api";
import { displayKey } from "@/lib/bucket-layout";
import { prisma } from "@/lib/db";
import { deleteKey } from "@/lib/s3";

export const runtime = "nodejs";

type BatchAction = "publish" | "unpublish" | "delete" | "setCategory" | "addTags" | "removeTags";

export async function POST(request: NextRequest) {
  const denied = await guardAdmin();
  if (denied) return denied;

  const body = await request.json().catch(() => null);
  const ids: unknown = body?.ids;
  const action: unknown = body?.action;
  if (!Array.isArray(ids) || !ids.every((v) => Number.isInteger(v)) || !ids.length)
    return badRequest("ids 必须为非空整数数组");
  const photoIds = (ids as number[]).slice(0, 500);

  switch (action as BatchAction) {
    case "publish":
      await prisma.photo.updateMany({ where: { id: { in: photoIds } }, data: { published: true, missing: false } });
      break;
    case "unpublish":
      await prisma.photo.updateMany({ where: { id: { in: photoIds } }, data: { published: false } });
      break;
    case "delete": {
      const photos = await prisma.photo.findMany({ where: { id: { in: photoIds } }, select: { sha1: true } });
      await prisma.photo.deleteMany({ where: { id: { in: photoIds } } });
      for (const p of photos) {
        await deleteKey(displayKey(p.sha1)).catch(() => undefined);
      }
      break;
    }
    case "setCategory": {
      const categoryId = body?.categoryId ?? null;
      if (categoryId !== null && !Number.isInteger(categoryId)) return badRequest("categoryId 非法");
      await prisma.photo.updateMany({ where: { id: { in: photoIds } }, data: { categoryId } });
      break;
    }
    case "addTags": {
      const names: string[] = Array.isArray(body?.tags)
        ? body.tags.filter((t: unknown) => typeof t === "string" && t.trim()).map((t: string) => t.trim().slice(0, 64))
        : [];
      if (!names.length) return badRequest("tags 必填");
      for (const name of names) {
        const tag = await prisma.tag.upsert({ where: { name }, update: {}, create: { name } });
        await prisma.photoTag.createMany({
          data: photoIds.map((photoId) => ({ photoId, tagId: tag.id })),
          skipDuplicates: true,
        });
      }
      break;
    }
    case "removeTags": {
      const names: string[] = Array.isArray(body?.tags)
        ? body.tags.filter((t: unknown) => typeof t === "string")
        : [];
      if (!names.length) return badRequest("tags 必填");
      await prisma.photoTag.deleteMany({
        where: { photoId: { in: photoIds }, tag: { name: { in: names } } },
      });
      break;
    }
    default:
      return badRequest("未知 action");
  }
  return json({ ok: true });
}
