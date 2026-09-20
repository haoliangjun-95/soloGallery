import { NextRequest } from "next/server";
import { json } from "@/lib/api";
import { listPhotos } from "@/lib/queries";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const sp = request.nextUrl.searchParams;
  const result = await listPhotos({
    page: Number(sp.get("page") ?? 1) || 1,
    categorySlug: sp.get("category") ?? undefined,
    tag: sp.get("tag") ?? undefined,
  });
  return json(result);
}
