import { NextRequest } from "next/server";
import { json } from "@/lib/api";
import { parseYear } from "@/lib/filter-url";
import { listPhotos } from "@/lib/queries";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const sp = request.nextUrl.searchParams;
  const result = await listPhotos({
    page: Number(sp.get("page") ?? 1) || 1,
    categorySlug: sp.get("category") ?? undefined,
    tag: sp.get("tag") ?? undefined,
    // 与首页/详情页同源校验（1971..9998），loadMore 后续页与首屏筛选语义恒一致
    year: parseYear(sp.get("year") ?? undefined),
    q: sp.get("q") ?? undefined,
    favorite: sp.get("fav") === "1",
    month: sp.get("month") ?? undefined,
  });
  return json(result);
}
