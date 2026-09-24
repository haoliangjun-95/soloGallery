import { NextRequest } from "next/server";
import { badRequest, guardAdmin, isPrismaNotFound, json } from "@/lib/api";
import { displayKey, GRID_WIDTHS, gridKey } from "@/lib/bucket-layout";
import { prisma } from "@/lib/db";
import { createLogger } from "@/lib/logger";
import { deleteKey } from "@/lib/s3";

export const runtime = "nodejs";

const logger = createLogger("photo");

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

  try {
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
  } catch (err) {
    // 目标图片已被其他人删除：返回 404 让前端刷新列表，而不是 500
    if (isPrismaNotFound(err)) return json({ error: "图片不存在" }, 404);
    throw err;
  }
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

  try {
    await prisma.photo.delete({ where: { id: photoId } });
  } catch (err) {
    // findUnique 与 delete 之间被并发删掉：视为已删除，幂等返回
    if (isPrismaNotFound(err)) return json({ ok: true, deleted: false });
    throw err;
  }

  // 画廊资产：display 一定清理；原图/缩略图属壁纸软件，仅 UPLOAD 来源且明确要求 purge 时删原图
  await deleteKey(displayKey(photo.sha1)).catch((err) => logger.warn("删除 display 失败", err));
  // 网格变体同为画廊自有资产、同在 display/ 匿名读前缀（评审 H-1：不清理则删除后
  // 确定性 URL 仍可取回已删内容）。无条件逐档删——DELETE 不存在的键是 no-op，
  // 顺带自愈全或无上传失败留下的孤儿档（gridReady=false 但单档已入桶）
  for (const w of GRID_WIDTHS) {
    await deleteKey(gridKey(photo.sha1, w)).catch((err) => logger.warn("删除 grid 变体失败", err));
  }
  if (purge && photo.source === "UPLOAD") {
    await deleteKey(photo.storageKey).catch(() => undefined);
  }
  return json({ ok: true, deleted: true });
}
