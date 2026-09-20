import { NextRequest } from "next/server";
import { badRequest, guardAdmin, json } from "@/lib/api";
import { prisma } from "@/lib/db";

export const runtime = "nodejs";

type Params = { params: Promise<{ id: string }> };

export async function PATCH(request: NextRequest, { params }: Params) {
  const denied = await guardAdmin();
  if (denied) return denied;
  const { id } = await params;
  const tagId = Number(id);
  if (!Number.isInteger(tagId)) return badRequest("非法 id");
  const body = await request.json().catch(() => null);
  const name = typeof body?.name === "string" ? body.name.trim().slice(0, 64) : "";
  if (!name) return badRequest("name 必填");
  const tag = await prisma.tag.update({ where: { id: tagId }, data: { name } });
  return json({ ok: true, tag });
}

export async function DELETE(_request: NextRequest, { params }: Params) {
  const denied = await guardAdmin();
  if (denied) return denied;
  const { id } = await params;
  const tagId = Number(id);
  if (!Number.isInteger(tagId)) return badRequest("非法 id");
  await prisma.tag.delete({ where: { id: tagId } });
  return json({ ok: true });
}
