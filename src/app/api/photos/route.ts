import { NextRequest } from "next/server";
import { json } from "@/lib/api";
import { listPhotos } from "@/lib/queries";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const sp = request.nextUrl.searchParams;
  const year = Number(sp.get("year"));
  const result = await listPhotos({
    page: Number(sp.get("page") ?? 1) || 1,
    categorySlug: sp.get("category") ?? undefined,
    tag: sp.get("tag") ?? undefined,
    year: Number.isInteger(year) && year > 1970 && year < 9999 ? year : undefined,
    q: sp.get("q") ?? undefined,
    favorite: sp.get("fav") === "1",
  });
  return json(result);
}
