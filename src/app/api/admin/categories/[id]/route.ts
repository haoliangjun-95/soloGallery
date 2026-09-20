import { NextRequest } from "next/server";
import { badRequest, guardAdmin, json } from "@/lib/api";
import { prisma } from "@/lib/db";

export const runtime = "nodejs";

type Params = { params: Promise<{ id: string }> };

export async function PATCH(request: NextRequest, { params }: Params) {
  const denied = await guardAdmin();
  if (denied) return denied;
  const { id } = await params;
  const categoryId = Number(id);
  if (!Number.isInteger(categoryId)) return badRequest("非法 id");
  const body = await request.json().catch(() => null);

  const data: Record<string, unknown> = {};
  if (typeof body?.name === "string" && body.name.trim()) data.name = body.name.trim().slice(0, 128);
  if (Number.isInteger(body?.sortOrder)) data.sortOrder = body.sortOrder;
  if (body?.coverPhotoId === null || Number.isInteger(body?.coverPhotoId)) data.coverPhotoId = body.coverPhotoId;

  const category = await prisma.category.update({ where: { id: categoryId }, data });
  return json({ ok: true, category });
}

export async function DELETE(_request: NextRequest, { params }: Params) {
  const denied = await guardAdmin();
  if (denied) return denied;
  const { id } = await params;
  const categoryId = Number(id);
  if (!Number.isInteger(categoryId)) return badRequest("非法 id");
  // 分类下的照片 categoryId 置空（schema onDelete: SetNull），照片保留
  await prisma.category.delete({ where: { id: categoryId } });
  return json({ ok: true });
}
