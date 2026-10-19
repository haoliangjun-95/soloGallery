import type { MetadataRoute } from "next";
import { siteUrl } from "@/lib/config";

// 2026-10 爬虫治理：GPTBot 单 IP 15.7 万次穷举筛选参数组合 URL（category × lens ×
// make × tag × year 笛卡尔积），meta-externalagent 全段扫站。此处对训练/采集类爬虫
// 声明式拒绝（对遵守 robots 的爬虫生效）；nginx UA 拦截是立即生效的第二道保险，
// 两份名单保持同步（服务器配置存档见 deploy/nginx/）。
const deniedAgents = [
  "GPTBot", // OpenAI 训练
  "ChatGPT-User", // ChatGPT 用户实时检索
  "OAI-SearchBot", // ChatGPT 搜索
  "ClaudeBot", // Anthropic 训练
  "Claude-User",
  "Claude-SearchBot",
  "CCBot", // Common Crawl
  "Bytespider", // 字节（对 robots 遵守度差，主要靠 nginx 拦）
  "Google-Extended", // Gemini 训练（不影响 Googlebot 搜索收录）
  "Amazonbot",
  "meta-externalagent", // Meta AI 采集（2026-10 实测 57.141.18.0/24 全段）
  "Applebot-Extended", // Apple 训练（不影响 Applebot 搜索）
  "ImagesiftBot",
  "PerplexityBot",
  "Diffbot",
];

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      { userAgent: deniedAgents, disallow: "/" },
      {
        userAgent: "*",
        // /*? 挡参数组合 URL——筛选页的正常入口是侧栏链接与 sitemap 里的干净 URL，
        // 爬虫沿 <a href="/?category=…&lens=…"> 展开组合空间是本次 15.7 万请求的直接成因；
        // /api/ 是浏览器数据接口，不是页面，喂给爬虫只消耗 DB
        disallow: ["/api/", "/*?"],
        allow: "/",
      },
    ],
    sitemap: `${siteUrl()}/sitemap.xml`,
  };
}
