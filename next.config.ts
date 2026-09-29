import type { NextConfig } from "next";

/** 图片直连 MinIO，CSP 的 img-src 需放行其 origin；未配置时退回 https: */
function minioOrigin(): string {
  const base = process.env.MINIO_PUBLIC_BASE_URL;
  if (!base) return "https:";
  try {
    return new URL(base).origin;
  } catch {
    return "https:";
  }
}

/** 地图瓦片也是 <img> 加载，img-src 同样需放行瓦片域名，否则瓦片被 CSP 静默拦截、
 *  地图只剩灰底（Leaflet 对瓦片加载失败不抛错）。从 MAP_TILE_URL 推导，保持与
 *  map 页同一配置源；{s} 展开成多台主机，取父域通配（webrd0{s}.is.autonavi.com
 *  → https://*.is.autonavi.com）。默认值与 map/page.tsx 的高德瓦片一致 */
function tileImgSrc(): string {
  const template = process.env.MAP_TILE_URL ?? "https://webrd0{s}.is.autonavi.com/appmaptile";
  const hasSubdomainToken = template.includes("{s}");
  try {
    const { protocol, hostname, origin } = new URL(template.replace("{s}", "1"));
    if (hasSubdomainToken) return `${protocol}//*.${hostname.split(".").slice(1).join(".")}`;
    return origin;
  } catch {
    return "https://*.is.autonavi.com";
  }
}

// script-src 保留 'unsafe-inline'：App Router 的 RSC flight 数据以内联 script 下发，
// 去掉会直接白屏。其余指令按最小放行收紧。
const csp = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline'",
  "style-src 'self' 'unsafe-inline'",
  `img-src 'self' data: blob: ${minioOrigin()} ${tileImgSrc()}`,
  "font-src 'self'",
  "connect-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "frame-ancestors 'none'",
  "form-action 'self'",
].join("; ");

const securityHeaders = [
  { key: "Content-Security-Policy", value: csp },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
  { key: "Strict-Transport-Security", value: "max-age=31536000; includeSubDomains" },
];

const nextConfig: NextConfig = {
  // dev 服务自报 localhost，用 127.0.0.1 访问时会被跨域保护拦截，
  // 导致客户端水合不启动（页面无任何交互）；生产模式不受影响
  allowedDevOrigins: ["127.0.0.1"],
  // 仅生产下发：dev 下 CSP 会打断 HMR 的 eval 与 websocket；
  // dev 必须返回空路由列表 —— 返回 headers:[] 的路由会被 Next 校验拒绝（Invalid header found）而无法启动
  async headers() {
    if (process.env.NODE_ENV !== "production") return [];
    return [
      {
        source: "/:path*",
        headers: securityHeaders,
      },
    ];
  },
};

export default nextConfig;
