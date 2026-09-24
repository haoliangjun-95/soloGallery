import type { MetadataRoute } from "next";
import { siteUrl } from "@/lib/config";
import { prisma } from "@/lib/db";
import { listCategories, listTags } from "@/lib/queries";

export const dynamic = "force-dynamic";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = siteUrl();
  const [photos, categories, tags] = await Promise.all([
    prisma.photo
      .findMany({
        where: { published: true, missing: false },
        select: { sha1: true, updatedAt: true },
        take: 5000,
        orderBy: { updatedAt: "desc" },
      })
      .catch(() => []),
    // count=0 的列表页不提交（空页面收录无意义，还可能被判定为低质）
    listCategories().then((cs) => cs.filter((c) => c.count > 0)).catch(() => []),
    listTags().then((ts) => ts.filter((t) => t.count > 0)).catch(() => []),
  ]);
  return [
    { url: base, lastModified: new Date() },
    // 分类/标签列表页：内容随照片库周级变化，优先级低于照片详情页。
    // slug/name 可能含中文（slugify 保留 \p{L}），必须 percent-encode——Next 的
    // sitemap 序列化器把 url 原样插进 <loc>，不做 URL 归一化转义
    ...categories.map((c) => ({
      url: `${base}/category/${encodeURIComponent(c.slug)}`,
      changeFrequency: "weekly" as const,
      priority: 0.6,
    })),
    ...tags.map((t) => ({
      url: `${base}/tag/${encodeURIComponent(t.name)}`,
      changeFrequency: "weekly" as const,
      priority: 0.5,
    })),
    ...photos.map((p) => ({
      url: `${base}/photo/${p.sha1}`,
      lastModified: p.updatedAt,
    })),
  ];
}
