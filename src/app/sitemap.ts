import type { MetadataRoute } from "next";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = (process.env.SITE_URL ?? "http://localhost:3000").replace(/\/+$/, "");
  const photos = await prisma.photo
    .findMany({
      where: { published: true, missing: false },
      select: { sha1: true, updatedAt: true },
      take: 5000,
      orderBy: { updatedAt: "desc" },
    })
    .catch(() => []);
  return [
    { url: base, lastModified: new Date() },
    ...photos.map((p) => ({
      url: `${base}/photo/${p.sha1}`,
      lastModified: p.updatedAt,
    })),
  ];
}
