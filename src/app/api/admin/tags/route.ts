import { NextRequest } from "next/server";
import { badRequest, guardAdmin, json } from "@/lib/api";
import { prisma } from "@/lib/db";
import { listTags } from "@/lib/queries";

export const runtime = "nodejs";

export async function GET() {
  const denied = await guardAdmin();
  if (denied) return denied;
  return json({ items: await listTags(false) });
}

export async function POST(request: NextRequest) {
  const denied = await guardAdmin();
  if (denied) return denied;
  const body = await request.json().catch(() => null);
  const name = typeof body?.name === "string" ? body.name.trim().slice(0, 64) : "";
  if (!name) return badRequest("name 必填");
  const tag = await prisma.tag.upsert({ where: { name }, update: {}, create: { name } });
  return json({ ok: true, tag });
}
