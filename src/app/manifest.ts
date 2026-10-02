import type { MetadataRoute } from "next";
import { getSettings } from "@/lib/settings";

/**
 * PWA manifest（App Router 约定路由 /manifest.webmanifest）。
 * 站名动态取 settings；图标是静态产物（scripts/gen-pwa-icons.mts 生成，
 * 换 logo 后重跑并提交）。maskable 单列，避免系统裁切伤 logo。
 */
export default async function manifest(): Promise<MetadataRoute.Manifest> {
  const settings = await getSettings().catch(() => null);
  const name = settings?.siteTitle || "soloGallery";
  return {
    name,
    short_name: name.slice(0, 12),
    description: "个人摄影画廊",
    start_url: "/",
    scope: "/",
    display: "standalone",
    background_color: "#121212",
    theme_color: "#121212",
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icon-512-maskable.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
