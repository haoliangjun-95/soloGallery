import { siteUrl } from "@/lib/config";
import { formatAperture, formatCamera, formatShotDateShort } from "@/lib/exif-format";
import { buildRssFeed, type FeedItem } from "@/lib/feed";
import { listPhotos } from "@/lib/queries";
import { getSettings } from "@/lib/settings";
import type { PhotoCardDTO } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** feed 条目数：一页首屏量级足够订阅器判断更新，全量输出交给 sitemap */
const FEED_LIMIT = 20;

/** 条目摘要：拍摄日期 · 机身 · 镜头 · 焦段 · 光圈（与详情页 metaDescription 同一套 exif-format 纯函数） */
function itemDescription(p: PhotoCardDTO): string {
  const exif = p.exif;
  const bits = [
    formatShotDateShort(p.shotAt ?? exif?.shotAt),
    formatCamera(exif?.make, exif?.model),
    exif?.lensModel,
    exif?.focalLength !== undefined ? `${Math.round(exif.focalLength)}mm` : null,
    formatAperture(exif?.fNumber),
  ].filter(Boolean);
  return bits.join(" · ");
}

export async function GET(): Promise<Response> {
  const base = siteUrl();
  // 复用首页默认列表序（shotAt desc, createdAt desc）：feed 顺序 = 网站首页顺序
  const [settings, { items }] = await Promise.all([
    getSettings(),
    listPhotos({ pageSize: FEED_LIMIT }),
  ]);

  const feedItems: FeedItem[] = items.map((p) => ({
    guid: p.sha1,
    title: p.title,
    link: `${base}/photo/${p.sha1}`,
    description: itemDescription(p) || undefined,
    // shotAt 缺失或异常时无 pubDate——RSS 2.0 中该元素可选，订阅器按发现时间处理
    pubDate: p.shotAt ? new Date(p.shotAt) : undefined,
    imageUrl: p.thumbUrl,
  }));

  const xml = buildRssFeed(
    {
      title: settings.siteTitle,
      description: `${settings.siteTitle} · 最新照片更新`,
      siteUrl: base,
      feedUrl: `${base}/feed.xml`,
    },
    feedItems,
    new Date(),
  );

  return new Response(xml, {
    headers: {
      "Content-Type": "application/rss+xml; charset=utf-8",
      // feed 非实时数据：允许中间缓存 1 小时，降低订阅器高频轮询的 DB 压力
      "Cache-Control": "public, max-age=3600",
    },
  });
}
