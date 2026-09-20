import { NextRequest } from "next/server";
import { badRequest, guardAdmin, json } from "@/lib/api";
import { prisma } from "@/lib/db";
import { listCategories } from "@/lib/queries";

export const runtime = "nodejs";

function slugify(name: string): string {
  const slug = name
    .trim()
    .toLowerCase()
    .replace(/[\s_/]+/g, "-")
    .replace(/[^\p{L}\p{N}-]+/gu, "")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
  return slug || `cat-${Date.now().toString(36)}`;
}

export async function GET() {
  const denied = await guardAdmin();
  if (denied) return denied;
  return json({ items: await listCategories(false) });
}

export async function POST(request: NextRequest) {
  const denied = await guardAdmin();
  if (denied) return denied;
  const body = await request.json().catch(() => null);
  const name = typeof body?.name === "string" ? body.name.trim() : "";
  if (!name) return badRequest("name 必填");
  const sortOrder = Number.isInteger(body?.sortOrder) ? body.sortOrder : 0;
  const category = await prisma.category.upsert({
    where: { slug: slugify(name) },
    update: {},
    create: { name, slug: slugify(name), sortOrder },
  });
  return json({ ok: true, category });
}
