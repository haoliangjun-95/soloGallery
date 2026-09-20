import { NextRequest } from "next/server";
import { badRequest, guardAdmin, json } from "@/lib/api";
import { displayKey } from "@/lib/bucket-layout";
import { prisma } from "@/lib/db";
import { deleteKey } from "@/lib/s3";

export const runtime = "nodejs";

type Params = { params: Promise<{ id: string }> };

export async function GET(_request: NextRequest, { params }: Params) {
  const denied = await guardAdmin();
  if (denied) return denied;
  const { id } = await params;
  const photoId = Number(id);
  if (!Number.isInteger(photoId)) return badRequest("非法 id");
  const photo = await prisma.photo.findUnique({
    where: { id: photoId },
    select: { description: true, categoryId: true, photoTags: { select: { tag: { select: { name: true } } } } },
  });
  if (!photo) return json({ error: "不存在" }, 404);
  return json({
    description: photo.description,
    categoryId: photo.categoryId,
    tags: photo.photoTags.map((pt) => pt.tag.name),
  });
}

export async function PATCH(request: NextRequest, { params }: Params) {
  const denied = await guardAdmin();
  if (denied) return denied;
  const { id } = await params;
  const photoId = Number(id);
  if (!Number.isInteger(photoId)) return badRequest("非法 id");

  const body = await request.json().catch(() => null);
  if (!body || typeof body !== "object") return badRequest("非法请求体");

  const data: Record<string, unknown> = {};
  if (typeof body.published === "boolean") data.published = body.published;
  if (typeof body.favorite === "boolean") data.favorite = body.favorite;
  if (typeof body.title === "string") data.title = body.title.slice(0, 255);
  if (typeof body.description === "string") data.description = body.description.slice(0, 5000);
  if (body.categoryId === null) data.categoryId = null;
  else if (Number.isInteger(body.categoryId)) data.categoryId = body.categoryId;

  let tagsReplace: string[] | null = null;
  if (Array.isArray(body.tags)) {
    tagsReplace = body.tags
      .filter((t: unknown): t is string => typeof t === "string" && t.trim().length > 0)
      .map((t: string) => t.trim().slice(0, 64));
  }

  const photo = await prisma.$transaction(async (tx) => {
    const updated = await tx.photo.update({ where: { id: photoId }, data });
    if (tagsReplace) {
      await tx.photoTag.deleteMany({ where: { photoId } });
      for (const name of tagsReplace) {
        const tag = await tx.tag.upsert({ where: { name }, update: {}, create: { name } });
        await tx.photoTag.create({ data: { photoId, tagId: tag.id } });
      }
    }
    return updated;
  });

  return json({ ok: true, photo: { id: photo.id, published: photo.published, title: photo.title } });
}

export async function DELETE(request: NextRequest, { params }: Params) {
  const denied = await guardAdmin();
  if (denied) return denied;
  const { id } = await params;
  const photoId = Number(id);
  if (!Number.isInteger(photoId)) return badRequest("非法 id");

  const purge = request.nextUrl.searchParams.get("purge") === "true";
  const photo = await prisma.photo.findUnique({ where: { id: photoId } });
  if (!photo) return json({ ok: true, deleted: false });

  await prisma.photo.delete({ where: { id: photoId } });

  // 画廊资产：display 一定清理；原图/缩略图属壁纸软件，仅 UPLOAD 来源且明确要求 purge 时删原图
  await deleteKey(displayKey(photo.sha1)).catch((err) =>
    console.warn("[photo] 删除 display 失败:", err instanceof Error ? err.message : err),
  );
  if (purge && photo.source === "UPLOAD") {
    await deleteKey(photo.storageKey).catch(() => undefined);
  }
  return json({ ok: true, deleted: true });
}
