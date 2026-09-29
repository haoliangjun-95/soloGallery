import { NextRequest } from "next/server";
import { json } from "@/lib/api";
import { parseYear } from "@/lib/filter-url";
import { listPhotos } from "@/lib/queries";
import { clientIp, rateAllow } from "@/lib/ratelimit";

export const runtime = "nodejs";

/** 公开只读端点无限流则翻页可直连 DB —— 每分钟 120 次对无限滚动+预取绰绰有余 */
const RATE_LIMIT = 120;
const RATE_WINDOW_MS = 60 * 1000;

export async function GET(request: NextRequest) {
  if (!rateAllow(`photos:${clientIp(request.headers)}`, RATE_LIMIT, RATE_WINDOW_MS)) {
    return json({ error: "请求过于频繁，请稍后再试" }, 429);
  }
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
    // 器材筛选（功能 3）：与 q 同款原样透传，buildListWhere 内 parseGearParam 兜底清洗
    make: sp.get("make") ?? undefined,
    model: sp.get("model") ?? undefined,
    lens: sp.get("lens") ?? undefined,
  });
  return json(result);
}
